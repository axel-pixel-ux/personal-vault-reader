import { Router, Request, Response } from 'express';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from './db.ts';
import { AuthedRequest, jsonOnly, open, requireAuth, seal } from './auth.ts';

export const drive = Router();

const SUPPORTED_FORMATS = ['txt', 'md', 'pdf', 'epub'] as const;
type DocFormat = (typeof SUPPORTED_FORMATS)[number];

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

interface SealedOAuthConfig {
  clientId: string;
  clientSecret: string;
}

interface SealedTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate: number;
  email: string | null;
}

function getOrigin(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseDriveInput(input: string): {
  id: string;
  kind: 'folder' | 'file' | 'auto';
} | null {
  const s = input.trim();
  const folderMatch =
    s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ||
    s.match(/embeddedfolderview\?id=([a-zA-Z0-9_-]{10,})/);
  if (folderMatch?.[1]) {
    return { id: folderMatch[1], kind: 'folder' };
  }
  const fileMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch?.[1]) {
    return { id: fileMatch[1], kind: 'file' };
  }
  const queryIdMatch = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryIdMatch?.[1]) {
    return { id: queryIdMatch[1], kind: 'auto' };
  }
  if (/^[a-zA-Z0-9_-]{15,120}$/.test(s)) {
    return { id: s, kind: 'auto' };
  }
  return null;
}

export function extractDriveFileId(input: string): string | null {
  const parsed = parseDriveInput(input);
  return parsed ? parsed.id : null;
}

function detectFormatFromNameOrMime(name?: string, mime?: string): DocFormat | null {
  if (name) {
    const lower = name.toLowerCase().trim();
    if (lower.endsWith('.epub')) return 'epub';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
    if (lower.endsWith('.txt')) return 'txt';
  }
  if (mime) {
    const m = mime.toLowerCase();
    if (m.includes('epub')) return 'epub';
    if (m.includes('pdf')) return 'pdf';
    if (m.includes('markdown')) return 'md';
    if (m.startsWith('text/plain')) return 'txt';
  }
  return null;
}

function detectFormatFromMagicBytes(buf: Uint8Array): DocFormat | null {
  if (buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      return 'pdf';
    }
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      return 'epub';
    }
  }
  return null;
}

function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const utf8Match = cd.match(/filename\*=UTF-8''([^;\r\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = cd.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = cd.match(/filename=([^;\r\n]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return null;
}

async function getOAuthCredentials(userId: string): Promise<SealedOAuthConfig | null> {
  const { rows } = await pool.query(
    'SELECT oauth_config_sealed FROM drive_connections WHERE user_id=$1',
    [userId],
  );
  if (rows[0]?.oauth_config_sealed) {
    try {
      return JSON.parse(open(rows[0].oauth_config_sealed)) as SealedOAuthConfig;
    } catch {
      // Fallback sur variables d'environnement
    }
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  return null;
}

async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT tokens_sealed FROM drive_connections WHERE user_id=$1',
    [userId],
  );
  if (!rows[0]?.tokens_sealed) return null;

  let tokens: SealedTokens;
  try {
    tokens = JSON.parse(open(rows[0].tokens_sealed)) as SealedTokens;
  } catch {
    return null;
  }

  if (tokens.expiryDate > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) return null;
  const creds = await getOAuthCredentials(userId);
  if (!creds) return null;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) return null;
  const refreshed = (await resp.json()) as { access_token: string; expires_in?: number };
  const updated: SealedTokens = {
    ...tokens,
    accessToken: refreshed.access_token,
    expiryDate: Date.now() + (refreshed.expires_in ?? 3500) * 1000,
  };
  await pool.query(
    'UPDATE drive_connections SET tokens_sealed=$2, updated_at=now() WHERE user_id=$1',
    [userId, seal(JSON.stringify(updated))],
  );
  return updated.accessToken;
}

/**
 * Ouvre le flux de téléchargement d'un fichier Google Drive :
 * 1. Via l'API Google Drive OAuth (si l'utilisateur a connecté son compte Google)
 * 2. Sinon via le lien direct Google Drive (pour les fichiers dont l'accès par lien est activé)
 */
async function openGoogleDriveResponse(
  userId: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<{
  response: globalThis.Response;
  filename: string | null;
  size: number;
  mimeType: string | null;
}> {
  const token = await getValidGoogleAccessToken(userId);
  if (token) {
    const metaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
    if (metaResp.ok) {
      const meta = (await metaResp.json()) as { name?: string; mimeType?: string; size?: string };
      const mediaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` }, signal },
      );
      if (mediaResp.ok) {
        return {
          response: mediaResp,
          filename: meta.name ?? null,
          size: Number(meta.size ?? mediaResp.headers.get('content-length') ?? 0),
          mimeType: meta.mimeType ?? mediaResp.headers.get('content-type'),
        };
      }
    }
  }

  const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
  let resp = await fetch(directUrl, {
    headers: { 'User-Agent': 'PersonalVaultReader/1.0' },
    redirect: 'follow',
    signal,
  });

  if (!resp.ok) {
    throw new Error('drive_unreachable');
  }

  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) {
    const html = await resp.text();
    if (
      html.includes('accounts.google.com/ServiceLogin') ||
      html.includes('ServiceLogin') ||
      html.includes('You need access')
    ) {
      throw new Error('drive_file_private');
    }
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i);
    if (uuidMatch?.[1]) {
      const confirmUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t&uuid=${encodeURIComponent(uuidMatch[1])}`;
      resp = await fetch(confirmUrl, {
        headers: { 'User-Agent': 'PersonalVaultReader/1.0' },
        redirect: 'follow',
        signal,
      });
      if (!resp.ok || (resp.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
        throw new Error('drive_file_private');
      }
    } else {
      throw new Error('drive_file_private');
    }
  }

  const filename = parseFilenameFromContentDisposition(resp.headers.get('content-disposition'));
  const size = Number(resp.headers.get('content-length') || 0);
  const mimeType = resp.headers.get('content-type');
  return { response: resp, filename, size, mimeType };
}

interface DiscoveredBookEntry {
  fileId: string;
  name: string;
  format: DocFormat;
  size: number;
  category: string;
}

/**
 * Parse une page HTML `embeddedfolderview` de Google Drive et extrait :
 * - le titre du dossier
 * - les fichiers présents dans le dossier
 * - les sous-dossiers éventuels (pour catégorisation automatique)
 */
async function fetchPublicFolderEntries(folderId: string): Promise<{
  folderName: string;
  files: Array<{ id: string; name: string }>;
  subfolders: Array<{ id: string; name: string }>;
}> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  if (resp.status === 404 || resp.status === 400) {
    throw new Error('not_a_folder');
  }
  if (!resp.ok) {
    throw new Error('drive_folder_unreachable');
  }

  const html = await resp.text();
  if (
    html.includes('accounts.google.com/ServiceLogin') ||
    html.includes('ServiceLogin') ||
    html.includes('You need access')
  ) {
    throw new Error('drive_folder_private');
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const folderName = titleMatch?.[1]
    ? decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*Google\s*Drive$/i, '').trim() || 'Dossier Google Drive'
    : 'Dossier Google Drive';

  const files: Array<{ id: string; name: string }> = [];
  const subfolders: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();

  // Chaque élément du dossier dans embeddedfolderview est dans un bloc flip-entry
  const blocks = html.split('<div class="flip-entry"');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idMatch = block.match(/id="entry-([a-zA-Z0-9_-]+)"/);
    const hrefMatch = block.match(/href="([^"]+)"/);
    const nameMatch = block.match(/<div class="flip-entry-title">([^<]+)<\/div>/);
    if (!idMatch?.[1] || !nameMatch?.[1]) continue;

    const entryId = idMatch[1];
    if (seen.has(entryId)) continue;
    seen.add(entryId);

    const entryName = decodeHtmlEntities(nameMatch[1]);
    const href = hrefMatch?.[1] ?? '';

    if (href.includes('/folders/') || href.includes('embeddedfolderview')) {
      subfolders.push({ id: entryId, name: entryName });
    } else {
      files.push({ id: entryId, name: entryName });
    }
  }

  return { folderName, files, subfolders };
}

/**
 * Scanne l'intégralité d'un dossier Google Drive (et ses sous-dossiers de 1er niveau) :
 * - Utilise l'API Google Drive v3 si le compte OAuth de l'utilisateur est connecté
 * - Sinon utilise la vue publique/partagée `embeddedfolderview` sans nécessiter d'OAuth
 */
async function scanGoogleDriveFolder(
  userId: string,
  folderId: string,
  defaultCategory: string,
): Promise<{
  folderName: string;
  books: DiscoveredBookEntry[];
}> {
  const token = await getValidGoogleAccessToken(userId);

  if (token) {
    const folderMetaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (folderMetaResp.ok) {
      const folderMeta = (await folderMetaResp.json()) as {
        id: string;
        name?: string;
        mimeType?: string;
      };
      if (folderMeta.mimeType && folderMeta.mimeType !== 'application/vnd.google-apps.folder') {
        throw new Error('not_a_folder');
      }
      const folderName = folderMeta.name || 'Dossier Google Drive';
      const books: DiscoveredBookEntry[] = [];

      const listFolderChildren = async (parentId: string, cat: string, depth: number) => {
        const q = `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false`;
        const params = new URLSearchParams({
          q,
          pageSize: '200',
          fields: 'files(id,name,mimeType,size)',
        });
        const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = (await r.json()) as {
          files?: Array<{ id: string; name: string; mimeType?: string; size?: string }>;
        };
        for (const item of data.files ?? []) {
          if (item.mimeType === 'application/vnd.google-apps.folder' && depth < 1) {
            const subName = item.name.replace(/\//g, '-').trim().slice(0, 50);
            const subCat = subName ? `${defaultCategory.split(' / ')[0]} / ${subName}` : cat;
            await listFolderChildren(item.id, subCat, depth + 1);
            continue;
          }
          const fmt = detectFormatFromNameOrMime(item.name, item.mimeType);
          if (fmt) {
            books.push({
              fileId: item.id,
              name: item.name,
              format: fmt,
              size: Number(item.size ?? 0),
              category: cat,
            });
          }
        }
      };

      await listFolderChildren(folderId, defaultCategory, 0);
      return { folderName, books };
    }
  }

  // Sans OAuth (ou si le dossier est partagé par lien) : scan via embeddedfolderview
  const root = await fetchPublicFolderEntries(folderId);
  const candidates: Array<{ id: string; name: string; category: string }> = root.files.map((f) => ({
    ...f,
    category: defaultCategory,
  }));

  // Parcourir également les sous-dossiers de 1er niveau (ex. un sous-dossier par catégorie)
  for (const sub of root.subfolders.slice(0, 15)) {
    try {
      const subData = await fetchPublicFolderEntries(sub.id);
      const subName = sub.name.replace(/\//g, '-').trim().slice(0, 50);
      const subCat = subName ? `${defaultCategory.split(' / ')[0]} / ${subName}` : defaultCategory;
      for (const f of subData.files) {
        candidates.push({ ...f, category: subCat });
      }
    } catch {
      // Ignorer un sous-dossier inaccessible
    }
  }

  const books: DiscoveredBookEntry[] = [];
  for (const c of candidates) {
    let fmt = detectFormatFromNameOrMime(c.name);
    let size = 0;

    // Si le nom du fichier n'a pas d'extension explicite, on inspecte ses premiers octets
    if (!fmt) {
      const ac = new AbortController();
      try {
        const info = await openGoogleDriveResponse(userId, c.id, ac.signal);
        size = info.size;
        fmt = detectFormatFromNameOrMime(info.filename ?? undefined, info.mimeType ?? undefined);
        if (!fmt && info.response.body) {
          const reader = info.response.body.getReader();
          const { value } = await reader.read();
          if (value) fmt = detectFormatFromMagicBytes(value);
        }
      } catch {
        // Ignorer les fichiers qui ne sont pas des livres
      } finally {
        ac.abort();
      }
    }

    if (fmt) {
      books.push({
        fileId: c.id,
        name: c.name,
        format: fmt,
        size,
        category: c.category,
      });
    }
  }

  return { folderName: root.folderName, books };
}

function rowToMeta(r: any) {
  const progress =
    typeof r.progress === 'object' && r.progress !== null
      ? r.progress
      : { percentage: 0, updatedAt: Number(r.added_at) };
  return {
    id: r.id,
    title: r.title,
    author: r.author ?? undefined,
    description: r.description ?? '',
    category: r.category,
    isFavorite: Boolean(r.is_favorite),
    bookmarksCount: Number(r.bookmarks_count ?? 0),
    annotationsCount: Number(r.annotations_count ?? 0),
    originalName: r.original_name,
    format: r.format as DocFormat,
    size: Number(r.size ?? 0),
    cipherSize: 0,
    ivHex: 'google-drive',
    addedAt: Number(r.added_at),
    lastOpenedAt: r.last_opened_at ? Number(r.last_opened_at) : null,
    progress,
    driveFileId: 'linked',
    coverDataUrl: r.cover_data_url ?? undefined,
  };
}

function folderRowToDto(r: any) {
  return {
    id: r.id as string,
    name: r.name as string,
    defaultCategory: r.default_category as string,
    booksCount: Number(r.books_count ?? 0),
    lastSyncedAt: Number(r.last_synced_at),
  };
}

/**
 * Insère en base les nouveaux livres découverts dans un dossier Google Drive
 * sans dupliquer les livres déjà liés à cet utilisateur.
 */
async function persistDiscoveredFolderBooks(
  userId: string,
  folderDbId: string,
  folderName: string,
  discovered: DiscoveredBookEntry[],
): Promise<{ addedBooks: any[]; totalCount: number }> {
  const { rows: existingRows } = await pool.query(
    'SELECT file_hash FROM drive_books WHERE user_id=$1 AND file_hash IS NOT NULL',
    [userId],
  );
  const existingHashes = new Set<string>(existingRows.map((r) => r.file_hash));

  const now = Date.now();
  const addedBooks: any[] = [];

  for (let i = 0; i < discovered.length; i++) {
    const item = discovered[i];
    const fHash = sha256(`${userId}:${item.fileId}`);
    if (existingHashes.has(fHash)) continue;
    existingHashes.add(fHash);

    const cleanTitle =
      item.name
        .replace(/\.(epub|pdf|md|markdown|txt)$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim() || item.name;
    const originalName = /\.(epub|pdf|md|markdown|txt)$/i.test(item.name)
      ? item.name
      : `${item.name}.${item.format}`;

    const { rows } = await pool.query(
      `INSERT INTO drive_books (
         user_id, drive_file_id_sealed, file_hash, folder_ref, title, author,
         description, category, original_name, format, size, added_at, progress
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        userId,
        seal(item.fileId),
        fHash,
        folderDbId,
        cleanTitle,
        null,
        `Dossier Google Drive « ${folderName} » (0 o stocké sur le site).`,
        item.category,
        originalName,
        item.format,
        item.size,
        now - i * 10,
        JSON.stringify({ percentage: 0, updatedAt: now }),
      ],
    );
    addedBooks.push(rowToMeta(rows[0]));
  }

  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM drive_books WHERE user_id=$1 AND folder_ref=$2',
    [userId, folderDbId],
  );
  const totalCount = Number(countRows[0]?.cnt ?? discovered.length);

  await pool.query(
    'UPDATE drive_folders SET books_count=$3, last_synced_at=$4 WHERE id=$1 AND user_id=$2',
    [folderDbId, userId, totalCount, Date.now()],
  );

  return { addedBooks, totalCount };
}

// ---------- Statut & Configuration OAuth Google Drive ----------
drive.get('/status', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const creds = await getOAuthCredentials(userId);
  const { rows } = await pool.query(
    'SELECT tokens_sealed FROM drive_connections WHERE user_id=$1',
    [userId],
  );
  let connected = false;
  let googleEmail: string | null = null;
  if (rows[0]?.tokens_sealed) {
    try {
      const t = JSON.parse(open(rows[0].tokens_sealed)) as SealedTokens;
      connected = Boolean(t.accessToken);
      googleEmail = t.email ?? null;
    } catch {
      connected = false;
    }
  }
  res.json({
    connected,
    googleEmail,
    oauthConfigured: Boolean(creds),
    redirectUri: `${getOrigin(req)}/auth/drive/callback`,
  });
});

const oauthConfigSchema = z.object({
  clientId: z.string().trim().min(10).max(300),
  clientSecret: z.string().trim().min(6).max(300),
});

drive.put('/oauth-config', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const parsed = oauthConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_oauth_config' });

  const sealed = seal(JSON.stringify(parsed.data));
  await pool.query(
    `INSERT INTO drive_connections (user_id, oauth_config_sealed, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET oauth_config_sealed = $2, updated_at = now()`,
    [userId, sealed],
  );
  res.status(204).end();
});

drive.post('/connect-url', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const creds = await getOAuthCredentials(userId);
  if (!creds) return res.status(400).json({ error: 'oauth_not_configured' });

  const redirectUri = `${getOrigin(req)}/auth/drive/callback`;
  const state = seal(
    JSON.stringify({
      userId,
      redirectUri,
      exp: Date.now() + 10 * 60_000,
      nonce: crypto.randomBytes(8).toString('hex'),
    }),
  );

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

drive.get('/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : null;
  if (!code || !stateRaw) {
    return res.status(400).send('Paramètres OAuth manquants.');
  }

  let state: { userId: string; redirectUri: string; exp: number };
  try {
    state = JSON.parse(open(stateRaw));
    if (state.exp < Date.now()) throw new Error('expired');
  } catch {
    return res.status(400).send('Session OAuth expirée ou invalide.');
  }

  const creds = await getOAuthCredentials(state.userId);
  if (!creds) return res.status(400).send('Configuration OAuth introuvable.');

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: state.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResp.ok) {
    return res.status(400).send('Échec de l’échange du code OAuth Google.');
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  let email: string | null = null;
  try {
    const infoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (infoResp.ok) {
      const info = (await infoResp.json()) as { email?: string };
      email = info.email ?? null;
    }
  } catch {
    // Non bloquant
  }

  const sealedTokens = seal(
    JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiryDate: Date.now() + (tokenData.expires_in ?? 3500) * 1000,
      email,
    } satisfies SealedTokens),
  );

  await pool.query(
    `INSERT INTO drive_connections (user_id, tokens_sealed, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET tokens_sealed = $2, updated_at = now()`,
    [state.userId, sealedTokens],
  );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><body style="font-family:sans-serif;background:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <p>Compte Google Drive lié avec succès. Fermeture...</p>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'google-drive-connected' }, window.location.origin);
          window.close();
        } else {
          window.location.href = '/';
        }
      </script>
    </div>
  </body></html>`);
});

drive.delete('/disconnect', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  await pool.query(
    'UPDATE drive_connections SET tokens_sealed=NULL, updated_at=now() WHERE user_id=$1',
    [userId],
  );
  res.status(204).end();
});

// ---------- Parcourir les dossiers & fichiers du compte Google Drive connecté ----------
drive.get('/remote-files', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const token = await getValidGoogleAccessToken(userId);
  if (!token) return res.status(401).json({ error: 'drive_not_connected' });

  const search = typeof req.query.q === 'string' ? req.query.q.trim().replace(/'/g, "\\'") : '';
  let q =
    "trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/pdf' or mimeType = 'application/epub+zip' or mimeType = 'text/markdown' or mimeType = 'text/plain' or name contains '.epub' or name contains '.pdf' or name contains '.md' or name contains '.txt')";
  if (search) {
    q += ` and name contains '${search}'`;
  }

  const params = new URLSearchParams({
    q,
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,size,modifiedTime)',
  });

  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return res.status(502).json({ error: 'drive_api_error' });

  const data = (await resp.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType?: string;
      size?: string;
      modifiedTime?: string;
    }>;
  };

  const folders: Array<{ id: string; name: string; modifiedTime: string | null }> = [];
  const files: Array<{
    id: string;
    name: string;
    format: DocFormat;
    size: number;
    modifiedTime: string | null;
  }> = [];

  for (const f of data.files ?? []) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      folders.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null });
      continue;
    }
    const format = detectFormatFromNameOrMime(f.name, f.mimeType);
    if (format) {
      files.push({
        id: f.id,
        name: f.name,
        format,
        size: Number(f.size ?? 0),
        modifiedTime: f.modifiedTime ?? null,
      });
    }
  }

  res.json({ folders, files });
});

// ---------- Dossiers Google Drive liés (Toute une bibliothèque en un lien) ----------
drive.get('/folders', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { rows } = await pool.query(
    'SELECT * FROM drive_folders WHERE user_id=$1 ORDER BY last_synced_at DESC',
    [userId],
  );
  res.set('Cache-Control', 'no-store');
  res.json(rows.map(folderRowToDto));
});

const linkFolderSchema = z.object({
  folderInput: z.string().trim().min(5).max(1000),
  defaultCategory: z.string().trim().max(60).optional(),
});

drive.post('/folders', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const parsed = linkFolderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const target = parseDriveInput(parsed.data.folderInput);
  if (!target) return res.status(400).json({ error: 'invalid_drive_link' });
  if (target.kind === 'file') {
    return res.status(400).json({ error: 'is_file_not_folder' });
  }

  const defaultCat = parsed.data.defaultCategory?.trim() || 'Essais';
  let scanResult: { folderName: string; books: DiscoveredBookEntry[] };
  try {
    scanResult = await scanGoogleDriveFolder(userId, target.id, defaultCat);
  } catch (err: any) {
    if (err?.message === 'drive_folder_private') {
      return res.status(403).json({ error: 'drive_folder_private' });
    }
    if (err?.message === 'not_a_folder') {
      return res.status(400).json({ error: 'not_a_folder' });
    }
    return res.status(400).json({ error: 'drive_folder_unreachable' });
  }

  if (scanResult.books.length === 0) {
    return res.status(400).json({ error: 'folder_empty_no_books' });
  }

  const folderHash = sha256(`${userId}:${target.id}`);
  const now = Date.now();
  const { rows: folderRows } = await pool.query(
    `INSERT INTO drive_folders (
       user_id, folder_id_sealed, folder_hash, name, default_category, books_count, last_synced_at
     ) VALUES ($1,$2,$3,$4,$5,0,$6)
     ON CONFLICT (user_id, folder_hash) DO UPDATE
       SET name = EXCLUDED.name, default_category = EXCLUDED.default_category, last_synced_at = EXCLUDED.last_synced_at
     RETURNING *`,
    [userId, seal(target.id), folderHash, scanResult.folderName, defaultCat, now],
  );
  const folderRow = folderRows[0];

  const { addedBooks, totalCount } = await persistDiscoveredFolderBooks(
    userId,
    folderRow.id,
    scanResult.folderName,
    scanResult.books,
  );

  folderRow.books_count = totalCount;
  res.status(201).json({
    folder: folderRowToDto(folderRow),
    addedCount: addedBooks.length,
    totalInFolder: totalCount,
    books: addedBooks,
  });
});

drive.post('/folders/:id/sync', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM drive_folders WHERE id=$1 AND user_id=$2',
    [req.params.id, userId],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });

  const folderRow = rows[0];
  const driveFolderId = open(folderRow.folder_id_sealed);

  try {
    const scanResult = await scanGoogleDriveFolder(
      userId,
      driveFolderId,
      folderRow.default_category,
    );
    const { addedBooks, totalCount } = await persistDiscoveredFolderBooks(
      userId,
      folderRow.id,
      scanResult.folderName,
      scanResult.books,
    );
    folderRow.books_count = totalCount;
    folderRow.last_synced_at = Date.now();
    res.json({
      folder: folderRowToDto(folderRow),
      addedCount: addedBooks.length,
      totalInFolder: totalCount,
      books: addedBooks,
    });
  } catch (err: any) {
    if (err?.message === 'drive_folder_private') {
      return res.status(403).json({ error: 'drive_folder_private' });
    }
    return res.status(502).json({ error: 'drive_folder_unreachable' });
  }
});

drive.delete('/folders/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  await pool.query('DELETE FROM drive_folders WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
  res.status(204).end();
});

// ---------- CRUD des livres Google Drive liés au compte ----------
drive.get('/books', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { rows } = await pool.query(
    'SELECT * FROM drive_books WHERE user_id=$1 ORDER BY added_at DESC',
    [userId],
  );
  res.set('Cache-Control', 'no-store');
  res.json(rows.map(rowToMeta));
});

const createDriveBookSchema = z.object({
  fileInput: z.string().trim().min(5).max(1000),
  title: z.string().trim().max(200).optional(),
  author: z.string().trim().max(150).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  format: z.enum(SUPPORTED_FORMATS).optional(),
});

drive.post('/books', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const parsed = createDriveBookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const target = parseDriveInput(parsed.data.fileInput);
  if (!target) return res.status(400).json({ error: 'invalid_drive_link' });
  if (target.kind === 'folder') {
    return res.status(400).json({ error: 'is_folder_use_folder_tab' });
  }
  const fileId = target.id;

  const ac = new AbortController();
  let detectedName: string | null = null;
  let detectedSize = 0;
  let detectedFormat: DocFormat | null = parsed.data.format ?? null;

  try {
    const info = await openGoogleDriveResponse(userId, fileId, ac.signal);
    detectedName = info.filename;
    detectedSize = info.size;
    detectedFormat =
      detectFormatFromNameOrMime(info.filename ?? undefined, info.mimeType ?? undefined) ??
      detectedFormat;

    if (!detectedFormat && info.response.body) {
      const reader = info.response.body.getReader();
      const { value } = await reader.read();
      if (value) {
        detectedFormat = detectFormatFromMagicBytes(value);
      }
    }
    ac.abort();
  } catch (err: any) {
    ac.abort();
    if (err?.message === 'drive_file_private') {
      return res.status(403).json({ error: 'drive_file_private' });
    }
    if (err?.name !== 'AbortError') {
      return res.status(400).json({ error: 'drive_unreachable' });
    }
  }

  const finalFormat: DocFormat = detectedFormat ?? parsed.data.format ?? 'pdf';
  const cleanOriginalName =
    detectedName || `${parsed.data.title || 'Ouvrage Google Drive'}.${finalFormat}`;
  const cleanTitle =
    parsed.data.title?.trim() ||
    cleanOriginalName.replace(/\.(epub|pdf|md|markdown|txt)$/i, '').replace(/[_-]+/g, ' ').trim() ||
    'Ouvrage Google Drive';
  const now = Date.now();
  const fHash = sha256(`${userId}:${fileId}`);

  const { rows } = await pool.query(
    `INSERT INTO drive_books (
       user_id, drive_file_id_sealed, file_hash, title, author, description, category,
       original_name, format, size, added_at, progress
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId,
      seal(fileId),
      fHash,
      cleanTitle,
      parsed.data.author?.trim() || null,
      parsed.data.description?.trim() || 'Ouvrage lié depuis Google Drive (0 Mo stocké sur le site).',
      parsed.data.category?.trim() || 'Essais',
      cleanOriginalName,
      finalFormat,
      detectedSize,
      now,
      JSON.stringify({ percentage: 0, updatedAt: now }),
    ],
  );

  res.status(201).json(rowToMeta(rows[0]));
});

// Flux de lecture en mémoire : strictement réservé au propriétaire du livre (user_id)
drive.get('/books/:id/content', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }

  const { rows } = await pool.query(
    'SELECT drive_file_id_sealed, original_name, size FROM drive_books WHERE id=$1 AND user_id=$2',
    [req.params.id, userId],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });

  const fileId = open(rows[0].drive_file_id_sealed);
  try {
    const { response, size } = await openGoogleDriveResponse(userId, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (size > 0 && (!rows[0].size || Number(rows[0].size) === 0)) {
      void pool.query('UPDATE drive_books SET size=$1 WHERE id=$2 AND user_id=$3', [
        size,
        req.params.id,
        userId,
      ]);
    }
    if (!response.body) return res.status(502).end();
    Readable.fromWeb(response.body as any).pipe(res);
  } catch (err: any) {
    if (err?.message === 'drive_file_private') {
      return res.status(403).json({ error: 'drive_file_private' });
    }
    return res.status(502).json({ error: 'drive_stream_failed' });
  }
});

// Signets et annotations chiffrés du livre Drive
drive.get('/books/:id/study', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const { rows } = await pool.query(
    'SELECT annotations_iv, encrypted_annotations FROM drive_books WHERE id=$1 AND user_id=$2',
    [req.params.id, userId],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({
    annotationsIv: rows[0].annotations_iv ?? null,
    encryptedAnnotations: rows[0].encrypted_annotations ?? null,
  });
});

const studySchema = z.object({
  annotationsIv: z.string().max(128),
  encryptedAnnotations: z.string().max(500_000),
  bookmarksCount: z.number().int().min(0).max(10_000),
  annotationsCount: z.number().int().min(0).max(10_000),
});

drive.put('/books/:id/study', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const parsed = studySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const { rows } = await pool.query(
    `UPDATE drive_books
        SET annotations_iv=$3, encrypted_annotations=$4, bookmarks_count=$5, annotations_count=$6
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [
      req.params.id,
      userId,
      parsed.data.annotationsIv,
      parsed.data.encryptedAnnotations,
      parsed.data.bookmarksCount,
      parsed.data.annotationsCount,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(rowToMeta(rows[0]));
});

const patchDriveBookSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  isFavorite: z.boolean().optional(),
  touchOpenedAt: z.boolean().optional(),
  coverDataUrl: z.string().max(400_000).nullable().optional(),
  progress: z
    .object({
      percentage: z.number().min(0).max(100).optional(),
      isRead: z.boolean().optional(),
      page: z.number().optional(),
      totalPages: z.number().optional(),
      cfi: z.string().optional(),
      chapterIndex: z.number().optional(),
      chapterLabel: z.string().optional(),
      scrollRatio: z.number().optional(),
    })
    .optional(),
});

drive.patch('/books/:id', requireAuth, jsonOnly, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  const parsed = patchDriveBookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

  const { rows: existing } = await pool.query(
    'SELECT * FROM drive_books WHERE id=$1 AND user_id=$2',
    [req.params.id, userId],
  );
  if (!existing[0]) return res.status(404).json({ error: 'not_found' });

  const curr = existing[0];
  const now = Date.now();
  const nextTitle = parsed.data.title ?? curr.title;
  const nextCategory = parsed.data.category ?? curr.category;
  const nextDesc = parsed.data.description ?? curr.description;
  const nextFav =
    typeof parsed.data.isFavorite === 'boolean' ? parsed.data.isFavorite : curr.is_favorite;
  const nextOpened = parsed.data.touchOpenedAt ? now : curr.last_opened_at;
  const nextCover =
    parsed.data.coverDataUrl !== undefined ? parsed.data.coverDataUrl : curr.cover_data_url;

  let nextProgress = curr.progress || { percentage: 0, updatedAt: Number(curr.added_at) };
  if (parsed.data.progress) {
    nextProgress = {
      ...nextProgress,
      ...parsed.data.progress,
      percentage: Math.max(
        0,
        Math.min(
          100,
          Math.round(parsed.data.progress.percentage ?? nextProgress.percentage ?? 0),
        ),
      ),
      updatedAt: now,
    };
  }

  const { rows } = await pool.query(
    `UPDATE drive_books
        SET title=$3, category=$4, description=$5, is_favorite=$6,
            last_opened_at=$7, progress=$8, cover_data_url=$9
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [
      req.params.id,
      userId,
      nextTitle,
      nextCategory,
      nextDesc,
      nextFav,
      nextOpened,
      JSON.stringify(nextProgress),
      nextCover,
    ],
  );

  res.json(rowToMeta(rows[0]));
});

drive.delete('/books/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  await pool.query('DELETE FROM drive_books WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
  res.status(204).end();
});
