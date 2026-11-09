import express, { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool } from './db.ts';
import { AuthedRequest, jsonOnly, requireAuth } from './auth.ts';
import { VAULT_STORAGE_DIR } from './books.ts';

export const etudes = Router();

const SUPPORTED_FORMATS = ['txt', 'md', 'pdf', 'epub'] as const;
const ETUDES_STORAGE_DIR = path.join(VAULT_STORAGE_DIR, 'etudes');
fs.mkdirSync(ETUDES_STORAGE_DIR, { recursive: true });

function resolveVersionFilePath(
  userId: string,
  versionId: string,
): { absPath: string; relPath: string } {
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(versionId).success
  ) {
    throw new Error('invalid_identifier');
  }
  const relPath = path.join(userId, `${versionId}.enc`);
  const absPath = path.join(ETUDES_STORAGE_DIR, relPath);
  if (!absPath.startsWith(ETUDES_STORAGE_DIR + path.sep)) {
    throw new Error('path_traversal_blocked');
  }
  return { absPath, relPath };
}

function rowToVersion(r: any) {
  return {
    id: r.id,
    articleId: r.article_id,
    versionLabel: r.version_label ?? 'VF',
    originalName: r.original_name,
    format: r.format,
    size: Number(r.size ?? 0),
    cipherSize: Number(r.cipher_size ?? 0),
    ivHex: r.iv_hex,
    addedAt: Number(r.added_at),
    lastOpenedAt:
      r.last_opened_at !== null && r.last_opened_at !== undefined
        ? Number(r.last_opened_at)
        : null,
    progress: r.progress ?? { percentage: 0, updatedAt: Number(r.added_at) },
    bookmarksCount: Number(r.bookmarks_count ?? 0),
    annotationsCount: Number(r.annotations_count ?? 0),
  };
}

function rowToArticle(r: any, versions: any[]) {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? '',
    author: r.author ?? '',
    issueRef: r.issue_ref ?? '',
    description: r.description ?? '',
    themes: Array.isArray(r.themes) ? r.themes : [],
    coverDataUrl: r.cover_data_url ?? undefined,
    openCount: Number(r.open_count ?? 0),
    addedAt: Number(r.added_at),
    lastOpenedAt:
      r.last_opened_at !== null && r.last_opened_at !== undefined
        ? Number(r.last_opened_at)
        : null,
    versions,
  };
}

function rowToList(r: any) {
  return {
    id: r.id,
    badge: r.badge ?? 'Liste personnelle',
    title: r.title,
    author: r.author ?? '',
    description: r.description ?? '',
    articleIds: Array.isArray(r.article_ids) ? r.article_ids : [],
    isDefault: Boolean(r.is_default),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

const DEFAULT_READING_LIST_ID = 'ma-liste-de-lecture';
const ETUDES_ADMIN_EMAIL = 'samamaaxel@gmail.com';

async function isEtudesAdminUser(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );
  const email = rows[0]?.email?.trim().toLowerCase() ?? '';
  return email === ETUDES_ADMIN_EMAIL;
}

async function ensureDefaultReadingList(userId: string) {
  const now = Date.now();
  await pool.query(
    `INSERT INTO etudes_lists (
      id, user_id, badge, title, author, description, article_ids, is_default, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, true, $7, $7)
    ON CONFLICT (user_id, id) DO NOTHING`,
    [
      DEFAULT_READING_LIST_ID,
      userId,
      'Liste de lecture',
      'Ma liste de lecture',
      'Mon espace Études',
      'Vos études et articles mis de côté pour lecture.',
      now,
    ],
  );
}

// Récupère toutes les études publiées sur le site Études et les listes de l'utilisateur
etudes.get('/state', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    await ensureDefaultReadingList(userId);

    const [articlesRes, versionsRes, listsRes, canManageDocuments] = await Promise.all([
      pool.query(
        `SELECT * FROM etudes_articles ORDER BY added_at DESC`,
      ),
      pool.query(
        `SELECT * FROM etudes_versions ORDER BY added_at ASC`,
      ),
      pool.query(
        `SELECT * FROM etudes_lists WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
        [userId],
      ),
      isEtudesAdminUser(userId),
    ]);

    const versionsByArticle = new Map<string, any[]>();
    for (const vRow of versionsRes.rows) {
      const mapped = rowToVersion(vRow);
      const list = versionsByArticle.get(mapped.articleId) ?? [];
      list.push(mapped);
      versionsByArticle.set(mapped.articleId, list);
    }

    const articles = articlesRes.rows.map((aRow) =>
      rowToArticle(aRow, versionsByArticle.get(aRow.id) ?? []),
    );
    const lists = listsRes.rows.map(rowToList);

    res.set('Cache-Control', 'no-store');
    res.json({ articles, lists, canManageDocuments });
  } catch (err) {
    console.error('[etudes] Erreur lecture state:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const createArticleBodySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).optional().default(''),
  author: z.string().trim().max(200).optional().default(''),
  issueRef: z.string().trim().max(120).optional().default(''),
  description: z.string().max(5000).optional().default(''),
  themes: z.array(z.string().trim().min(1).max(80)).max(50).optional().default([]),
  coverDataUrl: z.string().max(2_500_000).nullable().optional(),
  addedAt: z.number().int().positive(),
  initialVersion: z.object({
    id: z.string().uuid(),
    versionLabel: z.string().trim().min(1).max(80).default('VF'),
    originalName: z.string().trim().min(1).max(300),
    format: z.enum(SUPPORTED_FORMATS),
    size: z.number().int().min(0).max(500 * 1024 * 1024),
    cipherSize: z.number().int().min(0).max(500 * 1024 * 1024),
    ivHex: z.string().trim().regex(/^[0-9a-fA-F]{16,64}$/),
    addedAt: z.number().int().positive(),
  }),
});

// Crée une nouvelle étude avec sa première version (réservé à samamaaxel@gmail.com)
etudes.post('/articles', requireAuth, jsonOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req as AuthedRequest;
    if (!(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }
    const parsed = createArticleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const d = parsed.data;
    const v = d.initialVersion;
    const { relPath } = resolveVersionFilePath(userId, v.id);
    const initialProgress = { percentage: 0, updatedAt: v.addedAt };

    await client.query('BEGIN');
    const artRes = await client.query(
      `INSERT INTO etudes_articles (
        id, user_id, title, subtitle, author, issue_ref, description, themes, cover_data_url, open_count, added_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 0, $10)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        author = EXCLUDED.author,
        issue_ref = EXCLUDED.issue_ref,
        description = EXCLUDED.description,
        themes = EXCLUDED.themes,
        cover_data_url = COALESCE(EXCLUDED.cover_data_url, etudes_articles.cover_data_url)
      RETURNING *`,
      [
        d.id,
        userId,
        d.title,
        d.subtitle,
        d.author,
        d.issueRef,
        d.description,
        JSON.stringify(d.themes ?? []),
        d.coverDataUrl ?? null,
        d.addedAt,
      ],
    );

    const verRes = await client.query(
      `INSERT INTO etudes_versions (
        id, article_id, user_id, version_label, original_name, format,
        size, cipher_size, iv_hex, storage_rel_path, added_at, progress
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        version_label = EXCLUDED.version_label,
        size = EXCLUDED.size,
        cipher_size = EXCLUDED.cipher_size,
        iv_hex = EXCLUDED.iv_hex
      RETURNING *`,
      [
        v.id,
        d.id,
        userId,
        v.versionLabel,
        v.originalName,
        v.format,
        v.size,
        v.cipherSize,
        v.ivHex,
        relPath,
        v.addedAt,
        JSON.stringify(initialProgress),
      ],
    );

    await client.query('COMMIT');
    res.json(rowToArticle(artRes.rows[0], [rowToVersion(verRes.rows[0])]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[etudes] Erreur création étude:', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

const patchArticleSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  subtitle: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
  issueRef: z.string().trim().max(120).optional(),
  description: z.string().max(5000).optional(),
  themes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  coverDataUrl: z.string().max(2_500_000).nullable().optional(),
  incrementOpen: z.boolean().optional(),
});

// Met à jour une étude (métadonnées/thèmes réservés à samamaaxel@gmail.com ; incrementOpen ouvert)
etudes.patch('/articles/:id', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const articleId = req.params.id;
    if (!z.string().uuid().safeParse(articleId).success) {
      return res.status(400).json({ error: 'invalid_article_id' });
    }
    const parsed = patchArticleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const u = parsed.data;
    const isModifyingMetadata =
      u.title !== undefined ||
      u.subtitle !== undefined ||
      u.author !== undefined ||
      u.issueRef !== undefined ||
      u.description !== undefined ||
      u.themes !== undefined ||
      u.coverDataUrl !== undefined;

    if (isModifyingMetadata && !(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT * FROM etudes_articles WHERE id = $1`,
      [articleId],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const now = Date.now();
    const nextOpenCount = u.incrementOpen
      ? Number(existing.open_count ?? 0) + 1
      : Number(existing.open_count ?? 0);
    const nextOpenedAt = u.incrementOpen ? now : existing.last_opened_at;
    const nextThemes =
      u.themes !== undefined
        ? u.themes
        : Array.isArray(existing.themes)
        ? existing.themes
        : [];

    const { rows } = await pool.query(
      `UPDATE etudes_articles
          SET title = $2,
              subtitle = $3,
              author = $4,
              issue_ref = $5,
              description = $6,
              themes = $7::jsonb,
              cover_data_url = $8,
              open_count = $9,
              last_opened_at = $10
        WHERE id = $1
        RETURNING *`,
      [
        articleId,
        u.title ?? existing.title,
        u.subtitle !== undefined ? u.subtitle : existing.subtitle,
        u.author !== undefined ? u.author : existing.author,
        u.issueRef !== undefined ? u.issueRef : existing.issue_ref,
        u.description !== undefined ? u.description : existing.description,
        JSON.stringify(nextThemes),
        u.coverDataUrl !== undefined ? u.coverDataUrl : existing.cover_data_url,
        nextOpenCount,
        nextOpenedAt,
      ],
    );

    const verRes = await pool.query(
      `SELECT * FROM etudes_versions WHERE article_id = $1 ORDER BY added_at ASC`,
      [articleId],
    );

    res.json(rowToArticle(rows[0], verRes.rows.map(rowToVersion)));
  } catch (err) {
    console.error('[etudes] Erreur patch étude:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Supprime une étude et tous ses fichiers liés (réservé à samamaaxel@gmail.com)
etudes.delete('/articles/:id', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    if (!(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }
    const articleId = req.params.id;
    if (!z.string().uuid().safeParse(articleId).success) {
      return res.status(400).json({ error: 'invalid_article_id' });
    }

    const verRes = await pool.query(
      `SELECT id, user_id FROM etudes_versions WHERE article_id = $1`,
      [articleId],
    );

    await pool.query(`DELETE FROM etudes_articles WHERE id = $1`, [articleId]);

    for (const row of verRes.rows) {
      try {
        const { absPath } = resolveVersionFilePath(row.user_id, row.id);
        await fsp.rm(absPath, { force: true });
      } catch {
        // Ignorer
      }
    }

    res.status(204).end();
  } catch (err) {
    console.error('[etudes] Erreur suppression étude:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const addVersionBodySchema = z.object({
  id: z.string().uuid(),
  versionLabel: z.string().trim().min(1).max(80),
  originalName: z.string().trim().min(1).max(300),
  format: z.enum(SUPPORTED_FORMATS),
  size: z.number().int().min(0).max(500 * 1024 * 1024),
  cipherSize: z.number().int().min(0).max(500 * 1024 * 1024),
  ivHex: z.string().trim().regex(/^[0-9a-fA-F]{16,64}$/),
  addedAt: z.number().int().positive(),
});

// Ajoute un fichier lié (nouvelle version : ex. VF, VO, Annexe...) à une étude existante (réservé à samamaaxel@gmail.com)
etudes.post('/articles/:articleId/versions', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    if (!(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }
    const articleId = req.params.articleId;
    if (!z.string().uuid().safeParse(articleId).success) {
      return res.status(400).json({ error: 'invalid_article_id' });
    }
    const parsed = addVersionBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const { rowCount } = await pool.query(
      `SELECT 1 FROM etudes_articles WHERE id = $1`,
      [articleId],
    );
    if (!rowCount) return res.status(404).json({ error: 'article_not_found' });

    const v = parsed.data;
    const { relPath } = resolveVersionFilePath(userId, v.id);
    const initialProgress = { percentage: 0, updatedAt: v.addedAt };

    const { rows } = await pool.query(
      `INSERT INTO etudes_versions (
        id, article_id, user_id, version_label, original_name, format,
        size, cipher_size, iv_hex, storage_rel_path, added_at, progress
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      RETURNING *`,
      [
        v.id,
        articleId,
        userId,
        v.versionLabel,
        v.originalName,
        v.format,
        v.size,
        v.cipherSize,
        v.ivHex,
        relPath,
        v.addedAt,
        JSON.stringify(initialProgress),
      ],
    );

    res.json(rowToVersion(rows[0]));
  } catch (err) {
    console.error('[etudes] Erreur ajout version liée:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const patchVersionSchema = z.object({
  versionLabel: z.string().trim().min(1).max(80).optional(),
  touchOpenedAt: z.boolean().optional(),
  progress: z
    .object({
      percentage: z.number().min(0).max(100).optional(),
      isRead: z.boolean().optional(),
      page: z.number().int().positive().optional(),
      totalPages: z.number().int().positive().optional(),
      cfi: z.string().max(1000).optional(),
      chapterIndex: z.number().int().min(0).optional(),
      chapterLabel: z.string().max(300).optional(),
      scrollRatio: z.number().min(0).max(1).optional(),
      updatedAt: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

// Met à jour le libellé d'une version (réservé à samamaaxel@gmail.com) ou sa progression de lecture
etudes.patch('/versions/:versionId', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const versionId = req.params.versionId;
    if (!z.string().uuid().safeParse(versionId).success) {
      return res.status(400).json({ error: 'invalid_version_id' });
    }
    const parsed = patchVersionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const u = parsed.data;
    if (u.versionLabel !== undefined && !(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT * FROM etudes_versions WHERE id = $1`,
      [versionId],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const now = Date.now();
    const currentProgress = existing.progress ?? { percentage: 0, updatedAt: now };
    const nextProgress = u.progress
      ? {
          ...currentProgress,
          ...u.progress,
          percentage: Math.max(
            0,
            Math.min(100, Math.round(u.progress.percentage ?? currentProgress.percentage ?? 0)),
          ),
          updatedAt: now,
        }
      : currentProgress;
    const nextOpenedAt = u.touchOpenedAt ? now : existing.last_opened_at;

    const { rows } = await pool.query(
      `UPDATE etudes_versions
          SET version_label = $2,
              last_opened_at = $3,
              progress = $4::jsonb
        WHERE id = $1
        RETURNING *`,
      [
        versionId,
        u.versionLabel ?? existing.version_label,
        nextOpenedAt,
        JSON.stringify(nextProgress),
      ],
    );

    if (u.touchOpenedAt) {
      await pool.query(
        `UPDATE etudes_articles
            SET open_count = open_count + 1,
                last_opened_at = $2
          WHERE id = $1`,
        [existing.article_id, now],
      );
    }

    res.json(rowToVersion(rows[0]));
  } catch (err) {
    console.error('[etudes] Erreur patch version:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Supprime une version liée (réservé à samamaaxel@gmail.com)
etudes.delete('/versions/:versionId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    if (!(await isEtudesAdminUser(userId))) {
      return res.status(403).json({ error: 'forbidden_only_admin' });
    }
    const versionId = req.params.versionId;
    if (!z.string().uuid().safeParse(versionId).success) {
      return res.status(400).json({ error: 'invalid_version_id' });
    }
    const { rows: verRows } = await pool.query(
      `SELECT user_id FROM etudes_versions WHERE id = $1`,
      [versionId],
    );
    await pool.query(`DELETE FROM etudes_versions WHERE id = $1`, [versionId]);
    if (verRows[0]?.user_id) {
      try {
        const { absPath } = resolveVersionFilePath(verRows[0].user_id, versionId);
        await fsp.rm(absPath, { force: true });
      } catch {
        // Ignorer
      }
    }
    res.status(204).end();
  } catch (err) {
    console.error('[etudes] Erreur suppression version:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Téléverse le binaire chiffré (AES-256-GCM) d'une version d'étude (réservé à samamaaxel@gmail.com)
etudes.put(
  '/versions/:versionId/blob',
  requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '150mb' }),
  async (req, res) => {
    try {
      const { userId } = req as AuthedRequest;
      if (!(await isEtudesAdminUser(userId))) {
        return res.status(403).json({ error: 'forbidden_only_admin' });
      }
      const versionId = req.params.versionId;
      if (!z.string().uuid().safeParse(versionId).success) {
        return res.status(400).json({ error: 'invalid_version_id' });
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.byteLength === 0) {
        return res.status(400).json({ error: 'empty_blob' });
      }

      const { rows } = await pool.query(
        `SELECT user_id FROM etudes_versions WHERE id = $1`,
        [versionId],
      );
      if (!rows[0]) return res.status(404).json({ error: 'version_not_found' });

      const ownerUserId = rows[0].user_id as string;
      const userDir = path.join(ETUDES_STORAGE_DIR, ownerUserId);
      await fsp.mkdir(userDir, { recursive: true });
      const { absPath } = resolveVersionFilePath(ownerUserId, versionId);
      const tmpPath = `${absPath}.tmp.${Date.now()}`;

      await fsp.writeFile(tmpPath, body);
      await fsp.rename(tmpPath, absPath);

      await pool.query(
        `UPDATE etudes_versions SET cipher_size = $2 WHERE id = $1`,
        [versionId, body.byteLength],
      );

      res.status(204).end();
    } catch (err) {
      console.error('[etudes] Erreur écriture blob version:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  },
);

// Télécharge le binaire chiffré (AES-256-GCM) d'une version d'étude
etudes.get('/versions/:versionId/blob', requireAuth, async (req, res) => {
  try {
    const versionId = req.params.versionId;
    if (!z.string().uuid().safeParse(versionId).success) {
      return res.status(400).json({ error: 'invalid_version_id' });
    }

    const { rows } = await pool.query(
      `SELECT user_id, iv_hex FROM etudes_versions WHERE id = $1`,
      [versionId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'version_not_found' });

    const { absPath } = resolveVersionFilePath(rows[0].user_id, versionId);
    const stat = await fsp.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return res.status(404).json({ error: 'blob_missing_on_disk' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('X-Vault-Iv-Hex', rows[0].iv_hex);
    res.setHeader('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(absPath);
    stream.on('error', (err) => {
      console.error('[etudes] Erreur stream blob version:', err);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[etudes] Erreur téléchargement blob version:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Récupère les notes et signets chiffrés d'une version
etudes.get('/versions/:versionId/study', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const versionId = req.params.versionId;
    if (!z.string().uuid().safeParse(versionId).success) {
      return res.status(400).json({ error: 'invalid_version_id' });
    }
    const { rows } = await pool.query(
      `SELECT annotations_iv, encrypted_annotations
         FROM etudes_versions
        WHERE id = $1 AND user_id = $2`,
      [versionId, userId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({
      annotationsIv: rows[0].annotations_iv ?? null,
      encryptedAnnotations: rows[0].encrypted_annotations ?? null,
    });
  } catch (err) {
    console.error('[etudes] Erreur lecture study version:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const studyBodySchema = z.object({
  annotationsIv: z.string().min(8).max(256),
  encryptedAnnotations: z.string().min(4).max(5_000_000),
  bookmarksCount: z.number().int().min(0).max(100_000),
  annotationsCount: z.number().int().min(0).max(100_000),
});

// Sauvegarde les notes et signets chiffrés d'une version
etudes.put('/versions/:versionId/study', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const versionId = req.params.versionId;
    if (!z.string().uuid().safeParse(versionId).success) {
      return res.status(400).json({ error: 'invalid_version_id' });
    }
    const parsed = studyBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const { annotationsIv, encryptedAnnotations, bookmarksCount, annotationsCount } = parsed.data;
    const { rows } = await pool.query(
      `UPDATE etudes_versions
          SET annotations_iv = $3,
              encrypted_annotations = $4,
              bookmarks_count = $5,
              annotations_count = $6
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [versionId, userId, annotationsIv, encryptedAnnotations, bookmarksCount, annotationsCount],
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rowToVersion(rows[0]));
  } catch (err) {
    console.error('[etudes] Erreur sauvegarde study version:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const upsertListSchema = z.object({
  badge: z.string().trim().min(1).max(80).optional().default('Liste personnelle'),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(150).optional().default(''),
  description: z.string().max(2000).optional().default(''),
  articleIds: z.array(z.string().max(120)).max(1000).optional().default([]),
});

// Crée ou modifie une liste sur le site Études
etudes.put('/lists/:listId', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const listId = req.params.listId.trim();
    if (!listId || listId.length > 100) {
      return res.status(400).json({ error: 'invalid_list_id' });
    }
    const parsed = upsertListSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const d = parsed.data;
    const now = Date.now();
    const isDefault = listId === DEFAULT_READING_LIST_ID;

    const { rows } = await pool.query(
      `INSERT INTO etudes_lists (
        id, user_id, badge, title, author, description, article_ids, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9)
      ON CONFLICT (user_id, id) DO UPDATE SET
        badge = EXCLUDED.badge,
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        description = EXCLUDED.description,
        article_ids = EXCLUDED.article_ids,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        listId,
        userId,
        d.badge,
        d.title,
        d.author,
        d.description,
        JSON.stringify(d.articleIds),
        isDefault,
        now,
      ],
    );

    res.json(rowToList(rows[0]));
  } catch (err) {
    console.error('[etudes] Erreur sauvegarde liste:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Supprime une liste (si c'est "Ma liste de lecture", la réinitialise proprement)
etudes.delete('/lists/:listId', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const listId = req.params.listId.trim();
    await pool.query(`DELETE FROM etudes_lists WHERE user_id = $1 AND id = $2`, [userId, listId]);
    if (listId === DEFAULT_READING_LIST_ID) {
      await ensureDefaultReadingList(userId);
    }
    res.status(204).end();
  } catch (err) {
    console.error('[etudes] Erreur suppression liste:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});
