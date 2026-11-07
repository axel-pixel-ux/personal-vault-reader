import express, { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool } from './db.ts';
import { AuthedRequest, jsonOnly, requireAuth } from './auth.ts';

export const books = Router();

const SUPPORTED_FORMATS = ['txt', 'md', 'pdf', 'epub'] as const;

export const VAULT_STORAGE_DIR = path.resolve(
  process.env.VAULT_STORAGE_DIR || path.join(process.cwd(), 'data', 'vault-files'),
);

// S'assure que le répertoire racine de stockage existe au démarrage
fs.mkdirSync(VAULT_STORAGE_DIR, { recursive: true });

function getUserStorageDir(userId: string): string {
  if (!z.string().uuid().safeParse(userId).success) {
    throw new Error('invalid_user_id');
  }
  return path.join(VAULT_STORAGE_DIR, userId);
}

function resolveBookFilePath(userId: string, bookId: string): { absPath: string; relPath: string } {
  if (!z.string().uuid().safeParse(userId).success || !z.string().uuid().safeParse(bookId).success) {
    throw new Error('invalid_identifier');
  }
  const relPath = path.join(userId, `${bookId}.enc`);
  const absPath = path.join(VAULT_STORAGE_DIR, relPath);
  if (!absPath.startsWith(VAULT_STORAGE_DIR + path.sep)) {
    throw new Error('path_traversal_blocked');
  }
  return { absPath, relPath };
}

export async function deleteAllUserBookFiles(userId: string): Promise<void> {
  try {
    const dir = getUserStorageDir(userId);
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.error('[books] Erreur suppression dossier utilisateur:', err);
  }
}

function rowToMeta(r: any) {
  return {
    id: r.id,
    title: r.title,
    author: r.author ?? undefined,
    description: r.description ?? '',
    category: r.category ?? 'Essais',
    isFavorite: Boolean(r.is_favorite),
    bookmarksCount: Number(r.bookmarks_count ?? 0),
    annotationsCount: Number(r.annotations_count ?? 0),
    originalName: r.original_name,
    format: r.format,
    size: Number(r.size ?? 0),
    cipherSize: Number(r.cipher_size ?? 0),
    ivHex: r.iv_hex,
    addedAt: Number(r.added_at),
    lastOpenedAt: r.last_opened_at !== null && r.last_opened_at !== undefined ? Number(r.last_opened_at) : null,
    progress: r.progress ?? { percentage: 0, updatedAt: Number(r.added_at) },
    coverDataUrl: r.cover_data_url ?? undefined,
  };
}

const upsertBookMetaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).optional(),
  description: z.string().max(5000).optional().default(''),
  category: z.string().trim().min(1).max(120).optional().default('Essais'),
  isFavorite: z.boolean().optional().default(false),
  bookmarksCount: z.number().int().min(0).max(100_000).optional().default(0),
  annotationsCount: z.number().int().min(0).max(100_000).optional().default(0),
  originalName: z.string().trim().min(1).max(300),
  format: z.enum(SUPPORTED_FORMATS),
  size: z.number().int().min(0).max(500 * 1024 * 1024),
  cipherSize: z.number().int().min(0).max(500 * 1024 * 1024),
  ivHex: z.string().trim().regex(/^[0-9a-fA-F]{16,64}$/),
  addedAt: z.number().int().positive(),
  lastOpenedAt: z.number().int().positive().nullable().optional().default(null),
  progress: z
    .object({
      percentage: z.number().min(0).max(100),
      isRead: z.boolean().optional(),
      page: z.number().int().positive().optional(),
      totalPages: z.number().int().positive().optional(),
      cfi: z.string().max(1000).optional(),
      chapterIndex: z.number().int().min(0).optional(),
      chapterLabel: z.string().max(300).optional(),
      scrollRatio: z.number().min(0).max(1).optional(),
      updatedAt: z.number().int().nonnegative(),
    })
    .optional(),
  coverDataUrl: z.string().max(2_500_000).nullable().optional(),
  annotationsIv: z.string().max(256).optional(),
  encryptedAnnotations: z.string().max(5_000_000).optional(),
});

// Liste tous les livres chiffrés stockés sur la VM pour l'utilisateur
books.get('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { rows } = await pool.query(
      `SELECT * FROM vault_books WHERE user_id = $1 ORDER BY added_at DESC`,
      [userId],
    );
    res.json(rows.map(rowToMeta));
  } catch (err) {
    console.error('[books] Erreur liste livres:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Crée ou met à jour la fiche métadonnées d'un livre chiffré
books.put('/:id', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }
    const parsed = upsertBookMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const d = parsed.data;
    const { relPath } = resolveBookFilePath(userId, bookId);
    const progress = d.progress ?? { percentage: 0, updatedAt: d.addedAt };

    const { rows } = await pool.query(
      `INSERT INTO vault_books (
        id, user_id, title, author, description, category, is_favorite,
        bookmarks_count, annotations_count, original_name, format,
        size, cipher_size, iv_hex, storage_rel_path, added_at, last_opened_at,
        progress, annotations_iv, encrypted_annotations, cover_data_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18::jsonb, $19, $20, $21
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        is_favorite = EXCLUDED.is_favorite,
        bookmarks_count = EXCLUDED.bookmarks_count,
        annotations_count = EXCLUDED.annotations_count,
        size = EXCLUDED.size,
        cipher_size = EXCLUDED.cipher_size,
        iv_hex = EXCLUDED.iv_hex,
        last_opened_at = COALESCE(EXCLUDED.last_opened_at, vault_books.last_opened_at),
        progress = EXCLUDED.progress,
        annotations_iv = COALESCE(EXCLUDED.annotations_iv, vault_books.annotations_iv),
        encrypted_annotations = COALESCE(EXCLUDED.encrypted_annotations, vault_books.encrypted_annotations),
        cover_data_url = COALESCE(EXCLUDED.cover_data_url, vault_books.cover_data_url)
      WHERE vault_books.user_id = $2
      RETURNING *`,
      [
        bookId,
        userId,
        d.title,
        d.author ?? null,
        d.description,
        d.category,
        d.isFavorite,
        d.bookmarksCount,
        d.annotationsCount,
        d.originalName,
        d.format,
        d.size,
        d.cipherSize,
        d.ivHex,
        relPath,
        d.addedAt,
        d.lastOpenedAt,
        JSON.stringify(progress),
        d.annotationsIv ?? null,
        d.encryptedAnnotations ?? null,
        d.coverDataUrl ?? null,
      ],
    );

    if (!rows[0]) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(rowToMeta(rows[0]));
  } catch (err) {
    console.error('[books] Erreur sauvegarde métadonnées livre:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Téléverse le binaire chiffré (AES-256-GCM) sur le disque de la VM
books.put(
  '/:id/blob',
  requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '150mb' }),
  async (req, res) => {
    try {
      const { userId } = req as AuthedRequest;
      const bookId = req.params.id;
      if (!z.string().uuid().safeParse(bookId).success) {
        return res.status(400).json({ error: 'invalid_book_id' });
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.byteLength === 0) {
        return res.status(400).json({ error: 'empty_blob' });
      }

      const { rowCount } = await pool.query(
        `SELECT 1 FROM vault_books WHERE id = $1 AND user_id = $2`,
        [bookId, userId],
      );
      if (!rowCount) {
        return res.status(404).json({ error: 'book_not_found' });
      }

      const userDir = getUserStorageDir(userId);
      await fsp.mkdir(userDir, { recursive: true });
      const { absPath } = resolveBookFilePath(userId, bookId);
      const tmpPath = `${absPath}.tmp.${Date.now()}`;

      await fsp.writeFile(tmpPath, body);
      await fsp.rename(tmpPath, absPath);

      await pool.query(
        `UPDATE vault_books SET cipher_size = $3 WHERE id = $1 AND user_id = $2`,
        [bookId, userId, body.byteLength],
      );

      res.status(204).end();
    } catch (err) {
      console.error('[books] Erreur écriture blob chiffré:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  },
);

// Télécharge le binaire chiffré (AES-256-GCM) depuis le disque de la VM
books.get('/:id/blob', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }

    const { rows } = await pool.query(
      `SELECT iv_hex, cipher_size FROM vault_books WHERE id = $1 AND user_id = $2`,
      [bookId, userId],
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'book_not_found' });
    }

    const { absPath } = resolveBookFilePath(userId, bookId);
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
      console.error('[books] Erreur lecture stream blob:', err);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[books] Erreur téléchargement blob:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Récupère les notes et signets chiffrés d'un livre
books.get('/:id/study', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }
    const { rows } = await pool.query(
      `SELECT annotations_iv, encrypted_annotations
         FROM vault_books
        WHERE id = $1 AND user_id = $2`,
      [bookId, userId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({
      annotationsIv: rows[0].annotations_iv ?? null,
      encryptedAnnotations: rows[0].encrypted_annotations ?? null,
    });
  } catch (err) {
    console.error('[books] Erreur lecture study:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const studyBodySchema = z.object({
  annotationsIv: z.string().min(8).max(256),
  encryptedAnnotations: z.string().min(4).max(5_000_000),
  bookmarksCount: z.number().int().min(0).max(100_000),
  annotationsCount: z.number().int().min(0).max(100_000),
});

// Sauvegarde les notes et signets chiffrés d'un livre
books.put('/:id/study', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }
    const parsed = studyBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const { annotationsIv, encryptedAnnotations, bookmarksCount, annotationsCount } = parsed.data;
    const { rows } = await pool.query(
      `UPDATE vault_books
          SET annotations_iv = $3,
              encrypted_annotations = $4,
              bookmarks_count = $5,
              annotations_count = $6
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [bookId, userId, annotationsIv, encryptedAnnotations, bookmarksCount, annotationsCount],
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rowToMeta(rows[0]));
  } catch (err) {
    console.error('[books] Erreur sauvegarde study:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

const patchBookSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  isFavorite: z.boolean().optional(),
  touchOpenedAt: z.boolean().optional(),
  coverDataUrl: z.string().max(2_500_000).nullable().optional(),
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

// Mise à jour partielle (progression, favori, titre, catégorie, couverture)
books.patch('/:id', requireAuth, jsonOnly, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }
    const parsed = patchBookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    const { rows: existingRows } = await pool.query(
      `SELECT * FROM vault_books WHERE id = $1 AND user_id = $2`,
      [bookId, userId],
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const u = parsed.data;
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
    const nextCover =
      u.coverDataUrl !== undefined ? u.coverDataUrl : existing.cover_data_url;

    const { rows } = await pool.query(
      `UPDATE vault_books
          SET title = $3,
              category = $4,
              description = $5,
              is_favorite = $6,
              last_opened_at = $7,
              progress = $8::jsonb,
              cover_data_url = $9
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [
        bookId,
        userId,
        u.title ?? existing.title,
        u.category ?? existing.category,
        u.description !== undefined ? u.description : existing.description,
        u.isFavorite !== undefined ? u.isFavorite : existing.is_favorite,
        nextOpenedAt,
        JSON.stringify(nextProgress),
        nextCover,
      ],
    );
    res.json(rowToMeta(rows[0]));
  } catch (err) {
    console.error('[books] Erreur patch livre:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Supprime le livre de la base et son fichier chiffré sur le disque de la VM
books.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const bookId = req.params.id;
    if (!z.string().uuid().safeParse(bookId).success) {
      return res.status(400).json({ error: 'invalid_book_id' });
    }
    await pool.query(`DELETE FROM vault_books WHERE id = $1 AND user_id = $2`, [bookId, userId]);
    try {
      const { absPath } = resolveBookFilePath(userId, bookId);
      await fsp.rm(absPath, { force: true });
    } catch {
      // Ignorer si déjà absent du disque
    }
    res.status(204).end();
  } catch (err) {
    console.error('[books] Erreur suppression livre:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});
