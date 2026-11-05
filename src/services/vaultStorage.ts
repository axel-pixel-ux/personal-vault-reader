import {
  DEFAULT_CATEGORIES,
  ReadingProgress,
  VaultAuthConfig,
  VaultDocumentMeta,
  VaultDocumentRecord,
} from '../types/vault';
import { sanitizeDescription, stripHtmlAndDecodeEntities } from '../utils/metadataCleaner';

const DB_NAME = 'PersonalVaultReaderDB';
const DB_VERSION = 1;
const STORE_AUTH = 'vault_auth';
const STORE_DOCS = 'vault_documents';

function openVaultDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_AUTH)) {
        db.createObjectStore(STORE_AUTH, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        const docStore = db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        docStore.createIndex('addedAt', 'addedAt', { unique: false });
        docStore.createIndex('format', 'format', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Erreur ouverture IndexedDB'));
  });
}

function recordToMeta(r: VaultDocumentRecord): VaultDocumentMeta {
  return {
    id: r.id,
    title: stripHtmlAndDecodeEntities(r.title) || r.originalName,
    author: r.author ? stripHtmlAndDecodeEntities(r.author) : undefined,
    description: sanitizeDescription(r.description),
    category: r.category ? stripHtmlAndDecodeEntities(r.category) : DEFAULT_CATEGORIES[0],
    isFavorite: Boolean(r.isFavorite),
    bookmarksCount: typeof r.bookmarksCount === 'number' ? r.bookmarksCount : 0,
    annotationsCount: typeof r.annotationsCount === 'number' ? r.annotationsCount : 0,
    originalName: r.originalName,
    format: r.format,
    size: r.size,
    cipherSize: r.cipherSize,
    ivHex: r.ivHex,
    addedAt: r.addedAt,
    lastOpenedAt: r.lastOpenedAt,
    progress: r.progress || { percentage: 0, updatedAt: r.addedAt },
    coverDataUrl: r.coverDataUrl,
  };
}

export async function getVaultAuthConfig(): Promise<VaultAuthConfig | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTH, 'readonly');
    const store = tx.objectStore(STORE_AUTH);
    const req = store.get('master_config');

    req.onsuccess = () => {
      db.close();
      resolve((req.result as VaultAuthConfig) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function saveVaultAuthConfig(config: VaultAuthConfig): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTH, 'readwrite');
    const store = tx.objectStore(STORE_AUTH);
    const req = store.put(config);

    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export function normalizeCategoryPath(raw: string): string {
  return stripHtmlAndDecodeEntities(raw)
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
}

export async function addCustomCategoryToConfig(newCategory: string): Promise<VaultAuthConfig | null> {
  const cleanCat = normalizeCategoryPath(newCategory);
  if (!cleanCat) return null;

  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTH, 'readwrite');
    const store = tx.objectStore(STORE_AUTH);
    const getReq = store.get('master_config');

    getReq.onsuccess = () => {
      const config = getReq.result as VaultAuthConfig | undefined;
      if (!config) {
        db.close();
        resolve(null);
        return;
      }

      const currentList = config.customCategories ? [...config.customCategories] : [...DEFAULT_CATEGORIES];
      const existing = new Set(currentList);
      if (cleanCat.includes(' / ')) {
        const parent = cleanCat.split(' / ')[0];
        if (parent && !existing.has(parent)) {
          currentList.push(parent);
          existing.add(parent);
        }
      }
      if (!existing.has(cleanCat)) {
        currentList.push(cleanCat);
      }
      config.customCategories = currentList;

      const putReq = store.put(config);
      putReq.onsuccess = () => {
        db.close();
        resolve(config);
      };
      putReq.onerror = () => {
        db.close();
        reject(putReq.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function deleteCategoryFromConfig(categoryToDelete: string): Promise<{
  config: VaultAuthConfig | null;
  fallbackCategory: string;
}> {
  const target = normalizeCategoryPath(categoryToDelete);
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_AUTH, STORE_DOCS], 'readwrite');
    const authStore = tx.objectStore(STORE_AUTH);
    const docStore = tx.objectStore(STORE_DOCS);

    const getReq = authStore.get('master_config');
    let updatedConfig: VaultAuthConfig | null = null;
    let fallbackCategory = 'Général';

    getReq.onsuccess = () => {
      const config = getReq.result as VaultAuthConfig | undefined;
      if (!config) return;

      const currentList = config.customCategories ? [...config.customCategories] : [...DEFAULT_CATEGORIES];
      const filtered = currentList.filter(
        (c) => c !== target && !c.startsWith(`${target} / `)
      );
      if (filtered.length === 0) {
        filtered.push('Général');
      }

      // Si on supprime une sous-catégorie "Parent / Sous", les livres remontent dans "Parent"
      if (target.includes(' / ')) {
        const parent = target.split(' / ')[0];
        fallbackCategory = filtered.includes(parent) ? parent : filtered[0];
      } else {
        const firstRoot = filtered.find((c) => !c.includes(' / ')) || filtered[0];
        fallbackCategory = firstRoot;
      }

      config.customCategories = filtered;
      updatedConfig = config;
      authStore.put(config);

      const docsReq = docStore.getAll();
      docsReq.onsuccess = () => {
        const records = (docsReq.result as VaultDocumentRecord[]) || [];
        for (const rec of records) {
          if (rec.category === target || rec.category.startsWith(`${target} / `)) {
            rec.category = fallbackCategory;
            docStore.put(rec);
          }
        }
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve({ config: updatedConfig, fallbackCategory });
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function saveEncryptedDocument(record: VaultDocumentRecord): Promise<void> {
  const sanitizedRecord: VaultDocumentRecord = {
    ...record,
    title: stripHtmlAndDecodeEntities(record.title) || record.originalName,
    description: sanitizeDescription(record.description),
    category: stripHtmlAndDecodeEntities(record.category) || DEFAULT_CATEGORIES[0],
  };

  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.put(sanitizedRecord);

    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getAllDocumentsMeta(): Promise<VaultDocumentMeta[]> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.getAll();

    req.onsuccess = () => {
      db.close();
      const records = (req.result as VaultDocumentRecord[]) || [];
      const metas = records.map(recordToMeta).sort((a, b) => b.addedAt - a.addedAt);
      resolve(metas);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function getDocumentRecord(id: string): Promise<VaultDocumentRecord | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.get(id);

    req.onsuccess = () => {
      db.close();
      resolve((req.result as VaultDocumentRecord) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function updateDocumentMetadata(
  id: string,
  updates: { title?: string; category?: string; description?: string; coverDataUrl?: string | null }
): Promise<VaultDocumentMeta | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as VaultDocumentRecord | undefined;
      if (!record) {
        db.close();
        resolve(null);
        return;
      }

      if (typeof updates.title === 'string' && updates.title.trim()) {
        record.title = stripHtmlAndDecodeEntities(updates.title.trim());
      }
      if (typeof updates.category === 'string' && updates.category.trim()) {
        record.category = normalizeCategoryPath(updates.category);
      }
      if (typeof updates.description === 'string') {
        record.description = sanitizeDescription(updates.description);
      }
      if (updates.coverDataUrl !== undefined) {
        record.coverDataUrl = updates.coverDataUrl || undefined;
      }

      const putReq = store.put(record);
      putReq.onsuccess = () => {
        db.close();
        resolve(recordToMeta(record));
      };
      putReq.onerror = () => {
        db.close();
        reject(putReq.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function toggleDocumentFavorite(id: string): Promise<VaultDocumentMeta | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as VaultDocumentRecord | undefined;
      if (!record) {
        db.close();
        resolve(null);
        return;
      }

      record.isFavorite = !record.isFavorite;
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        db.close();
        resolve(recordToMeta(record));
      };
      putReq.onerror = () => {
        db.close();
        reject(putReq.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function saveEncryptedStudyData(
  id: string,
  annotationsIv: Uint8Array,
  encryptedAnnotations: ArrayBuffer,
  bookmarksCount: number,
  annotationsCount: number
): Promise<VaultDocumentMeta | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as VaultDocumentRecord | undefined;
      if (!record) {
        db.close();
        resolve(null);
        return;
      }

      record.annotationsIv = annotationsIv;
      record.encryptedAnnotations = encryptedAnnotations;
      record.bookmarksCount = bookmarksCount;
      record.annotationsCount = annotationsCount;

      const putReq = store.put(record);
      putReq.onsuccess = () => {
        db.close();
        resolve(recordToMeta(record));
      };
      putReq.onerror = () => {
        db.close();
        reject(putReq.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function updateReadingProgress(
  id: string,
  progressUpdate: Partial<ReadingProgress>,
  touchOpenedAt: boolean = true
): Promise<VaultDocumentMeta | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as VaultDocumentRecord | undefined;
      if (!record) {
        db.close();
        resolve(null);
        return;
      }

      const now = Date.now();
      record.progress = {
        ...record.progress,
        ...progressUpdate,
        percentage: Math.max(
          0,
          Math.min(100, Math.round(progressUpdate.percentage ?? record.progress.percentage))
        ),
        updatedAt: now,
      };
      if (touchOpenedAt) {
        record.lastOpenedAt = now;
      }

      const putReq = store.put(record);
      putReq.onsuccess = () => {
        db.close();
        resolve(recordToMeta(record));
      };
      putReq.onerror = () => {
        db.close();
        reject(putReq.error);
      };
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.delete(id);

    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function resetEntireVault(): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_AUTH, STORE_DOCS], 'readwrite');
    tx.objectStore(STORE_AUTH).clear();
    tx.objectStore(STORE_DOCS).clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
