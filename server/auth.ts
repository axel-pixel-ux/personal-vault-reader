import { Router, Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { UAParser } from 'ua-parser-js';
import { z } from 'zod';
import { pool } from './db.ts';

const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production.');
}
// En dev, secret éphémère si absent (les access tokens expirent au redémarrage,
// mais les refresh tokens en base restent valides).
const JWT_SECRET = process.env.JWT_SECRET ?? crypto.randomBytes(32).toString('hex');

const ACCESS_TTL = '10m';
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const GRACE_MS = 10_000; // tolérance pour les rafraîchissements concurrents (onglets)
const COOKIE = 'refresh_token';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

const cookieOpts = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'strict' as const,
  path: '/auth',
  maxAge: REFRESH_TTL_MS,
};
const clearOpts = { path: '/auth', httpOnly: true, secure: IS_PROD, sameSite: 'strict' as const };

const signAccess = (userId: string, sid: string) =>
  jwt.sign({ sub: userId, sid }, JWT_SECRET, { expiresIn: ACCESS_TTL });

function deviceName(req: Request) {
  const r = new UAParser(req.headers['user-agent']).getResult();
  return `${r.browser.name ?? 'Navigateur'} sur ${r.os.name ?? 'appareil inconnu'}`;
}

async function createSession(req: Request, res: Response, userId: string) {
  const token = newToken();
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, device_name, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + $6 * interval '1 millisecond') RETURNING id`,
    [userId, sha256(token), deviceName(req), req.headers['user-agent'] ?? null, req.ip ?? null, REFRESH_TTL_MS],
  );
  res.cookie(COOKIE, token, cookieOpts);
  return { accessToken: signAccess(userId, rows[0].id as string) };
}

// ---------- Middleware ----------
export interface AuthedRequest extends Request {
  userId: string;
  sessionId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET) as { sub: string; sid: string };
    const { rowCount } = await pool.query(
      `SELECT 1 FROM sessions
        WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > now()`,
      [p.sid, p.sub],
    );
    if (!rowCount) return res.status(401).json({ error: 'session_revoked' });
    (req as AuthedRequest).userId = p.sub;
    (req as AuthedRequest).sessionId = p.sid;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// Défense CSRF supplémentaire : JSON uniquement sur les routes qui utilisent le cookie
export const jsonOnly = (req: Request, res: Response, next: NextFunction) =>
  req.is('application/json') ? next() : res.status(415).json({ error: 'json_required' });

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const creds = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(200),
});

// hash factice : égalise le temps de réponse quand l'email est inconnu
const DUMMY_HASH = await argon2.hash('dummy-password', { type: argon2.argon2id });

export const auth = Router();

auth.post('/register', limiter, jsonOnly, async (req, res) => {
  const parsed = creds.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const { email, password } = parsed.data;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id',
      [email, hash],
    );
    const { accessToken } = await createSession(req, res, rows[0].id);
    res.status(201).json({ accessToken });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_taken' });
    throw e;
  }
});

auth.post('/login', limiter, jsonOnly, async (req, res) => {
  const parsed = creds.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_credentials' });
  const { email, password } = parsed.data;
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email=$1', [email]);
  const user = rows[0];
  const ok = await argon2.verify(user?.password_hash ?? DUMMY_HASH, password);
  if (!user || !ok) return res.status(401).json({ error: 'bad_credentials' });
  const { accessToken } = await createSession(req, res, user.id);
  res.json({ accessToken });
});

auth.post('/refresh', jsonOnly, async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'no_refresh' });
  const h = sha256(token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id, token_hash, rotated_at
         FROM sessions
        WHERE (token_hash=$1 OR prev_token_hash=$1) AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [h],
    );
    const s = rows[0];
    if (!s) {
      await client.query('ROLLBACK');
      res.clearCookie(COOKIE, clearOpts);
      return res.status(401).json({ error: 'invalid_refresh' });
    }

    if (s.token_hash !== h) {
      // Un ancien token est présenté
      const recent = Date.now() - new Date(s.rotated_at).getTime() < GRACE_MS;
      if (!recent) {
        // Rejeu hors fenêtre de grâce : vol probable, on révoque la session
        await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [s.id]);
        await client.query('COMMIT');
        res.clearCookie(COOKIE, clearOpts);
        return res.status(401).json({ error: 'token_reuse_detected' });
      }
      // Course entre onglets : l'autre onglet a déjà tourné le token, on réessaie
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'retry' });
    }

    const next = newToken();
    await client.query(
      `UPDATE sessions
          SET prev_token_hash=token_hash, token_hash=$2, rotated_at=now(), last_used_at=now(), ip=$3
        WHERE id=$1`,
      [s.id, sha256(next), req.ip ?? null],
    );
    await client.query('COMMIT');
    res.cookie(COOKIE, next, cookieOpts);
    res.json({ accessToken: signAccess(s.user_id, s.id) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

auth.post('/logout', jsonOnly, async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [sha256(token)]);
  }
  res.clearCookie(COOKIE, clearOpts);
  res.status(204).end();
});

// ---------- Profil de coffre (prénom + clé), un seul par compte ----------
// La clé du coffre est chiffrée côté serveur (AES-256-GCM, clé VAULT_KEK) puis remise
// à toute session authentifiée du compte : plus de code à retaper sur les autres appareils.
if (IS_PROD && !/^[0-9a-f]{64}$/i.test(process.env.VAULT_KEK ?? '')) {
  throw new Error('VAULT_KEK (64 caractères hexadécimaux) est obligatoire en production.');
}
const KEK = process.env.VAULT_KEK
  ? Buffer.from(process.env.VAULT_KEK, 'hex')
  : crypto.createHash('sha256').update('dev-only-kek').digest();

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEK, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function open(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEK, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

const b64 = z.string().max(4096).regex(/^[A-Za-z0-9+/=]+$/);
const vaultBody = z.object({
  username: z.string().trim().min(2).max(60),
  key: b64,
  config: z.object({
    username: z.string().trim().min(2).max(60),
    salt: b64,
    verifierSalt: b64,
    verifierHash: z.string().max(128),
    canaryIv: b64,
    canaryCipher: b64,
    iterations: z.number().int().positive().max(10_000_000),
    createdAt: z.number(),
    customCategories: z.array(z.string().max(60)).max(100).optional(),
  }),
});

auth.get('/vault', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { rows } = await pool.query('SELECT payload FROM vault_profiles WHERE user_id=$1', [userId]);
  res.set('Cache-Control', 'no-store');
  res.json({ userId, profile: rows[0] ? JSON.parse(open(rows[0].payload)) : null });
});

// Premier arrivé, premier servi : 409 si le compte a déjà un profil.
auth.put('/vault', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const parsed = vaultBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const r = await pool.query(
    'INSERT INTO vault_profiles (user_id, payload) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',
    [userId, seal(JSON.stringify(parsed.data))],
  );
  if (!r.rowCount) return res.status(409).json({ error: 'vault_exists' });
  res.status(201).end();
});

// Synchronisation des catégories et sous-catégories (+ réaffectation des livres Drive si suppression)
const patchCategoriesBody = z.object({
  customCategories: z.array(z.string().trim().min(1).max(120)).max(200),
  deletedCategory: z.string().trim().max(120).optional(),
  fallbackCategory: z.string().trim().max(120).optional(),
});

auth.patch('/vault/categories', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const parsed = patchCategoriesBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const { rows } = await pool.query('SELECT payload FROM vault_profiles WHERE user_id=$1', [userId]);
  if (rows[0]) {
    try {
      const profile = JSON.parse(open(rows[0].payload));
      if (profile?.config) {
        profile.config.customCategories = parsed.data.customCategories;
        await pool.query('UPDATE vault_profiles SET payload=$2 WHERE user_id=$1', [
          userId,
          seal(JSON.stringify(profile)),
        ]);
      }
    } catch {
      // Ignorer
    }
  }

  if (parsed.data.deletedCategory && parsed.data.fallbackCategory) {
    await pool.query(
      `UPDATE drive_books
          SET category = $3
        WHERE user_id = $1
          AND (category = $2 OR category LIKE ($2 || ' / %'))`,
      [userId, parsed.data.deletedCategory, parsed.data.fallbackCategory],
    );
  }
  res.status(204).end();
});

// Réinitialisation volontaire du coffre (le compte peut redéfinir prénom + code)
auth.delete('/vault', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  await pool.query('DELETE FROM vault_profiles WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM drive_folders WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM drive_books WHERE user_id=$1', [userId]);
  res.status(204).end();
});

// ---------- Gestion des appareils ----------
auth.get('/sessions', requireAuth, async (req, res) => {
  const { userId, sessionId } = req as AuthedRequest;
  const { rows } = await pool.query(
    `SELECT id, device_name, host(ip) AS ip, created_at, last_used_at
       FROM sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_used_at DESC`,
    [userId],
  );
  res.json(rows.map((r) => ({ ...r, current: r.id === sessionId })));
});

auth.delete('/sessions/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
  res.status(204).end();
});

// DELETE /auth/sessions            → déconnecte tous les appareils
// DELETE /auth/sessions?others=1   → déconnecte tous sauf l'appareil courant
auth.delete('/sessions', requireAuth, async (req, res) => {
  const { userId, sessionId } = req as AuthedRequest;
  const others = req.query.others === '1';
  await pool.query(
    `UPDATE sessions SET revoked_at=now()
      WHERE user_id=$1 AND revoked_at IS NULL AND ($2::boolean IS NOT TRUE OR id <> $3)`,
    [userId, others, sessionId],
  );
  if (!others) res.clearCookie(COOKIE, clearOpts);
  res.status(204).end();
});
