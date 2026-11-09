/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  configFromRemote,
  deleteVaultProfile,
  fetchVaultProfile,
  fromB64,
  pushVaultProfile,
  syncVaultCategories,
} from './auth/vaultSync';
import {
  deleteDriveBook,
  getDriveBooks,
  getDriveBookStudyEncrypted,
  patchDriveBook,
  saveDriveBookStudyEncrypted,
  streamDriveBookContent,
} from './auth/driveService';
import { getServerBooks, pushBookRecordToServer } from './auth/booksService';
import {
  DEFAULT_CATEGORIES,
  DocumentFormat,
  DocumentStudyData,
  ReadingProgress,
  VaultAuthConfig,
  VaultDocumentMeta,
  VaultDocumentRecord,
} from './types/vault';
import {
  createInitialAuthMaterial,
  decryptBuffer,
  decryptStudyData,
  encryptBuffer,
  encryptStudyData,
  importAesKeyFromRaw,
  verifyAndUnlockVault,
} from './services/cryptoService';
import {
  addCustomCategoryToConfig,
  deleteCategoryFromConfig,
  deleteDocument,
  ensureDocumentRecord,
  getAllDocumentsMeta,
  getDocumentRecord,
  getVaultAuthConfig,
  resetEntireVault,
  saveEncryptedDocument,
  saveEncryptedStudyData,
  saveVaultAuthConfig,
  toggleDocumentFavorite,
  updateDocumentMetadata,
  updateReadingProgress,
} from './services/vaultStorage';
import { generateSampleBooks } from './services/sampleBooksGenerator';
import {
  extractBookCoverDataUrl,
  extractCleanDocumentMetadata,
} from './utils/metadataCleaner';
import { VaultAuthScreen } from './components/VaultAuthScreen';
import { VaultDashboard } from './components/VaultDashboard';
import { VaultReaderModal } from './components/readers/VaultReaderModal';

const VAULT_OWNER_KEY = 'vault_owner_user_id';

const EXTENSION_TO_FORMAT: Record<string, DocumentFormat> = {
  txt: 'txt',
  md: 'md',
  markdown: 'md',
  pdf: 'pdf',
  epub: 'epub',
};

function extractFormatFromFilename(filename: string): DocumentFormat | null {
  const parts = filename.toLowerCase().trim().split('.');
  if (parts.length < 2) return null;
  const ext = parts[parts.length - 1];
  return EXTENSION_TO_FORMAT[ext] ?? null;
}

export default function App() {
  const readId = useMemo(() => new URLSearchParams(window.location.search).get('read'), []);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);
  const [authConfig, setAuthConfig] = useState<VaultAuthConfig | null>(null);

  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // État du lecteur actif
  const [activeDocMeta, setActiveDocMeta] = useState<VaultDocumentMeta | null>(null);
  const [activeDecryptedBuffer, setActiveDecryptedBuffer] = useState<ArrayBuffer | null>(null);
  const [activeStudyData, setActiveStudyData] = useState<DocumentStudyData>({
    bookmarks: [],
    annotations: [],
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const profileOnServer = useRef<boolean>(false);

  const loadAllDocuments = useCallback(async (): Promise<VaultDocumentMeta[]> => {
    const [localMetas, serverMetas, driveMetas] = await Promise.all([
      getAllDocumentsMeta().catch(() => [] as VaultDocumentMeta[]),
      getServerBooks().catch(() => [] as VaultDocumentMeta[]),
      getDriveBooks().catch(() => [] as VaultDocumentMeta[]),
    ]);

    const serverMap = new Map<string, VaultDocumentMeta>();
    for (const sm of serverMetas) {
      serverMap.set(sm.id, sm);
    }

    const mergedVaultBooks: VaultDocumentMeta[] = [...serverMetas];
    for (const lm of localMetas) {
      if (lm.category === 'Revue Études' || lm.id.startsWith('etudes-')) {
        void deleteDocument(lm.id).catch(() => {});
        continue;
      }
      const remote = serverMap.get(lm.id);
      if (!remote) {
        mergedVaultBooks.push(lm);
        // Auto-synchronisation vers la VM des livres présents uniquement dans le navigateur local
        void getDocumentRecord(lm.id).then((rec) => {
          if (rec) void pushBookRecordToServer(rec).catch(() => {});
        });
      } else if ((lm.progress?.updatedAt ?? 0) > (remote.progress?.updatedAt ?? 0)) {
        const idx = mergedVaultBooks.findIndex((b) => b.id === lm.id);
        if (idx !== -1) mergedVaultBooks[idx] = lm;
      }
    }

    return [...driveMetas, ...mergedVaultBooks].sort((a, b) => b.addedAt - a.addedAt);
  }, []);

  /**
   * Synchronise le coffre avec le compte : si le compte a déjà un coffre (créé sur un autre
   * appareil), on récupère prénom + clé et on déverrouille sans redemander le code.
   */
  const syncFromServer = useCallback(async () => {
    const { userId, profile } = await fetchVaultProfile();
    let local = await getVaultAuthConfig();

    // Un autre compte a utilisé ce navigateur ou le compte a été réinitialisé côté serveur
    const owner = localStorage.getItem(VAULT_OWNER_KEY);
    if (local && ((owner && owner !== userId) || !profile)) {
      await resetEntireVault();
      local = null;
    }
    localStorage.setItem(VAULT_OWNER_KEY, userId);

    if (!profile) {
      profileOnServer.current = false;
      setAuthConfig(local);
      return;
    }

    profileOnServer.current = true;
    const remote = configFromRemote(profile);
    let config = local;
    if (!local || local.verifierHash !== remote.verifierHash) {
      if (local) await resetEntireVault();
      await saveVaultAuthConfig(remote);
      config = remote;
    } else if (remote.customCategories) {
      local.customCategories = remote.customCategories;
      await saveVaultAuthConfig(local);
      config = local;
    }
    const key = await importAesKeyFromRaw(fromB64(profile.key));
    setAuthConfig(config);
    setDocuments(await loadAllDocuments());
    setSessionKey(key);
  }, [loadAllDocuments]);

  useEffect(() => {
    let mounted = true;
    async function loadInitialConfig() {
      try {
        await syncFromServer();
      } catch (err) {
        console.error('Synchronisation du coffre impossible, mode local:', err);
        try {
          const config = await getVaultAuthConfig();
          if (mounted) setAuthConfig(config);
        } catch (e) {
          console.error('Erreur lecture configuration IndexedDB:', e);
        }
      } finally {
        if (mounted) {
          setBootstrapping(false);
        }
      }
    }
    loadInitialConfig();
    return () => {
      mounted = false;
    };
  }, [syncFromServer]);


  const seedSampleBooks = useCallback(async (key: CryptoKey) => {
    const samples = await generateSampleBooks();
    const now = Date.now();

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const coverDataUrl = await extractBookCoverDataUrl(sample.format, sample.buffer);
      const { iv, encryptedData, ivHex } = await encryptBuffer(sample.buffer, key);
      const record: VaultDocumentRecord = {
        id: window.crypto.randomUUID(),
        title: sample.title,
        author: sample.author,
        description: sample.description,
        category: sample.category || DEFAULT_CATEGORIES[0],
        isFavorite: Boolean(sample.isFavorite),
        bookmarksCount: 0,
        annotationsCount: 0,
        originalName: sample.originalName,
        format: sample.format,
        size: sample.buffer.byteLength,
        cipherSize: encryptedData.byteLength,
        ivHex,
        iv,
        encryptedData,
        addedAt: now - i * 1000,
        lastOpenedAt: null,
        progress: {
          percentage: 0,
          updatedAt: now,
        },
        coverDataUrl,
      };
      await saveEncryptedDocument(record);
    }
  }, []);

  const handleInitializeVault = async (
    username: string,
    passphrase: string,
    includeSamples: boolean
  ) => {
    const material = await createInitialAuthMaterial(passphrase);
    const newConfig: VaultAuthConfig = {
      id: 'master_config',
      username,
      salt: material.salt,
      verifierSalt: material.verifierSalt,
      verifierHash: material.verifierHash,
      canaryIv: material.canaryIv,
      canaryCipher: material.canaryCipher,
      iterations: material.iterations,
      createdAt: Date.now(),
      customCategories: [...DEFAULT_CATEGORIES],
    };

    // Un seul coffre par compte : si un autre appareil l'a déjà créé, on le reprend tel quel
    const created = await pushVaultProfile(newConfig, passphrase);
    if (!created) {
      await syncFromServer();
      return;
    }
    profileOnServer.current = true;

    await saveVaultAuthConfig(newConfig);

    if (includeSamples) {
      await seedSampleBooks(material.aesKey);
    }

    const metas = await loadAllDocuments();
    setAuthConfig(newConfig);
    setDocuments(metas);
    setSessionKey(material.aesKey);
  };

  const handleUnlockVault = async (passphrase: string): Promise<boolean> => {
    if (!authConfig) return false;
    const derivedKey = await verifyAndUnlockVault(passphrase, authConfig);
    if (!derivedKey) {
      return false;
    }

    // Coffre local antérieur au compte : on le rattache au compte pour les autres appareils
    if (!profileOnServer.current) {
      try {
        profileOnServer.current = true;
        await pushVaultProfile(authConfig, passphrase);
      } catch (err) {
        profileOnServer.current = false;
        console.error('Rattachement du coffre au compte impossible:', err);
      }
    }

    const metas = await loadAllDocuments();
    setDocuments(metas);
    setSessionKey(derivedKey);
    return true;
  };

  const handleLockVault = useCallback(() => {
    if (activeDecryptedBuffer) {
      try {
        new Uint8Array(activeDecryptedBuffer).fill(0);
      } catch {
        // Ignorer si détaché
      }
    }
    setActiveDecryptedBuffer(null);
    setActiveDocMeta(null);
    setActiveStudyData({ bookmarks: [], annotations: [] });
    setSessionKey(null);
    setDocuments([]);
  }, [activeDecryptedBuffer]);

  const handleResetVault = async () => {
    handleLockVault();
    await resetEntireVault();
    await deleteVaultProfile().catch((err) => console.error(err));
    profileOnServer.current = false;
    setAuthConfig(null);
  };

  const handleUploadFiles = async (
    files: File[],
    defaultCategory?: string
  ): Promise<{ added: number; rejected: string[] }> => {
    if (!sessionKey) {
      throw new Error('Session verrouillée.');
    }

    setIsUploading(true);
    let added = 0;
    const rejected: string[] = [];

    try {
      for (const file of files) {
        const format = extractFormatFromFilename(file.name);
        if (!format) {
          rejected.push(file.name);
          continue;
        }

        const plainBuffer = await file.arrayBuffer();
        const extractedMeta = await extractCleanDocumentMetadata(
          file.name,
          format,
          plainBuffer
        );

        const { iv, encryptedData, ivHex } = await encryptBuffer(plainBuffer, sessionKey);
        const now = Date.now();

        const record: VaultDocumentRecord = {
          id: window.crypto.randomUUID(),
          title: extractedMeta.title,
          author: extractedMeta.author,
          description: extractedMeta.description,
          category: defaultCategory || DEFAULT_CATEGORIES[0],
          isFavorite: false,
          bookmarksCount: 0,
          annotationsCount: 0,
          originalName: file.name,
          format,
          size: plainBuffer.byteLength,
          cipherSize: encryptedData.byteLength,
          ivHex,
          iv,
          encryptedData,
          addedAt: now,
          lastOpenedAt: null,
          progress: {
            percentage: 0,
            updatedAt: now,
          },
          coverDataUrl: extractedMeta.coverDataUrl,
        };

        await saveEncryptedDocument(record);
        added++;
      }

      const updatedMetas = await loadAllDocuments();
      setDocuments(updatedMetas);
      return { added, rejected };
    } finally {
      setIsUploading(false);
    }
  };

  /** Ouvre le lecteur dans l'onglet courant (utilisé par l'onglet dédié à la lecture). */
  const openDocumentInline = async (doc: VaultDocumentMeta) => {
    if (!sessionKey) return;

    if (doc.driveFileId) {
      const [plainBuffer, encStudy, updatedMeta] = await Promise.all([
        streamDriveBookContent(doc.id),
        getDriveBookStudyEncrypted(doc.id),
        patchDriveBook(doc.id, { touchOpenedAt: true }),
      ]);
      const studyData = await decryptStudyData(
        encStudy.encryptedAnnotations,
        encStudy.annotationsIv,
        sessionKey
      );
      if (updatedMeta) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === updatedMeta.id ? updatedMeta : d))
        );
        setActiveDocMeta(updatedMeta);
      } else {
        setActiveDocMeta(doc);
      }
      setActiveStudyData(studyData);
      setActiveDecryptedBuffer(plainBuffer);

      // Si le livre Drive n'a pas encore de miniature enregistrée, l'extraire en tâche de fond
      if (!doc.coverDataUrl && (doc.format === 'pdf' || doc.format === 'epub')) {
        void extractBookCoverDataUrl(doc.format, plainBuffer).then(async (cover) => {
          if (!cover) return;
          const withCover = await patchDriveBook(doc.id, { coverDataUrl: cover });
          if (withCover) {
            setDocuments((prev) =>
              prev.map((d) => (d.id === withCover.id ? withCover : d))
            );
          }
        });
      }
      return;
    }

    const record = await ensureDocumentRecord(doc);
    if (!record) return;

    const decryptedBuffer = await decryptBuffer(
      record.encryptedData,
      record.iv,
      sessionKey
    );

    const studyData = await decryptStudyData(
      record.encryptedAnnotations,
      record.annotationsIv,
      sessionKey
    );

    const updatedMeta = await updateReadingProgress(doc.id, {}, true);
    if (updatedMeta) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === updatedMeta.id ? updatedMeta : d))
      );
      setActiveDocMeta(updatedMeta);
    } else {
      setActiveDocMeta(doc);
    }

    setActiveStudyData(studyData);
    setActiveDecryptedBuffer(decryptedBuffer);

    if (!doc.coverDataUrl && (doc.format === 'pdf' || doc.format === 'epub')) {
      void extractBookCoverDataUrl(doc.format, decryptedBuffer).then(async (cover) => {
        if (!cover) return;
        const withCover = await updateDocumentMetadata(doc.id, { coverDataUrl: cover });
        if (withCover) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === withCover.id ? withCover : d))
          );
        }
      });
    }
  };

  /** Depuis la bibliothèque : le lecteur s'ouvre dans un nouvel onglet. */
  const handleOpenDocument = async (doc: VaultDocumentMeta) => {
    const url = `${window.location.origin}/reader?read=${encodeURIComponent(doc.id)}`;
    const tab = window.open(url, '_blank');
    if (!tab) {
      // Pop-up bloquée : repli sur l'ouverture dans l'onglet courant
      await openDocumentInline(doc);
    }
  };

  const handleCloseReader = useCallback(() => {
    if (activeDecryptedBuffer) {
      try {
        new Uint8Array(activeDecryptedBuffer).fill(0);
      } catch {
        // Ignorer
      }
    }
    setActiveDecryptedBuffer(null);
    setActiveDocMeta(null);
    setActiveStudyData({ bookmarks: [], annotations: [] });
    if (readId) {
      // Onglet dédié à la lecture : on le ferme (repli sur la bibliothèque si impossible)
      window.close();
      window.setTimeout(() => window.location.replace('/reader'), 250);
    }
  }, [activeDecryptedBuffer, readId]);

  const documentsRef = useRef<VaultDocumentMeta[]>(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  // Onglet de lecture : ouvre automatiquement le livre demandé une fois le coffre déverrouillé
  const readerAutoOpened = useRef<boolean>(false);
  const [readerNotFound, setReaderNotFound] = useState<boolean>(false);
  useEffect(() => {
    if (!readId || !sessionKey || readerAutoOpened.current) return;
    const doc = documents.find((d) => d.id === readId);
    if (!doc) {
      if (!bootstrapping) setReaderNotFound(true);
      return;
    }
    readerAutoOpened.current = true;
    void openDocumentInline(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readId, sessionKey, documents, bootstrapping]);

  // Onglet bibliothèque : rafraîchit la liste au retour (progression mise à jour dans l'onglet de lecture)
  useEffect(() => {
    if (readId || !sessionKey) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void loadAllDocuments().then(setDocuments).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [readId, sessionKey, loadAllDocuments]);

  const handleSaveProgress = useCallback(
    async (docId: string, progress: Partial<ReadingProgress>) => {
      const target = documentsRef.current.find((d) => d.id === docId);
      const updated = target?.driveFileId
        ? await patchDriveBook(docId, { progress, touchOpenedAt: true })
        : await updateReadingProgress(docId, progress, true);
      if (updated) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d))
        );
        setActiveDocMeta((curr) => (curr && curr.id === updated.id ? updated : curr));
      }
    },
    []
  );

  const handleSaveStudyData = useCallback(
    async (docId: string, data: DocumentStudyData) => {
      if (!sessionKey) return;
      const { annotationsIv, encryptedAnnotations } = await encryptStudyData(
        data,
        sessionKey
      );
      const target = documents.find((d) => d.id === docId);
      const updated = target?.driveFileId
        ? await saveDriveBookStudyEncrypted(
            docId,
            annotationsIv,
            encryptedAnnotations,
            data.bookmarks.length,
            data.annotations.length
          )
        : await saveEncryptedStudyData(
            docId,
            annotationsIv,
            encryptedAnnotations,
            data.bookmarks.length,
            data.annotations.length
          );
      if (updated) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d))
        );
        setActiveDocMeta((curr) => (curr && curr.id === updated.id ? updated : curr));
      }
    },
    [sessionKey, documents]
  );

  const handleToggleFavorite = async (id: string) => {
    const target = documents.find((d) => d.id === id);
    const updated = target?.driveFileId
      ? await patchDriveBook(id, { isFavorite: !target.isFavorite })
      : await toggleDocumentFavorite(id, target?.isFavorite);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setActiveDocMeta((curr) => (curr && curr.id === id ? updated : curr));
    }
  };

  const handleToggleRead = async (id: string) => {
    const target = documents.find((d) => d.id === id);
    if (!target) return;
    const currentlyRead = Boolean(
      target.progress?.isRead || (target.progress?.percentage ?? 0) >= 100
    );
    const nextIsRead = !currentlyRead;
    const currentPct = target.progress?.percentage ?? 0;
    const nextPct = nextIsRead ? 100 : currentPct >= 100 ? 0 : currentPct;
    const progressPatch: Partial<ReadingProgress> = {
      isRead: nextIsRead,
      percentage: nextPct,
    };
    const updated = target.driveFileId
      ? await patchDriveBook(id, { progress: progressPatch, touchOpenedAt: false })
      : await updateReadingProgress(id, progressPatch, false);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setActiveDocMeta((curr) => (curr && curr.id === id ? updated : curr));
    }
  };

  const handleUpdateDocumentMeta = async (
    id: string,
    updates: {
      title?: string;
      category?: string;
      description?: string;
      coverDataUrl?: string | null;
    }
  ) => {
    const target = documents.find((d) => d.id === id);
    const updated = target?.driveFileId
      ? await patchDriveBook(id, updates)
      : await updateDocumentMetadata(id, updates);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setActiveDocMeta((curr) => (curr && curr.id === id ? updated : curr));
    }
  };

  const handleAddCategory = async (categoryName: string) => {
    const updatedConfig = await addCustomCategoryToConfig(categoryName);
    if (updatedConfig) {
      setAuthConfig(updatedConfig);
      if (updatedConfig.customCategories) {
        void syncVaultCategories(updatedConfig.customCategories);
      }
    }
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const { config, fallbackCategory } = await deleteCategoryFromConfig(categoryName);
    if (config) {
      setAuthConfig(config);
      if (config.customCategories) {
        await syncVaultCategories(
          config.customCategories,
          categoryName,
          fallbackCategory
        );
      }
      setDocuments(await loadAllDocuments());
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const target = documents.find((d) => d.id === id);
    if (target?.driveFileId) {
      await deleteDriveBook(id);
    } else {
      await deleteDocument(id);
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDeleteAllDocuments = async () => {
    const all = [...documents];
    for (const d of all) {
      try {
        if (d.driveFileId) await deleteDriveBook(d.id);
        else await deleteDocument(d.id);
      } catch (err) {
        console.error('Suppression impossible pour', d.id, err);
      }
    }
    setDocuments(await loadAllDocuments());
  };

  const handleDownloadDecrypted = async (doc: VaultDocumentMeta) => {
    if (!sessionKey) return;
    let plainBuffer: ArrayBuffer;
    if (doc.driveFileId) {
      plainBuffer = await streamDriveBookContent(doc.id);
    } else {
      const record = await ensureDocumentRecord(doc);
      if (!record) return;
      plainBuffer = await decryptBuffer(
        record.encryptedData,
        record.iv,
        sessionKey
      );
    }
    const blob = new Blob([plainBuffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.originalName || `${doc.title}.${doc.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadSampleBooks = async () => {
    if (!sessionKey) return;
    setIsUploading(true);
    try {
      await seedSampleBooks(sessionKey);
      const metas = await loadAllDocuments();
      setDocuments(metas);
    } finally {
      setIsUploading(false);
    }
  };

  if (bootstrapping) {
    return (
      <div
        className={`app-shell ${isDark ? 'dark' : ''}`}
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.88rem',
          color: 'var(--muted)',
        }}
      >
        <span>Chargement de votre bibliothèque Folio...</span>
      </div>
    );
  }

  if (!authConfig || !sessionKey) {
    return (
      <VaultAuthScreen
        authConfig={authConfig}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        onInitializeVault={handleInitializeVault}
        onUnlockVault={handleUnlockVault}
        onResetVault={handleResetVault}
      />
    );
  }

  if (readId) {
    return (
      <>
        {activeDocMeta && activeDecryptedBuffer ? (
          <VaultReaderModal
            documentMeta={activeDocMeta}
            decryptedBuffer={activeDecryptedBuffer}
            initialStudyData={activeStudyData}
            initialTheme={isDark ? 'dark' : 'light'}
            onClose={handleCloseReader}
            onLockNow={handleLockVault}
            onToggleFavorite={handleToggleFavorite}
            onSaveProgress={handleSaveProgress}
            onSaveStudyData={handleSaveStudyData}
          />
        ) : (
          <div
            className={`app-shell ${isDark ? 'dark' : ''}`}
            style={{
              minHeight: '100dvh',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.88rem',
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '24px',
            }}
          >
            {readerNotFound ? (
              <span>
                Livre introuvable. <a href="/reader">Retour à la bibliothèque</a>
              </span>
            ) : (
              <span>Ouverture du livre…</span>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <VaultDashboard
        authConfig={authConfig}
        documents={documents}
        categories={authConfig.customCategories || [...DEFAULT_CATEGORIES]}
        isDark={isDark}
        isUploading={isUploading}
        onToggleTheme={() => setIsDark((d) => !d)}
        onLockVault={handleLockVault}
        onUploadFiles={handleUploadFiles}
        onOpenDocument={handleOpenDocument}
        onToggleFavorite={handleToggleFavorite}
        onToggleRead={handleToggleRead}
        onUpdateDocumentMeta={handleUpdateDocumentMeta}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
        onDeleteDocument={handleDeleteDocument}
        onDeleteAllDocuments={handleDeleteAllDocuments}
        onDownloadDecrypted={handleDownloadDecrypted}
        onLoadSampleBooks={handleLoadSampleBooks}
        onDriveBookLinked={(book) => setDocuments((prev) => [book, ...prev])}
        onRefreshDriveLibrary={async () => {
          setDocuments(await loadAllDocuments());
        }}
      />

      {activeDocMeta && activeDecryptedBuffer && (
        <VaultReaderModal
          documentMeta={activeDocMeta}
          decryptedBuffer={activeDecryptedBuffer}
          initialStudyData={activeStudyData}
          initialTheme={isDark ? 'dark' : 'light'}
          onClose={handleCloseReader}
          onLockNow={handleLockVault}
          onToggleFavorite={handleToggleFavorite}
          onSaveProgress={handleSaveProgress}
          onSaveStudyData={handleSaveStudyData}
        />
      )}
    </>
  );
}
