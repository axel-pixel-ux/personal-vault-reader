import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { UAParser } from 'ua-parser-js';
import { z } from 'zod';
import { pool } from './db.ts';
import { isMailConfigured, sendPasswordResetMail } from './mailer.ts';

// Hachage cryptographique sécurisé scrypt natif Node.js (RFC 7914 / OWASP)
// 100% stable en environnement conteneurisé (évite les crashs mémoire / SIGSEGV des modules C++ externes)
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return Promise.resolve(false);
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return Promise.resolve(false);
  const salt = parts[1];
  const expectedHex = parts[2];
  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const expectedBuf = Buffer.from(expectedHex, 'hex');
        const match = crypto.timingSafeEqual(expectedBuf, derivedKey);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}

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

// Hash factice scrypt précalculé : égalise le temps de réponse quand l'email est inconnu
const DUMMY_HASH =
  'scrypt:00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export const auth = Router();

auth.post('/register', limiter, jsonOnly, async (req, res) => {
  try {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const { email, password } = parsed.data;
    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id',
      [email, hash],
    );
    const { accessToken } = await createSession(req, res, rows[0].id);
    res.status(201).json({ accessToken });
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: 'email_taken' });
    console.error('[auth] Erreur inscription:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

auth.post('/login', limiter, jsonOnly, async (req, res) => {
  try {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_credentials' });
    const { email, password } = parsed.data;
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email=$1', [email]);
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'bad_credentials' });
    const { accessToken } = await createSession(req, res, user.id);
    res.json({ accessToken });
  } catch (e: any) {
    console.error('[auth] Erreur connexion:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ---------- Mot de passe oublié ----------
const RESET_TTL_MS = 60 * 60 * 1000;
const resetLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

function publicOrigin(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') return process.env.APP_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
  return `${proto}://${host}`;
}

auth.post('/forgot-password', resetLimiter, jsonOnly, async (req, res) => {
  try {
    const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    if (!isMailConfigured()) {
      return res.status(503).json({ error: 'smtp_not_configured' });
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [parsed.data.email]);
    if (rows[0]) {
      const token = newToken();
      await pool.query('DELETE FROM password_resets WHERE user_id=$1', [rows[0].id]);
      await pool.query(
        `INSERT INTO password_resets (token_hash, user_id, expires_at)
         VALUES ($1,$2, now() + $3 * interval '1 millisecond')`,
        [sha256(token), rows[0].id, RESET_TTL_MS],
      );
      const link = `${publicOrigin(req)}/reader?reset=${encodeURIComponent(token)}`;
      await sendPasswordResetMail(parsed.data.email, link);
    }
    res.status(204).end();
  } catch (e: any) {
    console.error('[auth] Erreur mot de passe oublié:', e);
    if (e?.message === 'smtp_not_configured') {
      return res.status(503).json({ error: 'smtp_not_configured' });
    }
    res.status(502).json({ error: 'smtp_send_failed' });
  }
});

auth.post('/reset-password', resetLimiter, jsonOnly, async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(20).max(200), password: z.string().min(10).max(200) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT user_id FROM password_resets
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256(parsed.data.token)],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalid_or_expired_token' });
    }
    const hash = await hashPassword(parsed.data.password);
    await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [rows[0].user_id, hash]);
    await client.query('UPDATE password_resets SET used_at=now() WHERE token_hash=$1', [sha256(parsed.data.token)]);
    // Toutes les sessions existantes sont révoquées
    await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [rows[0].user_id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] Erreur réinitialisation mot de passe:', e);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
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
  if (buf.length < 28) throw new Error('invalid_sealed_payload');
  const d = crypto.createDecipheriv('aes-256-gcm', KEK, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function tryOpen(b64: string): string | null {
  try {
    return open(b64);
  } catch {
    return null;
  }
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
  try {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query('SELECT payload FROM vault_profiles WHERE user_id=$1', [userId]);
    res.set('Cache-Control', 'no-store');
    let profile = null;
    if (rows[0]?.payload) {
      const raw = tryOpen(rows[0].payload);
      if (raw) {
        try {
          profile = JSON.parse(raw);
        } catch {
          profile = null;
        }
      }
    }
    res.json({ userId, profile });
  } catch (err) {
    console.error('[auth] Erreur lecture profil vault:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Enregistrer ou mettre à jour le profil chiffré du coffre
auth.put('/vault', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const parsed = vaultBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    await pool.query(
      'INSERT INTO vault_profiles (user_id, payload) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload',
      [userId, seal(JSON.stringify(parsed.data))],
    );
    res.status(200).end();
  } catch (err) {
    console.error('[auth] Erreur sauvegarde profil vault:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Synchronisation des catégories et sous-catégories (+ réaffectation des livres Drive si suppression)
const patchCategoriesBody = z.object({
  customCategories: z.array(z.string().trim().min(1).max(120)).max(200),
  deletedCategory: z.string().trim().max(120).optional(),
  fallbackCategory: z.string().trim().max(120).optional(),
});

auth.patch('/vault/categories', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const parsed = patchCategoriesBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const { rows } = await pool.query('SELECT payload FROM vault_profiles WHERE user_id=$1', [userId]);
    if (rows[0]) {
      try {
        const raw = tryOpen(rows[0].payload);
        if (raw) {
          const profile = JSON.parse(raw);
          if (profile?.config) {
            profile.config.customCategories = parsed.data.customCategories;
            await pool.query('UPDATE vault_profiles SET payload=$2 WHERE user_id=$1', [
              userId,
              seal(JSON.stringify(profile)),
            ]);
          }
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
      await pool.query(
        `UPDATE vault_books
            SET category = $3
          WHERE user_id = $1
            AND (category = $2 OR category LIKE ($2 || ' / %'))`,
        [userId, parsed.data.deletedCategory, parsed.data.fallbackCategory],
      );
    }
    res.status(204).end();
  } catch (err) {
    console.error('[auth] Erreur mise à jour catégories:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Réinitialisation volontaire du coffre (le compte peut redéfinir prénom + code)
auth.delete('/vault', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  await pool.query('DELETE FROM vault_profiles WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM drive_folders WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM drive_books WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM vault_books WHERE user_id=$1', [userId]);
  try {
    const userDir = path.join(
      process.env.VAULT_STORAGE_DIR || path.join(process.cwd(), 'data', 'vault-files'),
      userId,
    );
    await fsp.rm(userDir, { recursive: true, force: true });
  } catch {
    // Ignorer si déjà absent
  }
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
