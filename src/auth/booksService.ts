import { ReadingProgress, VaultDocumentMeta, VaultDocumentRecord } from '../types/vault';
import { hexToUint8Array } from '../services/cryptoService';
import { apiFetch } from './api';

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

export async function getServerBooks(): Promise<VaultDocumentMeta[]> {
  const r = await apiFetch('/auth/books');
  if (!r.ok) return [];
  return r.json();
}

export async function pushBookRecordToServer(record: VaultDocumentRecord): Promise<VaultDocumentMeta | null> {
  const metaBody: Record<string, unknown> = {
    title: record.title,
    author: record.author,
    description: record.description ?? '',
    category: record.category,
    isFavorite: Boolean(record.isFavorite),
    bookmarksCount: record.bookmarksCount ?? 0,
    annotationsCount: record.annotationsCount ?? 0,
    originalName: record.originalName,
    format: record.format,
    size: record.size,
    cipherSize: record.cipherSize,
    ivHex: record.ivHex,
    addedAt: record.addedAt,
    lastOpenedAt: record.lastOpenedAt ?? null,
    progress: record.progress,
    coverDataUrl: record.coverDataUrl ?? null,
  };

  if (record.annotationsIv && record.encryptedAnnotations) {
    metaBody.annotationsIv = bytesToBase64(record.annotationsIv);
    metaBody.encryptedAnnotations = bytesToBase64(record.encryptedAnnotations);
  }

  const metaRes = await apiFetch(`/auth/books/${record.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metaBody),
  });
  if (!metaRes.ok) return null;
  const savedMeta = (await metaRes.json()) as VaultDocumentMeta;

  const blobRes = await apiFetch(`/auth/books/${record.id}/blob`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: record.encryptedData,
  });
  if (!blobRes.ok) return null;

  return savedMeta;
}

export async function downloadServerBookRecord(
  meta: VaultDocumentMeta,
): Promise<VaultDocumentRecord | null> {
  const [blobRes, study] = await Promise.all([
    apiFetch(`/auth/books/${meta.id}/blob`),
    getServerBookStudyEncrypted(meta.id),
  ]);
  if (!blobRes.ok) return null;

  const ivHexHeader = blobRes.headers.get('X-Vault-Iv-Hex') || meta.ivHex;
  const encryptedData = await blobRes.arrayBuffer();
  const iv = hexToUint8Array(ivHexHeader);

  return {
    ...meta,
    ivHex: ivHexHeader,
    iv,
    cipherSize: encryptedData.byteLength,
    encryptedData,
    annotationsIv: study.annotationsIv,
    encryptedAnnotations: study.encryptedAnnotations,
  };
}

export async function getServerBookStudyEncrypted(id: string): Promise<{
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
}> {
  const r = await apiFetch(`/auth/books/${id}/study`);
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

export async function saveServerBookStudyEncrypted(
  id: string,
  annotationsIv: Uint8Array,
  encryptedAnnotations: ArrayBuffer,
  bookmarksCount: number,
  annotationsCount: number,
): Promise<VaultDocumentMeta | null> {
  const r = await apiFetch(`/auth/books/${id}/study`, {
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

export async function patchServerBook(
  id: string,
  updates: {
    title?: string;
    category?: string;
    description?: string;
    isFavorite?: boolean;
    touchOpenedAt?: boolean;
    coverDataUrl?: string | null;
    progress?: Partial<ReadingProgress>;
  },
): Promise<VaultDocumentMeta | null> {
  const r = await apiFetch(`/auth/books/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function deleteServerBook(id: string): Promise<void> {
  await apiFetch(`/auth/books/${id}`, { method: 'DELETE' });
}
