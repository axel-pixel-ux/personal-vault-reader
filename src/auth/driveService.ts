import { DocumentFormat, ReadingProgress, VaultDocumentMeta } from '../types/vault';
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

export interface DriveStatus {
  connected: boolean;
  googleEmail: string | null;
  oauthConfigured: boolean;
  redirectUri: string;
}

export interface RemoteDriveFolder {
  id: string;
  name: string;
  modifiedTime: string | null;
}

export interface RemoteDriveFile {
  id: string;
  name: string;
  format: DocumentFormat;
  size: number;
  modifiedTime: string | null;
}

export interface LinkedDriveFolder {
  id: string;
  name: string;
  defaultCategory: string;
  booksCount: number;
  lastSyncedAt: number;
}

export interface FolderSyncResult {
  folder: LinkedDriveFolder;
  addedCount: number;
  totalInFolder: number;
  books: VaultDocumentMeta[];
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const r = await apiFetch('/auth/drive/status');
  if (!r.ok) throw new Error('drive_status_failed');
  return r.json();
}

export async function saveDriveOAuthConfig(clientId: string, clientSecret: string): Promise<void> {
  const r = await apiFetch('/auth/drive/oauth-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error('invalid_oauth_config');
}

export async function getDriveConnectUrl(): Promise<string> {
  const r = await apiFetch('/auth/drive/connect-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'oauth_not_configured');
  return data.url as string;
}

export async function disconnectDrive(): Promise<void> {
  await apiFetch('/auth/drive/disconnect', { method: 'DELETE' });
}

export async function listRemoteDriveItems(
  query: string = '',
): Promise<{ folders: RemoteDriveFolder[]; files: RemoteDriveFile[] }> {
  const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  const r = await apiFetch(`/auth/drive/remote-files${q}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'drive_api_error');
  return {
    folders: (data.folders ?? []) as RemoteDriveFolder[],
    files: (data.files ?? []) as RemoteDriveFile[],
  };
}

export async function getDriveFolders(): Promise<LinkedDriveFolder[]> {
  const r = await apiFetch('/auth/drive/folders');
  if (!r.ok) return [];
  return r.json();
}

export async function linkDriveFolder(params: {
  folderInput: string;
  defaultCategory?: string;
}): Promise<FolderSyncResult> {
  const r = await apiFetch('/auth/drive/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'drive_folder_unreachable');
  return data as FolderSyncResult;
}

export async function syncDriveFolder(id: string): Promise<FolderSyncResult> {
  const r = await apiFetch(`/auth/drive/folders/${id}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'drive_folder_unreachable');
  return data as FolderSyncResult;
}

export async function deleteDriveFolder(id: string): Promise<void> {
  await apiFetch(`/auth/drive/folders/${id}`, { method: 'DELETE' });
}

export async function getDriveBooks(): Promise<VaultDocumentMeta[]> {
  const r = await apiFetch('/auth/drive/books');
  if (!r.ok) return [];
  return r.json();
}

export async function linkDriveBook(params: {
  fileInput: string;
  title?: string;
  author?: string;
  description?: string;
  category?: string;
  format?: DocumentFormat;
}): Promise<VaultDocumentMeta> {
  const r = await apiFetch('/auth/drive/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'drive_link_failed');
  return data as VaultDocumentMeta;
}

export async function streamDriveBookContent(id: string): Promise<ArrayBuffer> {
  const r = await apiFetch(`/auth/drive/books/${id}/content`);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error ?? 'drive_stream_failed');
  }
  return r.arrayBuffer();
}

export async function getDriveBookStudyEncrypted(id: string): Promise<{
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
}> {
  const r = await apiFetch(`/auth/drive/books/${id}/study`);
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

export async function saveDriveBookStudyEncrypted(
  id: string,
  annotationsIv: Uint8Array,
  encryptedAnnotations: ArrayBuffer,
  bookmarksCount: number,
  annotationsCount: number,
): Promise<VaultDocumentMeta | null> {
  const r = await apiFetch(`/auth/drive/books/${id}/study`, {
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

export async function patchDriveBook(
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
  const r = await apiFetch(`/auth/drive/books/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function deleteDriveBook(id: string): Promise<void> {
  await apiFetch(`/auth/drive/books/${id}`, { method: 'DELETE' });
}
