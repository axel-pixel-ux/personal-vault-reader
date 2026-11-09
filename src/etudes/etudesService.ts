/**
 * Service dédié au site « Études » — Stockage et synchronisation 100% isolés des fichiers Folio.
 * Utilise le compte et la clé AES-256-GCM partagés pour le chiffrement, mais stocke les études,
 * les versions liées (VF, VO, etc.) et les listes dans des tables et une base IndexedDB séparées.
 */

import { DocumentFormat, ReadingProgress } from '../types/vault';
import { hexToUint8Array } from '../services/cryptoService';
import { apiFetch } from '../auth/api';

export const DEFAULT_READING_LIST_ID = 'ma-liste-de-lecture';
export const ETUDES_ADMIN_EMAIL = 'samamaaxel@gmail.com';

let cachedEtudesSharedKey: CryptoKey | null = null;
export async function getEtudesSharedAesKey(): Promise<CryptoKey> {
  if (cachedEtudesSharedKey) return cachedEtudesSharedKey;
  const raw = new TextEncoder().encode('EtudesSharedSiteVaultKey_2026_v1'); // 32 octets (AES-256)
  cachedEtudesSharedKey = await window.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedEtudesSharedKey;
}

export interface EtudeVersionItem {
  id: string;
  articleId: string;
  versionLabel: string; // ex: "VF", "VO", "Anglais", "Synthèse"...
  originalName: string;
  format: DocumentFormat;
  size: number;
  cipherSize: number;
  ivHex: string;
  addedAt: number;
  lastOpenedAt: number | null;
  progress: ReadingProgress;
  bookmarksCount: number;
  annotationsCount: number;
}

export interface EtudeArticleItem {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  issueRef: string;
  description: string;
  themes: string[];
  coverDataUrl?: string;
  openCount: number;
  addedAt: number;
  lastOpenedAt: number | null;
  versions: EtudeVersionItem[];
}

export interface EtudeListItem {
  id: string;
  badge: string;
  title: string;
  author: string;
  description: string;
  articleIds: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface LocalVersionBlobRecord {
  versionId: string;
  ivHex: string;
  iv: Uint8Array;
  encryptedData: ArrayBuffer;
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
}

const ETUDES_DB_NAME = 'PersonalEtudesDedicatedDB_v1';
const ETUDES_DB_VERSION = 1;
const STORE_VERSION_BLOBS = 'etudes_version_blobs';
const STORE_ARTICLES_CACHE = 'etudes_articles_cache';
const STORE_LISTS_CACHE = 'etudes_lists_cache';

function openEtudesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ETUDES_DB_NAME, ETUDES_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VERSION_BLOBS)) {
        db.createObjectStore(STORE_VERSION_BLOBS, { keyPath: 'versionId' });
      }
      if (!db.objectStoreNames.contains(STORE_ARTICLES_CACHE)) {
        db.createObjectStore(STORE_ARTICLES_CACHE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LISTS_CACHE)) {
        db.createObjectStore(STORE_LISTS_CACHE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function bytesToBase64(u: Uint8Array | ArrayBuffer): string {
  const bytes = u instanceof Uint8Array ? u : new Uint8Array(u);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function saveLocalVersionBlob(record: LocalVersionBlobRecord): Promise<void> {
  const db = await openEtudesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VERSION_BLOBS, 'readwrite');
    tx.objectStore(STORE_VERSION_BLOBS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalVersionBlob(
  versionId: string,
): Promise<LocalVersionBlobRecord | null> {
  const db = await openEtudesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VERSION_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_VERSION_BLOBS).get(versionId);
    req.onsuccess = () => resolve((req.result as LocalVersionBlobRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalVersionBlob(versionId: string): Promise<void> {
  const db = await openEtudesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VERSION_BLOBS, 'readwrite');
    tx.objectStore(STORE_VERSION_BLOBS).delete(versionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createDefaultReadingList(): EtudeListItem {
  const now = Date.now();
  return {
    id: DEFAULT_READING_LIST_ID,
    badge: 'Liste de lecture',
    title: 'Ma liste de lecture',
    author: 'Mon espace Études',
    description: 'Vos études et articles mis de côté pour lecture.',
    articleIds: [],
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchEtudesState(): Promise<{
  articles: EtudeArticleItem[];
  lists: EtudeListItem[];
  canManageDocuments: boolean;
}> {
  const r = await apiFetch('/auth/etudes/state');
  if (!r.ok) {
    return { articles: [], lists: [createDefaultReadingList()], canManageDocuments: false };
  }
  const data = (await r.json()) as {
    articles?: EtudeArticleItem[];
    lists?: EtudeListItem[];
    canManageDocuments?: boolean;
  };
  const lists =
    data.lists && data.lists.length > 0 ? data.lists : [createDefaultReadingList()];
  return {
    articles: data.articles ?? [],
    lists,
    canManageDocuments: Boolean(data.canManageDocuments),
  };
}

export async function createEtudeArticleWithVersion(params: {
  articleId: string;
  title: string;
  subtitle?: string;
  author?: string;
  issueRef?: string;
  description?: string;
  themes?: string[];
  coverDataUrl?: string;
  addedAt: number;
  version: {
    id: string;
    versionLabel: string;
    originalName: string;
    format: DocumentFormat;
    size: number;
    cipherSize: number;
    ivHex: string;
    iv: Uint8Array;
    encryptedData: ArrayBuffer;
    addedAt: number;
  };
}): Promise<EtudeArticleItem | null> {
  await saveLocalVersionBlob({
    versionId: params.version.id,
    ivHex: params.version.ivHex,
    iv: params.version.iv,
    encryptedData: params.version.encryptedData,
  });

  const metaRes = await apiFetch('/auth/etudes/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.articleId,
      title: params.title,
      subtitle: params.subtitle ?? '',
      author: params.author ?? '',
      issueRef: params.issueRef ?? '',
      description: params.description ?? '',
      themes: params.themes ?? [],
      coverDataUrl: params.coverDataUrl ?? null,
      addedAt: params.addedAt,
      initialVersion: {
        id: params.version.id,
        versionLabel: params.version.versionLabel,
        originalName: params.version.originalName,
        format: params.version.format,
        size: params.version.size,
        cipherSize: params.version.cipherSize,
        ivHex: params.version.ivHex,
        addedAt: params.version.addedAt,
      },
    }),
  });

  if (!metaRes.ok) return null;
  const createdArticle = (await metaRes.json()) as EtudeArticleItem;

  const blobRes = await apiFetch(`/auth/etudes/versions/${params.version.id}/blob`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: params.version.encryptedData,
  });
  if (!blobRes.ok) return null;

  return createdArticle;
}

export async function addLinkedVersionToArticle(params: {
  articleId: string;
  versionId: string;
  versionLabel: string;
  originalName: string;
  format: DocumentFormat;
  size: number;
  cipherSize: number;
  ivHex: string;
  iv: Uint8Array;
  encryptedData: ArrayBuffer;
  addedAt: number;
}): Promise<EtudeVersionItem | null> {
  await saveLocalVersionBlob({
    versionId: params.versionId,
    ivHex: params.ivHex,
    iv: params.iv,
    encryptedData: params.encryptedData,
  });

  const res = await apiFetch(`/auth/etudes/articles/${params.articleId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.versionId,
      versionLabel: params.versionLabel,
      originalName: params.originalName,
      format: params.format,
      size: params.size,
      cipherSize: params.cipherSize,
      ivHex: params.ivHex,
      addedAt: params.addedAt,
    }),
  });
  if (!res.ok) return null;
  const createdVersion = (await res.json()) as EtudeVersionItem;

  const blobRes = await apiFetch(`/auth/etudes/versions/${params.versionId}/blob`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json'.replace('application/json', 'application/octet-stream') },
    body: params.encryptedData,
  });
  if (!blobRes.ok) return null;

  return createdVersion;
}

export async function ensureVersionEncryptedBlob(
  version: EtudeVersionItem,
): Promise<{
  iv: Uint8Array;
  encryptedData: ArrayBuffer;
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
} | null> {
  const local = await getLocalVersionBlob(version.id).catch(() => null);
  const remoteStudy = await getVersionStudyEncrypted(version.id).catch(
    (): { annotationsIv?: Uint8Array; encryptedAnnotations?: ArrayBuffer } => ({}),
  );

  if (local && local.encryptedData.byteLength > 0) {
    return {
      iv: local.iv,
      encryptedData: local.encryptedData,
      annotationsIv: remoteStudy.annotationsIv ?? local.annotationsIv,
      encryptedAnnotations: remoteStudy.encryptedAnnotations ?? local.encryptedAnnotations,
    };
  }

  const blobRes = await apiFetch(`/auth/etudes/versions/${version.id}/blob`);
  if (!blobRes.ok) return null;
  const ivHexHeader = blobRes.headers.get('X-Vault-Iv-Hex') || version.ivHex;
  const encryptedData = await blobRes.arrayBuffer();
  const iv = hexToUint8Array(ivHexHeader);

  await saveLocalVersionBlob({
    versionId: version.id,
    ivHex: ivHexHeader,
    iv,
    encryptedData,
    annotationsIv: remoteStudy.annotationsIv,
    encryptedAnnotations: remoteStudy.encryptedAnnotations,
  }).catch(() => {});

  return {
    iv,
    encryptedData,
    annotationsIv: remoteStudy.annotationsIv,
    encryptedAnnotations: remoteStudy.encryptedAnnotations,
  };
}

export async function getVersionStudyEncrypted(versionId: string): Promise<{
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
}> {
  const r = await apiFetch(`/auth/etudes/versions/${versionId}/study`);
  if (!r.ok) return {};
  const data = (await r.json()) as {
    annotationsIv: string | null;
    encryptedAnnotations: string | null;
  };
  if (!data.annotationsIv || !data.encryptedAnnotations) return {};
  return {
    annotationsIv: base64ToBytes(data.annotationsIv),
    encryptedAnnotations: base64ToBytes(data.encryptedAnnotations).buffer as ArrayBuffer,
  };
}

export async function saveVersionStudyEncrypted(
  versionId: string,
  annotationsIv: Uint8Array,
  encryptedAnnotations: ArrayBuffer,
  bookmarksCount: number,
  annotationsCount: number,
): Promise<EtudeVersionItem | null> {
  const local = await getLocalVersionBlob(versionId).catch(() => null);
  if (local) {
    await saveLocalVersionBlob({
      ...local,
      annotationsIv,
      encryptedAnnotations,
    }).catch(() => {});
  }

  const r = await apiFetch(`/auth/etudes/versions/${versionId}/study`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      annotationsIv: bytesToBase64(annotationsIv),
      encryptedAnnotations: bytesToBase64(encryptedAnnotations),
      bookmarksCount,
      annotationsCount,
    }),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function patchEtudeArticle(
  articleId: string,
  updates: {
    title?: string;
    subtitle?: string;
    author?: string;
    issueRef?: string;
    description?: string;
    themes?: string[];
    coverDataUrl?: string | null;
    incrementOpen?: boolean;
  },
): Promise<EtudeArticleItem | null> {
  const r = await apiFetch(`/auth/etudes/articles/${articleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function deleteEtudeArticle(
  articleId: string,
  versionIds: string[],
): Promise<void> {
  await apiFetch(`/auth/etudes/articles/${articleId}`, { method: 'DELETE' });
  for (const vId of versionIds) {
    await deleteLocalVersionBlob(vId).catch(() => {});
  }
}

export async function patchEtudeVersion(
  versionId: string,
  updates: {
    versionLabel?: string;
    touchOpenedAt?: boolean;
    progress?: Partial<ReadingProgress>;
  },
): Promise<EtudeVersionItem | null> {
  const r = await apiFetch(`/auth/etudes/versions/${versionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function deleteEtudeVersion(versionId: string): Promise<void> {
  await apiFetch(`/auth/etudes/versions/${versionId}`, { method: 'DELETE' });
  await deleteLocalVersionBlob(versionId).catch(() => {});
}

export async function saveEtudeList(
  listId: string,
  payload: {
    badge?: string;
    title: string;
    author?: string;
    description?: string;
    articleIds: string[];
  },
): Promise<EtudeListItem | null> {
  const r = await apiFetch(`/auth/etudes/lists/${encodeURIComponent(listId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function deleteEtudeList(listId: string): Promise<void> {
  await apiFetch(`/auth/etudes/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  });
}
