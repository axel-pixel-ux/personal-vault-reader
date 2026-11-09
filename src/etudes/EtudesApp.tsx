import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './etudes.css';

import { logout } from '../auth/api';
import { DevicesPanel } from '../auth/DevicesPanel';
import {
  configFromRemote,
  deleteVaultProfile,
  fetchVaultProfile,
  fromB64,
  pushVaultProfile,
} from '../auth/vaultSync';
import {
  deleteDriveBook,
  getDriveBooks,
  getDriveBookStudyEncrypted,
  patchDriveBook,
  saveDriveBookStudyEncrypted,
  streamDriveBookContent,
} from '../auth/driveService';
import { getServerBooks, pushBookRecordToServer } from '../auth/booksService';
import {
  DEFAULT_CATEGORIES,
  DocumentFormat,
  DocumentStudyData,
  ReadingProgress,
  VaultAuthConfig,
  VaultDocumentMeta,
  VaultDocumentRecord,
} from '../types/vault';
import {
  createInitialAuthMaterial,
  decryptBuffer,
  decryptStudyData,
  encryptBuffer,
  encryptStudyData,
  importAesKeyFromRaw,
  verifyAndUnlockVault,
} from '../services/cryptoService';
import {
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
  updateReadingProgress,
} from '../services/vaultStorage';
import { extractCleanDocumentMetadata } from '../utils/metadataCleaner';
import { VaultAuthScreen } from '../components/VaultAuthScreen';
import { VaultReaderModal } from '../components/readers/VaultReaderModal';

import {
  ETUDES_ABOUT_FULL_TEXT,
  ETUDES_ALL_ISSUES,
  ETUDES_LATEST_ISSUE,
  ETUDES_MEDIA_ITEMS,
  ETUDES_MOST_CONSULTED_ARTICLES,
  ETUDES_PUBLIC_LISTS,
  ETUDES_RECENT_ISSUES,
  EtudeConsultedArticle,
  EtudeIssue,
  EtudeListEntry,
  EtudeMediaItem,
} from './etudesCatalog';

// Import des 25 icônes SVG téléchargées depuis le fichier Figma svlydaZ169BAsHSgqHY869
import vector0Url from './assets/vector-0.svg';
import vector1Url from './assets/vector-1.svg';
import vector2Url from './assets/vector-2.svg';
import vector3Url from './assets/vector-3.svg';
import vector4Url from './assets/vector-4.svg';
import vector5Url from './assets/vector-5.svg';
import vector6Url from './assets/vector-6.svg';
import svg1Url from './assets/svg-1.svg';
import svg2Url from './assets/svg-2.svg';
import svg3Url from './assets/svg-3.svg';
import svg4Url from './assets/svg-4.svg';
import svg5Url from './assets/svg-5.svg';
import svg6Url from './assets/svg-6.svg';
import svg7Url from './assets/svg-7.svg';
import svg8Url from './assets/svg-8.svg';
import svg9Url from './assets/svg-9.svg';
import svg10Url from './assets/svg-10.svg';
import svg11Url from './assets/svg-11.svg';
import svg12Url from './assets/svg-12.svg';
import svg13Url from './assets/svg-13.svg';
import svg14Url from './assets/svg-14.svg';
import dotActiveUrl from './assets/dot-active.svg';
import dotInactiveUrl from './assets/dot-inactive.svg';
import uploadIconUrl from './assets/upload.svg';

const VAULT_OWNER_KEY = 'vault_owner_user_id';
const SAVED_ITEMS_STORAGE_KEY = 'etudes_saved_reading_list_v1';
const DARK_MODE_STORAGE_KEY = 'etudes_dark_mode_v1';

type EtudesTab = 'apercu' | 'numeros' | 'medias' | 'listes' | 'apropos';

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

export default function EtudesApp() {
  // Thème clair / sombre
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DARK_MODE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, isDark ? '1' : '0');
    } catch {
      // Ignorer
    }
  }, [isDark]);

  // Titre du document
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Études — Revue de culture contemporaine';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  // État d'authentification du coffre unifié avec Folio
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);
  const [authConfig, setAuthConfig] = useState<VaultAuthConfig | null>(null);
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [showVaultModal, setShowVaultModal] = useState<boolean>(false);
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState<boolean>(false);
  const [showDevicesModal, setShowDevicesModal] = useState<boolean>(false);

  // Documents synchronisés avec Folio (notamment les études et fichiers importés)
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDraggingOverBox, setIsDraggingOverBox] = useState<boolean>(false);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Navigation et filtres du site Études
  const [activeTab, setActiveTab] = useState<EtudesTab>('apercu');
  const [topSearchQuery, setTopSearchQuery] = useState<string>('');
  const [journalSearchQuery, setJournalSearchQuery] = useState<string>('');
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string | null>(null);
  const [selectedYearFilter, setSelectedYearFilter] = useState<'all' | 2026 | 2025 | 'uploads'>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [showAllRecentGrid, setShowAllRecentGrid] = useState<boolean>(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeListDot, setActiveListDot] = useState<number>(0);

  // Carrousel des numéros récemment ajoutés (20 numéros, 5 pages de 4 numéros)
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselPage, setCarouselPage] = useState<number>(0);
  const totalCarouselPages = 5;

  // Liste de lecture personnelle (signets sur les numéros et articles)
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_ITEMS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignorer
    }
    return ['etudes-issue-4342', 'etudes-art-populisme'];
  });

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_ITEMS_STORAGE_KEY, JSON.stringify(savedIds));
    } catch {
      // Ignorer
    }
  }, [savedIds]);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  // État de la liseuse Folio (VaultReaderModal)
  const [activeDocMeta, setActiveDocMeta] = useState<VaultDocumentMeta | null>(null);
  const [activeDecryptedBuffer, setActiveDecryptedBuffer] = useState<ArrayBuffer | null>(null);
  const [activeStudyData, setActiveStudyData] = useState<DocumentStudyData>({
    bookmarks: [],
    annotations: [],
  });

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
      const remote = serverMap.get(lm.id);
      if (!remote) {
        mergedVaultBooks.push(lm);
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

  const syncFromServer = useCallback(async () => {
    const { userId, email, profile } = await fetchVaultProfile();
    if (email) setAccountEmail(email);

    let local = await getVaultAuthConfig();
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
    async function bootstrap() {
      try {
        await syncFromServer();
      } catch (err) {
        console.error('Synchronisation du coffre Folio/Études impossible:', err);
        try {
          const cfg = await getVaultAuthConfig();
          if (mounted) setAuthConfig(cfg);
        } catch {
          // Ignorer
        }
      } finally {
        if (mounted) setBootstrapping(false);
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [syncFromServer]);

  // Initialisation ou déverrouillage du coffre AES-256-GCM (partagé avec Folio)
  const handleInitializeVault = async (
    username: string,
    passphrase: string,
    _includeSamples: boolean
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
      customCategories: [...DEFAULT_CATEGORIES, 'Études'],
    };

    const created = await pushVaultProfile(newConfig, passphrase);
    if (!created) {
      await syncFromServer();
      setShowVaultModal(false);
      return;
    }
    profileOnServer.current = true;
    await saveVaultAuthConfig(newConfig);

    const metas = await loadAllDocuments();
    setAuthConfig(newConfig);
    setDocuments(metas);
    setSessionKey(material.aesKey);
    setShowVaultModal(false);
    showToast(`Bienvenue ${username} — Votre coffre Folio & Études est actif.`);
  };

  const handleUnlockVault = async (passphrase: string): Promise<boolean> => {
    if (!authConfig) return false;
    const derivedKey = await verifyAndUnlockVault(passphrase, authConfig);
    if (!derivedKey) return false;

    if (!profileOnServer.current) {
      try {
        profileOnServer.current = true;
        await pushVaultProfile(authConfig, passphrase);
      } catch {
        profileOnServer.current = false;
      }
    }

    const metas = await loadAllDocuments();
    setDocuments(metas);
    setSessionKey(derivedKey);
    setShowVaultModal(false);
    showToast('Coffre déverrouillé avec succès.');
    return true;
  };

  const handleLockVault = useCallback(() => {
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
    setSessionKey(null);
    setShowAccountMenu(false);
    showToast('Coffre verrouillé pour cette session.');
  }, [activeDecryptedBuffer, showToast]);

  const handleResetVault = async () => {
    handleLockVault();
    await resetEntireVault();
    await deleteVaultProfile().catch(() => {});
    profileOnServer.current = false;
    setAuthConfig(null);
  };

  // Téléversement Drag & Drop de fichiers (.pdf, .epub, .md, .txt) chiffrés en AES-256-GCM
  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      if (!sessionKey) {
        setShowVaultModal(true);
        showToast('Déverrouillez ou initialisez votre coffre pour chiffrer vos fichiers.');
        return;
      }

      setIsUploading(true);
      let added = 0;
      const rejected: string[] = [];
      let lastCreatedRecord: VaultDocumentRecord | null = null;

      try {
        for (const file of list) {
          const format = extractFormatFromFilename(file.name);
          if (!format) {
            rejected.push(file.name);
            continue;
          }

          const plainBuffer = await file.arrayBuffer();
          const extractedMeta = await extractCleanDocumentMetadata(file.name, format, plainBuffer);
          const { iv, encryptedData, ivHex } = await encryptBuffer(plainBuffer, sessionKey);
          const now = Date.now();

          const record: VaultDocumentRecord = {
            id: window.crypto.randomUUID(),
            title: extractedMeta.title,
            author: extractedMeta.author || authConfig?.username || 'Études',
            description: extractedMeta.description || 'Étude importée depuis le portail Études',
            category: 'Études',
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
          lastCreatedRecord = record;
          added++;
        }

        const updatedMetas = await loadAllDocuments();
        setDocuments(updatedMetas);

        if (added > 0) {
          showToast(
            added === 1 && lastCreatedRecord
              ? `« ${lastCreatedRecord.title} » importé et synchronisé avec Folio.`
              : `${added} études importées et synchronisées avec Folio.`
          );
        }
        if (rejected.length > 0) {
          showToast(`Format non supporté (${rejected.join(', ')}). Formats acceptés : PDF, EPUB, MD, TXT.`);
        }
      } catch (err) {
        console.error('Erreur import fichier étude:', err);
        showToast("Erreur lors de l'importation du fichier.");
      } finally {
        setIsUploading(false);
      }
    },
    [sessionKey, authConfig?.username, loadAllDocuments, showToast]
  );

  // Ouverture d'un document du coffre Folio (fichier importé ou numéro déjà persisté)
  const openVaultDocumentInReader = useCallback(
    async (doc: VaultDocumentMeta) => {
      if (!sessionKey) {
        setShowVaultModal(true);
        return;
      }

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
        setActiveDocMeta(updatedMeta || doc);
        setActiveStudyData(studyData);
        setActiveDecryptedBuffer(plainBuffer);
        return;
      }

      const record = await ensureDocumentRecord(doc);
      if (!record) return;

      const decryptedBuffer = await decryptBuffer(record.encryptedData, record.iv, sessionKey);
      const studyData = await decryptStudyData(
        record.encryptedAnnotations,
        record.annotationsIv,
        sessionKey
      );
      const updatedMeta = await updateReadingProgress(doc.id, {}, true);
      if (updatedMeta) {
        setDocuments((prev) => prev.map((d) => (d.id === updatedMeta.id ? updatedMeta : d)));
        setActiveDocMeta(updatedMeta);
      } else {
        setActiveDocMeta(doc);
      }
      setActiveStudyData(studyData);
      setActiveDecryptedBuffer(decryptedBuffer);
    },
    [sessionKey]
  );

  // Ouverture d'un numéro, d'un article ou d'un podcast du catalogue Études dans VaultReaderModal
  const openCatalogEntryInReader = useCallback(
    async (params: {
      id: string;
      title: string;
      author: string;
      description: string;
      markdown: string;
      coverUrl?: string;
    }) => {
      const encoder = new TextEncoder();
      const plainBytes = encoder.encode(params.markdown);
      const plainBuffer = plainBytes.buffer.slice(
        plainBytes.byteOffset,
        plainBytes.byteOffset + plainBytes.byteLength
      );

      // Si le coffre AES-256-GCM est actif, on persiste/charge l'entrée pour conserver les surlignages, notes et signets
      if (sessionKey) {
        const existingMeta = documents.find((d) => d.id === params.id);
        if (existingMeta) {
          await openVaultDocumentInReader(existingMeta);
          return;
        }

        try {
          const { iv, encryptedData, ivHex } = await encryptBuffer(plainBuffer, sessionKey);
          const now = Date.now();
          const record: VaultDocumentRecord = {
            id: params.id,
            title: params.title,
            author: params.author,
            description: params.description,
            category: 'Revue Études',
            isFavorite: savedIds.includes(params.id),
            bookmarksCount: 0,
            annotationsCount: 0,
            originalName: `${params.id}.md`,
            format: 'md',
            size: plainBuffer.byteLength,
            cipherSize: encryptedData.byteLength,
            ivHex,
            iv,
            encryptedData,
            addedAt: now,
            lastOpenedAt: now,
            progress: {
              percentage: 0,
              updatedAt: now,
            },
            coverDataUrl: params.coverUrl,
          };
          await saveEncryptedDocument(record);
          const updatedMetas = await loadAllDocuments();
          setDocuments(updatedMetas);
          const { encryptedData: _e, iv: _i, ...metaOnly } = record;
          setActiveDocMeta(metaOnly);
          setActiveStudyData({ bookmarks: [], annotations: [] });
          setActiveDecryptedBuffer(plainBuffer);
          return;
        } catch (err) {
          console.warn('Ouverture directe en mémoire:', err);
        }
      }

      // Repli immédiat en mémoire si le coffre n'est pas encore initialisé
      const now = Date.now();
      const ephemeralMeta: VaultDocumentMeta = {
        id: params.id,
        title: params.title,
        author: params.author,
        description: params.description,
        category: 'Revue Études',
        isFavorite: savedIds.includes(params.id),
        bookmarksCount: 0,
        annotationsCount: 0,
        originalName: `${params.id}.md`,
        format: 'md',
        size: plainBuffer.byteLength,
        cipherSize: plainBuffer.byteLength,
        ivHex: '',
        addedAt: now,
        lastOpenedAt: now,
        progress: {
          percentage: 0,
          updatedAt: now,
        },
        coverDataUrl: params.coverUrl,
      };
      setActiveDocMeta(ephemeralMeta);
      setActiveStudyData({ bookmarks: [], annotations: [] });
      setActiveDecryptedBuffer(plainBuffer);
    },
    [sessionKey, documents, openVaultDocumentInReader, savedIds, loadAllDocuments]
  );

  const handleOpenIssue = useCallback(
    (issue: EtudeIssue) => {
      void openCatalogEntryInReader({
        id: issue.id,
        title: `${issue.issueRef} — ${issue.title}`,
        author: issue.authors.join(', '),
        description: issue.summary,
        markdown: issue.markdownContent,
        coverUrl: issue.coverUrl,
      });
    },
    [openCatalogEntryInReader]
  );

  const handleOpenArticle = useCallback(
    (article: EtudeConsultedArticle) => {
      void openCatalogEntryInReader({
        id: article.id,
        title: article.subtitle ? `${article.title} — ${article.subtitle}` : article.title,
        author: article.authors.join(', '),
        description: article.issueCitation,
        markdown: article.markdownContent,
      });
    },
    [openCatalogEntryInReader]
  );

  const handleOpenMedia = useCallback(
    (media: EtudeMediaItem) => {
      void openCatalogEntryInReader({
        id: media.id,
        title: `${media.kind} : ${media.title}`,
        author: media.speaker,
        description: `${media.duration} • ${media.issueRef}`,
        markdown: media.markdownTranscript,
      });
    },
    [openCatalogEntryInReader]
  );

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
  }, [activeDecryptedBuffer]);

  const handleSaveProgress = useCallback(
    async (docId: string, progress: Partial<ReadingProgress>) => {
      const target = documents.find((d) => d.id === docId);
      if (!target) {
        setActiveDocMeta((curr) =>
          curr && curr.id === docId
            ? {
                ...curr,
                progress: {
                  ...curr.progress,
                  ...progress,
                  percentage: progress.percentage ?? curr.progress?.percentage ?? 0,
                  updatedAt: Date.now(),
                },
              }
            : curr
        );
        return;
      }
      const updated = target.driveFileId
        ? await patchDriveBook(docId, { progress, touchOpenedAt: true })
        : await updateReadingProgress(docId, progress, true);
      if (updated) {
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setActiveDocMeta((curr) => (curr && curr.id === updated.id ? updated : curr));
      }
    },
    [documents]
  );

  const handleSaveStudyData = useCallback(
    async (docId: string, data: DocumentStudyData) => {
      setActiveStudyData(data);
      if (!sessionKey) return;
      const target = documents.find((d) => d.id === docId);
      if (!target) return;
      const { annotationsIv, encryptedAnnotations } = await encryptStudyData(data, sessionKey);
      const updated = target.driveFileId
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
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setActiveDocMeta((curr) => (curr && curr.id === updated.id ? updated : curr));
      }
    },
    [sessionKey, documents]
  );

  const handleToggleFavoriteInReader = useCallback(
    async (docId: string) => {
      setSavedIds((prev) =>
        prev.includes(docId) ? prev.filter((x) => x !== docId) : [...prev, docId]
      );
      const target = documents.find((d) => d.id === docId);
      if (!target) {
        setActiveDocMeta((curr) =>
          curr && curr.id === docId ? { ...curr, isFavorite: !curr.isFavorite } : curr
        );
        return;
      }
      const updated = target.driveFileId
        ? await patchDriveBook(docId, { isFavorite: !target.isFavorite })
        : await toggleDocumentFavorite(docId, target.isFavorite);
      if (updated) {
        setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
        setActiveDocMeta((curr) => (curr && curr.id === docId ? updated : curr));
      }
    },
    [documents]
  );

  const handleToggleSavedItem = useCallback(
    (id: string, label: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setSavedIds((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
        showToast(
          exists
            ? `« ${label} » retiré de votre liste de lecture.`
            : `« ${label} » ajouté à votre liste de lecture.`
        );
        return next;
      });
    },
    [showToast]
  );

  // Suppression d'un fichier importé par l'utilisateur
  const handleDeleteUploadedDoc = useCallback(
    async (doc: VaultDocumentMeta, e: React.MouseEvent) => {
      e.stopPropagation();
      if (doc.driveFileId) {
        await deleteDriveBook(doc.id);
      } else {
        await deleteDocument(doc.id);
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      showToast(`« ${doc.title} » a été supprimé.`);
    },
    [showToast]
  );

  // Études importées par l'utilisateur (hors entrées auto-générées du catalogue de la revue)
  const catalogIdsSet = useMemo(() => {
    const s = new Set<string>();
    ETUDES_ALL_ISSUES.forEach((i) => s.add(i.id));
    ETUDES_MOST_CONSULTED_ARTICLES.forEach((a) => s.add(a.id));
    ETUDES_MEDIA_ITEMS.forEach((m) => s.add(m.id));
    return s;
  }, []);

  const userUploadedStudies = useMemo(() => {
    return documents.filter((d) => !catalogIdsSet.has(d.id));
  }, [documents, catalogIdsSet]);

  // Recherche combinée (barre du haut + barre filtrée sur la revue + filtre auteur)
  const combinedQuery = useMemo(() => {
    const parts = [topSearchQuery.trim(), journalSearchQuery.trim(), selectedAuthorFilter || '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return parts;
  }, [topSearchQuery, journalSearchQuery, selectedAuthorFilter]);

  const filteredRecentIssues = useMemo(() => {
    return ETUDES_RECENT_ISSUES.filter((issue) => {
      if (selectedYearFilter === 2026 && issue.year !== 2026) return false;
      if (selectedYearFilter === 2025 && issue.year !== 2025) return false;
      if (selectedYearFilter === 'uploads') return false;
      if (!combinedQuery) return true;
      const haystack = [
        issue.issueRef,
        issue.title,
        issue.monthLabel,
        issue.summary,
        ...issue.authors,
        ...issue.themes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(combinedQuery);
    });
  }, [combinedQuery, selectedYearFilter]);

  const filteredAllIssues = useMemo(() => {
    return ETUDES_ALL_ISSUES.filter((issue) => {
      if (selectedYearFilter === 2026 && issue.year !== 2026) return false;
      if (selectedYearFilter === 2025 && issue.year !== 2025) return false;
      if (selectedYearFilter === 'uploads') return false;
      if (!combinedQuery) return true;
      const haystack = [
        issue.issueRef,
        issue.title,
        issue.monthLabel,
        issue.summary,
        ...issue.authors,
        ...issue.themes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(combinedQuery);
    });
  }, [combinedQuery, selectedYearFilter]);

  const filteredConsultedArticles = useMemo(() => {
    return ETUDES_MOST_CONSULTED_ARTICLES.filter((art) => {
      if (!combinedQuery) return true;
      const haystack = [
        art.title,
        art.subtitle || '',
        art.issueCitation,
        art.summary,
        ...art.authors,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(combinedQuery);
    });
  }, [combinedQuery]);

  const filteredUploadedStudies = useMemo(() => {
    return userUploadedStudies.filter((doc) => {
      if (!combinedQuery) return true;
      const haystack = `${doc.title} ${doc.author} ${doc.description} ${doc.category} ${doc.originalName}`.toLowerCase();
      return haystack.includes(combinedQuery);
    });
  }, [userUploadedStudies, combinedQuery]);

  // Gestion du défilement du carrousel
  const scrollToCarouselPage = useCallback((pageIndex: number) => {
    const clamped = Math.max(0, Math.min(totalCarouselPages - 1, pageIndex));
    setCarouselPage(clamped);
    const el = carouselRef.current;
    if (!el) return;
    const cardStep = 242; // 206px + 36px gap
    el.scrollTo({
      left: clamped * cardStep * 4,
      behavior: 'smooth',
    });
  }, []);

  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
    const ratio = el.scrollLeft / maxScroll;
    const page = Math.min(
      totalCarouselPages - 1,
      Math.max(0, Math.round(ratio * (totalCarouselPages - 1)))
    );
    setCarouselPage(page);
  }, []);

  // Drag & Drop sur toute la fenêtre
  useEffect(() => {
    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragCounter++;
      setIsDraggingOverWindow(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
    };
    const onDragLeave = () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) setIsDraggingOverWindow(false);
    };
    const onDrop = (e: DragEvent) => {
      dragCounter = 0;
      setIsDraggingOverWindow(false);
      setIsDraggingOverBox(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      void handleUploadFiles(e.dataTransfer.files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleUploadFiles]);

  // Liste dynamique "Ma liste de lecture"
  const personalReadingListEntry: EtudeListEntry = useMemo(
    () => ({
      id: 'etudes-list-personal',
      badge: 'Liste personnelle',
      title: 'Ma liste de lecture',
      author: authConfig?.username || accountEmail || 'Mon compte Folio',
      itemsCountLabel: `${savedIds.length} élément${savedIds.length > 1 ? 's' : ''}`,
      description:
        'Numéros et articles que vous avez enregistrés à l’aide du signet sur le portail Études.',
      itemIds: savedIds,
    }),
    [savedIds, authConfig?.username, accountEmail]
  );

  const allLists = useMemo(
    () => [...ETUDES_PUBLIC_LISTS, personalReadingListEntry],
    [personalReadingListEntry]
  );

  // Résolution des éléments d'une liste sélectionnée
  const resolveListItems = useCallback((itemIds: string[]) => {
    const resolvedIssues: EtudeIssue[] = [];
    const resolvedArticles: EtudeConsultedArticle[] = [];
    for (const id of itemIds) {
      const iss = ETUDES_ALL_ISSUES.find((i) => i.id === id);
      if (iss) resolvedIssues.push(iss);
      const art = ETUDES_MOST_CONSULTED_ARTICLES.find((a) => a.id === id);
      if (art) resolvedArticles.push(art);
    }
    return { resolvedIssues, resolvedArticles };
  }, []);

  const displayAccountLabel = useMemo(() => {
    if (sessionKey && authConfig?.username) return authConfig.username;
    if (accountEmail) return accountEmail.split('@')[0];
    return 'Se connecter';
  }, [sessionKey, authConfig?.username, accountEmail]);

  return (
    <div
      className={`etudes-root ${isDark ? 'is-dark' : ''}`}
      onClick={() => {
        if (showAccountMenu) setShowAccountMenu(false);
        if (showAppSwitcher) setShowAppSwitcher(false);
      }}
    >
      {/* Input fichier caché pour le bouton Upload (1:883) et la zone Drag & Drop (1:886) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.epub,.md,.markdown,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleUploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Overlay global lors d'un glisser-déposer de fichier sur la fenêtre */}
      {isDraggingOverWindow && (
        <div className="etudes-global-drop-overlay">
          <img src={uploadIconUrl} alt="" width={42} height={42} style={{ filter: 'invert(1)' }} />
          <p
            style={{
              fontFamily: "'Alegreya', serif",
              fontSize: 28,
              fontWeight: 700,
              margin: '16px 0 6px',
            }}
          >
            Déposez vos fichiers ou études ici
          </p>
          <p style={{ fontSize: 16, opacity: 0.9, margin: 0 }}>
            Chiffrement AES-256-GCM automatique et synchronisation avec votre bibliothèque Folio
            (.pdf, .epub, .md, .txt)
          </p>
        </div>
      )}

      {/* ==================== BANNIÈRE SUPÉRIEURE STICKY (1:788 / 1:789) ==================== */}
      <header className="etudes-top-banner-wrap">
        <div className="etudes-top-banner">
          {/* Barre de recherche par mots-clés + bouton filtre avancé (1:835) */}
          <div className="etudes-top-search-cluster">
            <form
              className="etudes-top-search-box"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <input
                type="search"
                className="etudes-top-search-input"
                placeholder="Vos mots-clés"
                aria-label="Recherche globale par mots-clés"
                value={topSearchQuery}
                onChange={(e) => setTopSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                className="etudes-top-search-submit"
                title="Lancer la recherche"
                aria-label="Lancer la recherche"
              >
                <img src={svg11Url} alt="" width={18} height={18} />
              </button>
            </form>

            <button
              type="button"
              className={`etudes-top-filter-btn ${showAdvancedFilters ? 'is-active' : ''}`}
              title="Filtres de recherche (année, format, auteur)"
              aria-label="Filtres de recherche"
              onClick={() => setShowAdvancedFilters((v) => !v)}
            >
              <img src={svg10Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            </button>
          </div>

          {/* Boutons d'action à droite : Upload (1:883), Dark mode (1:847), Se connecter (1:854), Menu (1:858) */}
          <div className="etudes-top-actions">
            <button
              type="button"
              className="etudes-icon-circle-btn"
              title="Importer un fichier ou une étude (.pdf, .epub, .md, .txt)"
              aria-label="Importer un fichier ou une étude"
              onClick={() => fileInputRef.current?.click()}
            >
              <img
                src={uploadIconUrl}
                alt=""
                width={24}
                height={24}
                className="etudes-icon-invert"
              />
            </button>

            <button
              type="button"
              className={`etudes-icon-circle-btn ${isDark ? 'is-active' : ''}`}
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
              aria-label="Basculer le thème clair ou sombre"
              onClick={() => setIsDark((d) => !d)}
            >
              <img src={svg12Url} alt="" width={18} height={18} className="etudes-icon-invert" />
            </button>

            {/* Bouton Compte unifié Folio / "Se connecter" (1:854) */}
            <button
              type="button"
              className={`etudes-connect-btn ${showAccountMenu ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowAppSwitcher(false);
                if (!sessionKey && !bootstrapping) {
                  setShowVaultModal(true);
                } else {
                  setShowAccountMenu((v) => !v);
                }
              }}
              title="Compte unifié Folio & Études"
            >
              <span className="etudes-connect-avatar">
                <img src={svg13Url} alt="" width={16} height={16} className="etudes-icon-invert" />
                {sessionKey && <span className="etudes-connect-status-dot" />}
              </span>
              <span>{displayAccountLabel}</span>
            </button>

            {/* Bouton Menu contextuel / Applications (1:858) */}
            <button
              type="button"
              className={`etudes-app-switcher-btn ${showAppSwitcher ? 'is-active' : ''}`}
              title="Applications (Accueil, Folio, Études)"
              aria-label="Menu des applications"
              onClick={(e) => {
                e.stopPropagation();
                setShowAccountMenu(false);
                setShowAppSwitcher((v) => !v);
              }}
            >
              <img src={svg14Url} alt="" width={24} height={24} className="etudes-icon-invert" />
              <img
                src={vector6Url}
                alt=""
                width={16}
                height={16}
                className="etudes-app-switcher-dots etudes-icon-invert"
              />
            </button>
          </div>

          {/* Menu déroulant Compte & Sécurité (relié à Folio) */}
          {showAccountMenu && (
            <div
              className="etudes-dropdown-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Menu du compte unifié Folio & Études"
            >
              <div
                style={{
                  borderBottom: '1px solid var(--etudes-border)',
                  paddingBottom: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: sessionKey ? '#10b981' : '#f59e0b',
                      display: 'inline-block',
                    }}
                  />
                  <strong style={{ fontSize: 16 }}>
                    {authConfig?.username || 'Compte Folio connecté'}
                  </strong>
                </div>
                {accountEmail && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 13.5,
                      color: 'var(--etudes-text-muted)',
                    }}
                  >
                    {accountEmail}
                  </p>
                )}
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 12,
                    color: 'var(--etudes-teal-accent)',
                    fontWeight: 600,
                  }}
                >
                  Connexion et coffre AES-256-GCM partagés avec Folio
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a
                  href="/reader"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 10,
                    color: 'var(--etudes-text-main)',
                    textDecoration: 'none',
                    fontSize: 15,
                    fontWeight: 500,
                    backgroundColor: 'var(--etudes-surface-subtle)',
                  }}
                >
                  <span>Ouvrir ma bibliothèque Folio</span>
                  <span style={{ fontSize: 13, color: 'var(--etudes-text-muted)' }}>
                    {documents.length} doc{documents.length > 1 ? 's' : ''}
                  </span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu(false);
                    setShowDevicesModal(true);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--etudes-text-main)',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontFamily: 'inherit',
                  }}
                >
                  Appareils et sessions actives
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu(false);
                    setActiveTab('listes');
                    setActiveListId('etudes-list-personal');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--etudes-text-main)',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontFamily: 'inherit',
                  }}
                >
                  Ma liste de lecture ({savedIds.length})
                </button>

                {sessionKey ? (
                  <button
                    type="button"
                    onClick={handleLockVault}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--etudes-text-secondary)',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontFamily: 'inherit',
                    }}
                  >
                    Verrouiller le coffre AES-256
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowVaultModal(true);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--etudes-teal-accent)',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}
                  >
                    Déverrouiller le coffre AES-256
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu(false);
                    void logout();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 0,
                    background: 'transparent',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    marginTop: 4,
                  }}
                >
                  Se déconnecter du compte
                </button>
              </div>
            </div>
          )}

          {/* Menu déroulant Applications (9 points 1:858) */}
          {showAppSwitcher && (
            <div
              className="etudes-dropdown-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Applications de votre espace"
              style={{ width: 290 }}
            >
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--etudes-text-muted)',
                }}
              >
                Applications reliées
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href="/"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 12px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: 'var(--etudes-text-main)',
                    backgroundColor: 'var(--etudes-surface-subtle)',
                  }}
                >
                  <strong style={{ fontSize: 15 }}>Accueil — Hub personnel</strong>
                  <span style={{ fontSize: 12.5, color: 'var(--etudes-text-muted)' }}>
                    Portail central des applications
                  </span>
                </a>

                <a
                  href="/etudes"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 12px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: '#ffffff',
                    backgroundColor: 'var(--etudes-teal-dark)',
                  }}
                >
                  <strong style={{ fontSize: 15 }}>Études — Revue contemporaine</strong>
                  <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)' }}>
                    Application actuelle • 21 numéros & études
                  </span>
                </a>

                <a
                  href="/reader"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 12px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: 'var(--etudes-text-main)',
                    backgroundColor: 'var(--etudes-surface-subtle)',
                  }}
                >
                  <strong style={{ fontSize: 15 }}>Folio — Bibliothèque & Liseuse</strong>
                  <span style={{ fontSize: 12.5, color: 'var(--etudes-text-muted)' }}>
                    Coffre-fort numérique synchronisé
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Barre de filtres avancés (affichée au clic sur le bouton filtre 1:836 ou lorsqu'un filtre est actif) */}
      {(showAdvancedFilters ||
        selectedYearFilter !== 'all' ||
        Boolean(selectedAuthorFilter) ||
        Boolean(combinedQuery)) && (
        <div
          style={{
            backgroundColor: 'var(--etudes-surface)',
            borderBottom: '1px solid var(--etudes-border)',
            padding: '10px 36px',
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--etudes-text-muted)',
                  marginRight: 4,
                }}
              >
                Filtrer par période :
              </span>
              {(
                [
                  { id: 'all', label: 'Tous les numéros (21)' },
                  { id: 2026, label: 'Année 2026 (10)' },
                  { id: 2025, label: 'Année 2025 (11)' },
                  { id: 'uploads', label: `Mes fichiers importés (${userUploadedStudies.length})` },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.id)}
                  type="button"
                  onClick={() => setSelectedYearFilter(opt.id)}
                  style={{
                    border: '1px solid var(--etudes-border)',
                    borderRadius: 999,
                    padding: '4px 12px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    backgroundColor:
                      selectedYearFilter === opt.id
                        ? 'var(--etudes-teal-dark)'
                        : 'var(--etudes-surface-subtle)',
                    color: selectedYearFilter === opt.id ? '#ffffff' : 'var(--etudes-text-main)',
                    fontWeight: selectedYearFilter === opt.id ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}

              {selectedAuthorFilter && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: 'rgba(79, 120, 120, 0.16)',
                    color: 'var(--etudes-text-main)',
                    borderRadius: 999,
                    padding: '4px 12px',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  Auteur : {selectedAuthorFilter}
                  <button
                    type="button"
                    onClick={() => setSelectedAuthorFilter(null)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'inherit',
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {(topSearchQuery ||
              journalSearchQuery ||
              selectedAuthorFilter ||
              selectedYearFilter !== 'all') && (
              <button
                type="button"
                className="etudes-text-link-btn"
                onClick={() => {
                  setTopSearchQuery('');
                  setJournalSearchQuery('');
                  setSelectedAuthorFilter(null);
                  setSelectedYearFilter('all');
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================== HERO HEADER #234c4c (1:7) ==================== */}
      <div className="etudes-hero-outer">
        <section className="etudes-hero" aria-label="Présentation de la revue Études">
          <div className="etudes-hero-badge">
            <img src={vector0Url} alt="" width={23} height={18} />
            <span className="etudes-hero-badge-text">Revue</span>
          </div>

          <h1 className="etudes-hero-title">Études</h1>
          <h2 className="etudes-hero-subtitle">Revue de culture contemporaine</h2>

          <div className="etudes-hero-meta">
            <span>11 nos/an</span>
            <button
              type="button"
              className="etudes-hero-publisher-btn"
              onClick={() => setActiveTab('apropos')}
              title="Société d'Édition de Revues — Voir les informations sur l'éditeur"
            >
              S.E.R.
            </button>
          </div>
        </section>
      </div>

      {/* ==================== BARRE D'ONGLETS STICKY (1:678 / 1:679) ==================== */}
      <div className="etudes-tabs-bar-wrap">
        <nav className="etudes-tabs-bar" role="tablist" aria-label="Sections de la revue Études">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'apercu'}
            className={`etudes-tab-btn ${activeTab === 'apercu' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('apercu');
              setActiveListId(null);
            }}
          >
            <img src={svg5Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Aperçu</span>
            {activeTab === 'apercu' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'numeros'}
            className={`etudes-tab-btn ${activeTab === 'numeros' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('numeros');
              setActiveListId(null);
            }}
          >
            <img src={svg6Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Numéros</span>
            <span className="etudes-tab-badge">
              {ETUDES_ALL_ISSUES.length + userUploadedStudies.length}
            </span>
            {activeTab === 'numeros' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'medias'}
            className={`etudes-tab-btn ${activeTab === 'medias' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('medias');
              setActiveListId(null);
            }}
          >
            <img src={svg7Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Vidéos / Podcasts</span>
            {activeTab === 'medias' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'listes'}
            className={`etudes-tab-btn ${activeTab === 'listes' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('listes');
            }}
          >
            <img src={svg8Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Listes</span>
            {savedIds.length > 0 && <span className="etudes-tab-badge">{savedIds.length}</span>}
            {activeTab === 'listes' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'apropos'}
            className={`etudes-tab-btn ${activeTab === 'apropos' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('apropos');
              setActiveListId(null);
            }}
          >
            <img src={svg9Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>À propos</span>
            {activeTab === 'apropos' && <span className="etudes-tab-indicator" />}
          </button>
        </nav>
      </div>

      {/* ==================== CONTENU PRINCIPAL TABPANEL (1:51) ==================== */}
      <main className="etudes-main-panel" role="tabpanel">
        {/* -------------------- ONGLET 1 : APERÇU (Design Figma par défaut) -------------------- */}
        {activeTab === 'apercu' && (
          <>
            {/* Ligne supérieure : À propos (1:53) + Dernier numéro (1:58) */}
            <div className="etudes-overview-top-row">
              <div className="etudes-about-col">
                <div
                  className="etudes-about-card"
                  onClick={() => setActiveTab('apropos')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActiveTab('apropos');
                  }}
                  title="Découvrir l'histoire et le comité éditorial de la revue Études"
                >
                  <h2 className="etudes-about-card-title">À propos</h2>
                  <p className="etudes-about-card-excerpt">{ETUDES_ABOUT_FULL_TEXT.shortExcerpt}</p>
                  <div className="etudes-about-card-fade" />
                </div>
                <div className="etudes-about-readmore-wrap">
                  <button
                    type="button"
                    className="etudes-text-link-btn"
                    onClick={() => setActiveTab('apropos')}
                  >
                    Lire la suite
                  </button>
                </div>
              </div>

              {/* Dernier numéro (1:58) : 2026/11 N° 4342 — La gestion des déchets nucléaires */}
              <div className="etudes-latest-col">
                <h2 className="etudes-section-h2">Dernier numéro</h2>

                <div className="etudes-latest-body">
                  <button
                    type="button"
                    className="etudes-latest-cover-btn"
                    onClick={() => handleOpenIssue(ETUDES_LATEST_ISSUE)}
                    title={`Lire ${ETUDES_LATEST_ISSUE.issueRef} — ${ETUDES_LATEST_ISSUE.title}`}
                  >
                    <img
                      src={ETUDES_LATEST_ISSUE.coverUrl}
                      alt={ETUDES_LATEST_ISSUE.title}
                      width={197}
                      height={300}
                      style={{ display: 'block', width: 197, height: 300, objectFit: 'cover' }}
                    />
                  </button>

                  <div className="etudes-latest-info">
                    <div className="etudes-meta-bar">
                      <div className="etudes-meta-type">
                        <img
                          src={vector1Url}
                          alt=""
                          width={21}
                          height={16}
                          className="etudes-icon-invert"
                        />
                        <span className="etudes-meta-type-label">Numéro de revue</span>
                      </div>

                      <button
                        type="button"
                        className={`etudes-bookmark-btn ${
                          savedIds.includes(ETUDES_LATEST_ISSUE.id) ? 'is-saved' : ''
                        }`}
                        title={
                          savedIds.includes(ETUDES_LATEST_ISSUE.id)
                            ? 'Retirer de la liste de lecture'
                            : 'Ajouter à la liste de lecture'
                        }
                        aria-label="Ajouter à la liste de lecture"
                        onClick={(e) =>
                          handleToggleSavedItem(
                            ETUDES_LATEST_ISSUE.id,
                            ETUDES_LATEST_ISSUE.title,
                            e
                          )
                        }
                      >
                        <img
                          src={vector2Url}
                          alt=""
                          width={12}
                          height={16}
                          className="etudes-icon-invert"
                        />
                      </button>
                    </div>

                    <p
                      className="etudes-issue-ref"
                      onClick={() => handleOpenIssue(ETUDES_LATEST_ISSUE)}
                    >
                      {ETUDES_LATEST_ISSUE.issueRef}
                    </p>
                    <h3
                      className="etudes-issue-title"
                      onClick={() => handleOpenIssue(ETUDES_LATEST_ISSUE)}
                    >
                      {ETUDES_LATEST_ISSUE.title}
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Ligne Recherche filtrée sur cette revue (1:67) + Drag & Drop Upload (1:886) */}
            <div className="etudes-search-drop-row">
              <form
                className="etudes-journal-search-box"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <input
                  type="search"
                  className="etudes-journal-search-input"
                  placeholder="Recherche par mots-clés filtrée sur cette revue"
                  aria-label="Recherche par mots-clés filtrée sur cette revue"
                  value={journalSearchQuery}
                  onChange={(e) => setJournalSearchQuery(e.target.value)}
                />
                <button
                  type="submit"
                  className="etudes-journal-search-submit"
                  title="Rechercher dans la revue Études"
                  aria-label="Rechercher dans la revue Études"
                >
                  <img src={vector4Url} alt="" width={18} height={18} />
                </button>
              </form>

              {/* Boîte "Rajouter un fichier, étude / Drag & Drop" (1:886) */}
              <div
                className={`etudes-dropzone-pill ${isDraggingOverBox ? 'is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                title="Cliquez ou glissez-déposez un fichier (.pdf, .epub, .md, .txt) pour l'ajouter et le chiffrer dans votre bibliothèque"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverBox(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverBox(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverBox(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOverBox(false);
                  if (e.dataTransfer?.files?.length) {
                    void handleUploadFiles(e.dataTransfer.files);
                  }
                }}
              >
                <img
                  src={vector3Url}
                  alt=""
                  width={20}
                  height={20}
                  className="etudes-icon-invert"
                />
                <div className="etudes-dropzone-texts">
                  <span className="etudes-dropzone-line1">
                    {isUploading ? 'Chiffrement en cours…' : 'Rajouter un fichier, étude'}
                  </span>
                  <span className="etudes-dropzone-line2">Drag &amp; Drop</span>
                </div>
              </div>
            </div>

            {/* Section dynamique : Fichiers et études importés par l'utilisateur (synchronisés avec Folio) */}
            {filteredUploadedStudies.length > 0 && (
              <section
                aria-label="Mes études et fichiers importés"
                style={{ marginTop: 40, width: '100%' }}
              >
                <div className="etudes-section-header" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h2 className="etudes-section-h2">Mes études &amp; fichiers importés</h2>
                    <span className="etudes-tab-badge">{filteredUploadedStudies.length}</span>
                  </div>
                  <button
                    type="button"
                    className="etudes-text-link-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + Importer un autre fichier
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 16,
                  }}
                >
                  {filteredUploadedStudies.map((doc) => (
                    <div
                      key={doc.id}
                      className="etudes-article-card"
                      onClick={() => void openVaultDocumentInReader(doc)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: 16,
                      }}
                    >
                      {doc.coverDataUrl ? (
                        <img
                          src={doc.coverDataUrl}
                          alt={doc.title}
                          width={56}
                          height={80}
                          style={{
                            width: 56,
                            height: 80,
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '1px solid var(--etudes-border-cover)',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 56,
                            height: 80,
                            borderRadius: 6,
                            backgroundColor: 'var(--etudes-teal-dark)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: "'Alegreya', serif",
                            fontWeight: 700,
                            fontSize: 13,
                            textTransform: 'uppercase',
                            flexShrink: 0,
                          }}
                        >
                          {doc.format}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span className="etudes-meta-type-label">
                            {doc.category || 'Étude'} • {doc.format.toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteUploadedDoc(doc, e)}
                            title="Supprimer ce fichier"
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: 'var(--etudes-text-muted)',
                              cursor: 'pointer',
                              fontSize: 15,
                              padding: '0 4px',
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <h3
                          className="etudes-article-title"
                          style={{
                            fontSize: 18,
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {doc.title}
                        </h3>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 14,
                            color: 'var(--etudes-text-secondary)',
                          }}
                        >
                          {doc.author}
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 12,
                            color: 'var(--etudes-teal-accent)',
                            fontWeight: 600,
                          }}
                        >
                          {doc.progress?.percentage
                            ? `Progression : ${Math.round(doc.progress.percentage)}%`
                            : 'Cliquer pour ouvrir dans la liseuse Folio'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ==================== SECTION : NUMÉROS RÉCEMMENT AJOUTÉS (1:76) ==================== */}
            <section className="etudes-recent-section" aria-label="Numéros récemment ajoutés">
              <div className="etudes-section-header">
                <h2 className="etudes-section-h2">Numéros récemment ajoutés</h2>

                <div className="etudes-section-header-right">
                  <button
                    type="button"
                    className="etudes-text-link-btn"
                    onClick={() => setShowAllRecentGrid((v) => !v)}
                  >
                    {showAllRecentGrid ? 'Réduire en carrousel' : 'Voir tout'}
                  </button>

                  {!showAllRecentGrid && (
                    <div className="etudes-dots-row" role="tablist" aria-label="Pages du carrousel">
                      {Array.from({ length: totalCarouselPages }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="etudes-dot-btn"
                          aria-label={`Aller à la série ${idx + 1}`}
                          onClick={() => scrollToCarouselPage(idx)}
                        >
                          <img
                            src={carouselPage === idx ? dotActiveUrl : dotInactiveUrl}
                            alt=""
                            width={12}
                            height={12}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {filteredRecentIssues.length === 0 ? (
                <div
                  style={{
                    backgroundColor: 'var(--etudes-surface)',
                    border: '1px solid var(--etudes-border-card)',
                    borderRadius: 16,
                    padding: 28,
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 17 }}>
                    Aucun numéro ne correspond à votre recherche « {combinedQuery} ».
                  </p>
                </div>
              ) : showAllRecentGrid ? (
                <div className="etudes-issues-grid">
                  {filteredRecentIssues.map((issue) => (
                    <div key={issue.id} className="etudes-issue-card">
                      <button
                        type="button"
                        className="etudes-issue-cover-btn"
                        onClick={() => handleOpenIssue(issue)}
                        title={`Lire ${issue.issueRef} — ${issue.title}`}
                      >
                        <img
                          src={issue.coverUrl}
                          alt={issue.title}
                          width={206}
                          height={300}
                          style={{ display: 'block', width: 206, height: 300, objectFit: 'cover' }}
                        />
                      </button>

                      <div className="etudes-issue-card-meta">
                        <div className="etudes-meta-type">
                          <img
                            src={vector1Url}
                            alt=""
                            width={21}
                            height={16}
                            className="etudes-icon-invert"
                          />
                          <span className="etudes-meta-type-label">Numéro de revue</span>
                        </div>
                        <button
                          type="button"
                          className={`etudes-bookmark-btn ${
                            savedIds.includes(issue.id) ? 'is-saved' : ''
                          }`}
                          title="Ajouter à la liste de lecture"
                          aria-label="Ajouter à la liste de lecture"
                          onClick={(e) => handleToggleSavedItem(issue.id, issue.title, e)}
                        >
                          <img
                            src={vector2Url}
                            alt=""
                            width={12}
                            height={16}
                            className="etudes-icon-invert"
                          />
                        </button>
                      </div>

                      <p className="etudes-issue-ref" onClick={() => handleOpenIssue(issue)}>
                        {issue.issueRef}
                      </p>
                      <h3 className="etudes-issue-title" onClick={() => handleOpenIssue(issue)}>
                        {issue.title}
                      </h3>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="etudes-carousel-outer">
                  {/* Bouton Précédent (1:90) */}
                  <button
                    type="button"
                    className="etudes-carousel-arrow etudes-carousel-arrow--prev"
                    aria-label="Numéros précédents"
                    disabled={carouselPage <= 0}
                    onClick={() => scrollToCarouselPage(carouselPage - 1)}
                  >
                    <img
                      src={svg1Url}
                      alt=""
                      width={50}
                      height={50}
                      className="etudes-carousel-arrow-bg"
                    />
                    <img
                      src={svg2Url}
                      alt=""
                      width={20}
                      height={20}
                      className="etudes-carousel-arrow-icon etudes-carousel-arrow-icon--prev"
                    />
                  </button>

                  {/* Piste horizontale des 20 numéros (1:96 / 1:97) */}
                  <div
                    ref={carouselRef}
                    className="etudes-carousel-viewport"
                    onScroll={handleCarouselScroll}
                  >
                    {filteredRecentIssues.map((issue) => (
                      <div key={issue.id} className="etudes-issue-card">
                        <button
                          type="button"
                          className="etudes-issue-cover-btn"
                          onClick={() => handleOpenIssue(issue)}
                          title={`Lire ${issue.issueRef} — ${issue.title}`}
                        >
                          <img
                            src={issue.coverUrl}
                            alt={issue.title}
                            width={206}
                            height={300}
                            style={{
                              display: 'block',
                              width: 206,
                              height: 300,
                              objectFit: 'cover',
                            }}
                          />
                        </button>

                        <div className="etudes-issue-card-meta">
                          <div className="etudes-meta-type">
                            <img
                              src={vector1Url}
                              alt=""
                              width={21}
                              height={16}
                              className="etudes-icon-invert"
                            />
                            <span className="etudes-meta-type-label">Numéro de revue</span>
                          </div>

                          <button
                            type="button"
                            className={`etudes-bookmark-btn ${
                              savedIds.includes(issue.id) ? 'is-saved' : ''
                            }`}
                            title={
                              savedIds.includes(issue.id)
                                ? 'Retirer de la liste de lecture'
                                : 'Ajouter à la liste de lecture'
                            }
                            aria-label="Ajouter à la liste de lecture"
                            onClick={(e) => handleToggleSavedItem(issue.id, issue.title, e)}
                          >
                            <img
                              src={vector2Url}
                              alt=""
                              width={12}
                              height={16}
                              className="etudes-icon-invert"
                            />
                          </button>
                        </div>

                        <p className="etudes-issue-ref" onClick={() => handleOpenIssue(issue)}>
                          {issue.issueRef}
                        </p>
                        <h3 className="etudes-issue-title" onClick={() => handleOpenIssue(issue)}>
                          {issue.title}
                        </h3>
                      </div>
                    ))}
                  </div>

                  {/* Bouton Suivant (1:298) */}
                  <button
                    type="button"
                    className="etudes-carousel-arrow etudes-carousel-arrow--next"
                    aria-label="Numéros suivants"
                    disabled={carouselPage >= totalCarouselPages - 1}
                    onClick={() => scrollToCarouselPage(carouselPage + 1)}
                  >
                    <img
                      src={svg3Url}
                      alt=""
                      width={50}
                      height={50}
                      className="etudes-carousel-arrow-bg"
                    />
                    <img
                      src={svg2Url}
                      alt=""
                      width={20}
                      height={20}
                      className="etudes-carousel-arrow-icon"
                    />
                  </button>
                </div>
              )}
            </section>

            {/* ==================== SECTION : ARTICLES LES PLUS CONSULTÉS (1:304) ==================== */}
            <section className="etudes-articles-section" aria-label="Articles les plus consultés">
              <h2 className="etudes-section-h2">Articles les plus consultés</h2>

              <div className="etudes-articles-list">
                {filteredConsultedArticles.map((article) => (
                  <article
                    key={article.id}
                    className="etudes-article-card"
                    onClick={() => handleOpenArticle(article)}
                  >
                    <div className="etudes-meta-bar">
                      <div className="etudes-meta-type">
                        <img
                          src={vector5Url}
                          alt=""
                          width={16}
                          height={20}
                          className="etudes-icon-invert"
                        />
                        <span className="etudes-meta-type-label">{article.categoryLabel}</span>
                      </div>

                      <button
                        type="button"
                        className={`etudes-bookmark-btn ${
                          savedIds.includes(article.id) ? 'is-saved' : ''
                        }`}
                        title={
                          savedIds.includes(article.id)
                            ? 'Retirer de la liste de lecture'
                            : 'Ajouter à la liste de lecture'
                        }
                        aria-label="Ajouter à la liste de lecture"
                        onClick={(e) => handleToggleSavedItem(article.id, article.title, e)}
                      >
                        <img
                          src={vector2Url}
                          alt=""
                          width={12}
                          height={16}
                          className="etudes-icon-invert"
                        />
                      </button>
                    </div>

                    <div className="etudes-article-title-row">
                      <h3 className="etudes-article-title">{article.title}</h3>
                      {article.subtitle && (
                        <p className="etudes-article-subtitle">{article.subtitle}</p>
                      )}
                    </div>

                    <div className="etudes-article-authors">
                      {article.authors.map((author) => (
                        <button
                          key={author}
                          type="button"
                          className="etudes-author-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAuthorFilter((curr) => (curr === author ? null : author));
                          }}
                          title={`Filtrer par l'auteur ${author}`}
                        >
                          {author}
                        </button>
                      ))}
                    </div>

                    <p className="etudes-article-citation">
                      Dans <span className="etudes-article-citation-journal">Études</span>{' '}
                      <strong>{article.issueRef}</strong>, {article.pages}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {/* ==================== SECTION : LISTES (1:385) ==================== */}
            <section className="etudes-lists-section" aria-label="Listes thématiques">
              <div className="etudes-section-header">
                <h2 className="etudes-section-h2">Listes</h2>

                <div className="etudes-dots-row" role="tablist" aria-label="Sélection de listes">
                  {[0, 1].map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="etudes-dot-btn"
                      aria-label={`Liste ${idx + 1}`}
                      onClick={() => setActiveListDot(idx)}
                    >
                      <img
                        src={activeListDot === idx ? dotActiveUrl : dotInactiveUrl}
                        alt=""
                        width={12}
                        height={12}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="etudes-lists-row">
                {/* Carte empilée principale du Figma (1:387 : Politique américaine et politique étrangère) */}
                {allLists.map((listEntry, idx) => (
                  <div
                    key={listEntry.id}
                    className="etudes-stacked-card-wrap"
                    style={{
                      outline:
                        activeListDot === idx ? '2px solid var(--etudes-teal-accent)' : 'none',
                      borderRadius: 16,
                    }}
                    onClick={() => {
                      setActiveListId(listEntry.id);
                      setActiveTab('listes');
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setActiveListId(listEntry.id);
                        setActiveTab('listes');
                      }
                    }}
                  >
                    <div className="etudes-stacked-layer-bottom" />
                    <div className="etudes-stacked-layer-middle" />
                    <div className="etudes-stacked-layer-front">
                      <div>
                        <div className="etudes-meta-type" style={{ height: 32 }}>
                          <img
                            src={svg4Url}
                            alt=""
                            width={24}
                            height={24}
                            className="etudes-icon-invert"
                          />
                          <span className="etudes-meta-type-label">{listEntry.badge}</span>
                        </div>

                        <h3 className="etudes-stacked-title">{listEntry.title}</h3>
                        <p className="etudes-stacked-author">{listEntry.author}</p>
                      </div>

                      <p className="etudes-stacked-count">{listEntry.itemsCountLabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* -------------------- ONGLET 2 : NUMÉROS (Catalogue intégral + Imports) -------------------- */}
        {activeTab === 'numeros' && (
          <section aria-label="Tous les numéros de la revue Études">
            <div
              className="etudes-section-header"
              style={{ flexWrap: 'wrap', gap: 16, marginBottom: 28 }}
            >
              <div>
                <h2 className="etudes-section-h2">
                  Tous les numéros d’Études ({filteredAllIssues.length})
                </h2>
                <p style={{ margin: '6px 0 0', color: 'var(--etudes-text-secondary)' }}>
                  Cliquez sur n’importe quel numéro pour l’ouvrir dans la liseuse Folio, surligner
                  des passages et prendre des notes chiffrées.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 2026, label: '2026' },
                    { id: 2025, label: '2025' },
                    { id: 'uploads', label: `Mes études (${userUploadedStudies.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={String(tab.id)}
                    type="button"
                    onClick={() => setSelectedYearFilter(tab.id)}
                    style={{
                      border: '1px solid var(--etudes-border)',
                      borderRadius: 999,
                      padding: '6px 14px',
                      fontSize: 15,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      backgroundColor:
                        selectedYearFilter === tab.id
                          ? 'var(--etudes-teal-dark)'
                          : 'var(--etudes-surface)',
                      color: selectedYearFilter === tab.id ? '#ffffff' : 'var(--etudes-text-main)',
                      fontWeight: selectedYearFilter === tab.id ? 600 : 400,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedYearFilter !== 'uploads' && (
              <div className="etudes-issues-grid">
                {filteredAllIssues.map((issue) => (
                  <div key={issue.id} className="etudes-issue-card">
                    <button
                      type="button"
                      className="etudes-issue-cover-btn"
                      onClick={() => handleOpenIssue(issue)}
                    >
                      <img
                        src={issue.coverUrl}
                        alt={issue.title}
                        width={206}
                        height={300}
                        style={{ display: 'block', width: 206, height: 300, objectFit: 'cover' }}
                      />
                    </button>

                    <div className="etudes-issue-card-meta">
                      <div className="etudes-meta-type">
                        <img
                          src={vector1Url}
                          alt=""
                          width={21}
                          height={16}
                          className="etudes-icon-invert"
                        />
                        <span className="etudes-meta-type-label">Numéro de revue</span>
                      </div>
                      <button
                        type="button"
                        className={`etudes-bookmark-btn ${
                          savedIds.includes(issue.id) ? 'is-saved' : ''
                        }`}
                        onClick={(e) => handleToggleSavedItem(issue.id, issue.title, e)}
                      >
                        <img
                          src={vector2Url}
                          alt=""
                          width={12}
                          height={16}
                          className="etudes-icon-invert"
                        />
                      </button>
                    </div>

                    <p className="etudes-issue-ref" onClick={() => handleOpenIssue(issue)}>
                      {issue.issueRef}
                    </p>
                    <h3 className="etudes-issue-title" onClick={() => handleOpenIssue(issue)}>
                      {issue.title}
                    </h3>
                  </div>
                ))}
              </div>
            )}

            {(selectedYearFilter === 'uploads' || userUploadedStudies.length > 0) && (
              <div style={{ marginTop: selectedYearFilter === 'uploads' ? 0 : 48 }}>
                <h3 className="etudes-section-h2" style={{ marginBottom: 18 }}>
                  Mes fichiers et études importés ({filteredUploadedStudies.length})
                </h3>
                {filteredUploadedStudies.length === 0 ? (
                  <div
                    className="etudes-article-card"
                    style={{ textAlign: 'center', padding: 32 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
                      Aucun fichier importé pour le moment
                    </p>
                    <p style={{ margin: 0, color: 'var(--etudes-text-muted)' }}>
                      Cliquez ici ou glissez-déposez un fichier PDF, EPUB, Markdown ou TXT pour
                      l’ajouter à votre espace Études &amp; Folio.
                    </p>
                  </div>
                ) : (
                  <div className="etudes-articles-list">
                    {filteredUploadedStudies.map((doc) => (
                      <article
                        key={doc.id}
                        className="etudes-article-card"
                        onClick={() => void openVaultDocumentInReader(doc)}
                      >
                        <div className="etudes-meta-bar">
                          <span className="etudes-meta-type-label">
                            Fichier importé • {doc.format.toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteUploadedDoc(doc, e)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: 'var(--etudes-text-muted)',
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            Supprimer
                          </button>
                        </div>
                        <h4 className="etudes-article-title" style={{ marginTop: 8 }}>
                          {doc.title}
                        </h4>
                        <p style={{ margin: '6px 0 0', color: 'var(--etudes-text-secondary)' }}>
                          {doc.author} • {doc.originalName}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* -------------------- ONGLET 3 : VIDÉOS / PODCASTS -------------------- */}
        {activeTab === 'medias' && (
          <section aria-label="Vidéos et Podcasts de la revue Études">
            <h2 className="etudes-section-h2">Vidéos, Podcasts &amp; Entretiens</h2>
            <p style={{ margin: '8px 0 24px', color: 'var(--etudes-text-secondary)' }}>
              Écoutez et lisez les transcriptions intégrales des entretiens de la rédaction dans la
              liseuse Folio.
            </p>

            <div className="etudes-articles-list">
              {ETUDES_MEDIA_ITEMS.map((media) => (
                <article
                  key={media.id}
                  className="etudes-article-card"
                  onClick={() => handleOpenMedia(media)}
                >
                  <div className="etudes-meta-bar">
                    <div className="etudes-meta-type">
                      <img
                        src={svg7Url}
                        alt=""
                        width={20}
                        height={20}
                        className="etudes-icon-invert"
                      />
                      <span className="etudes-meta-type-label">
                        {media.kind} • {media.duration}
                      </span>
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--etudes-text-muted)' }}>
                      {media.dateLabel}
                    </span>
                  </div>

                  <h3 className="etudes-article-title" style={{ marginTop: 12 }}>
                    {media.title}
                  </h3>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontWeight: 500,
                      color: 'var(--etudes-text-secondary)',
                    }}
                  >
                    Avec {media.speaker}
                  </p>
                  <p style={{ margin: '8px 0 0', lineHeight: 1.5 }}>{media.summary}</p>
                  <p
                    style={{
                      margin: '12px 0 0',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--etudes-teal-accent)',
                    }}
                  >
                    Ouvrir la transcription et annoter dans la liseuse →
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* -------------------- ONGLET 4 : LISTES & MA LISTE DE LECTURE -------------------- */}
        {activeTab === 'listes' && (
          <section aria-label="Listes de lecture">
            <div className="etudes-section-header">
              <h2 className="etudes-section-h2">Listes thématiques &amp; Liste de lecture</h2>
            </div>

            <div className="etudes-lists-row" style={{ marginBottom: 40 }}>
              {allLists.map((listEntry) => {
                const isSelected = (activeListId || allLists[0].id) === listEntry.id;
                return (
                  <div
                    key={listEntry.id}
                    className="etudes-stacked-card-wrap"
                    style={{
                      outline: isSelected ? '2px solid var(--etudes-teal-accent)' : 'none',
                      borderRadius: 16,
                    }}
                    onClick={() => setActiveListId(listEntry.id)}
                  >
                    <div className="etudes-stacked-layer-bottom" />
                    <div className="etudes-stacked-layer-middle" />
                    <div className="etudes-stacked-layer-front">
                      <div>
                        <div className="etudes-meta-type" style={{ height: 32 }}>
                          <img
                            src={svg4Url}
                            alt=""
                            width={24}
                            height={24}
                            className="etudes-icon-invert"
                          />
                          <span className="etudes-meta-type-label">{listEntry.badge}</span>
                        </div>
                        <h3 className="etudes-stacked-title">{listEntry.title}</h3>
                        <p className="etudes-stacked-author">{listEntry.author}</p>
                      </div>
                      <p className="etudes-stacked-count">{listEntry.itemsCountLabel}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {(() => {
              const currentList =
                allLists.find((l) => l.id === activeListId) || allLists[0];
              const { resolvedIssues, resolvedArticles } = resolveListItems(currentList.itemIds);
              return (
                <div>
                  <h3 className="etudes-section-h2">{currentList.title}</h3>
                  <p style={{ margin: '6px 0 24px', color: 'var(--etudes-text-secondary)' }}>
                    {currentList.description}
                  </p>

                  {resolvedIssues.length === 0 && resolvedArticles.length === 0 ? (
                    <div className="etudes-article-card" style={{ padding: 28 }}>
                      <p style={{ margin: 0 }}>
                        Cette liste ne contient aucun élément pour le moment. Cliquez sur l’icône de
                        signet d’un numéro ou d’un article pour l’ajouter.
                      </p>
                    </div>
                  ) : (
                    <div className="etudes-articles-list">
                      {resolvedIssues.map((iss) => (
                        <article
                          key={iss.id}
                          className="etudes-article-card"
                          onClick={() => handleOpenIssue(iss)}
                          style={{ display: 'flex', gap: 20, alignItems: 'center' }}
                        >
                          <img
                            src={iss.coverUrl}
                            alt={iss.title}
                            width={68}
                            height={100}
                            style={{
                              width: 68,
                              height: 100,
                              objectFit: 'cover',
                              borderRadius: 4,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <span className="etudes-meta-type-label">
                              Numéro de revue • {iss.issueRef}
                            </span>
                            <h4 className="etudes-article-title" style={{ marginTop: 6 }}>
                              {iss.title}
                            </h4>
                            <p
                              style={{
                                margin: '6px 0 0',
                                color: 'var(--etudes-text-secondary)',
                              }}
                            >
                              {iss.summary}
                            </p>
                          </div>
                        </article>
                      ))}

                      {resolvedArticles.map((art) => (
                        <article
                          key={art.id}
                          className="etudes-article-card"
                          onClick={() => handleOpenArticle(art)}
                        >
                          <span className="etudes-meta-type-label">{art.categoryLabel}</span>
                          <h4 className="etudes-article-title" style={{ marginTop: 6 }}>
                            {art.title} {art.subtitle ? `— ${art.subtitle}` : ''}
                          </h4>
                          <p style={{ margin: '6px 0 0', color: 'var(--etudes-text-secondary)' }}>
                            {art.authors.join(', ')} • {art.issueCitation}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {/* -------------------- ONGLET 5 : À PROPOS -------------------- */}
        {activeTab === 'apropos' && (
          <section aria-label="À propos de la revue Études">
            <div
              className="etudes-article-card"
              style={{ cursor: 'default', padding: '32px 36px' }}
            >
              <h2 className="etudes-section-h2" style={{ marginBottom: 16 }}>
                À propos de la revue Études
              </h2>
              <p style={{ fontSize: 18, lineHeight: 1.6, margin: '0 0 24px' }}>
                {ETUDES_ABOUT_FULL_TEXT.shortExcerpt}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 20,
                  marginBottom: 28,
                }}
              >
                {ETUDES_ABOUT_FULL_TEXT.sections.map((sec) => (
                  <div
                    key={sec.title}
                    style={{
                      backgroundColor: 'var(--etudes-surface-subtle)',
                      borderRadius: 12,
                      padding: 20,
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: "'Alegreya', serif",
                        fontSize: 20,
                        margin: '0 0 8px',
                      }}
                    >
                      {sec.title}
                    </h3>
                    <p style={{ margin: 0, lineHeight: 1.55, color: 'var(--etudes-text-secondary)' }}>
                      {sec.body}
                    </p>
                  </div>
                ))}
              </div>

              <h3
                style={{
                  fontFamily: "'Alegreya', serif",
                  fontSize: 20,
                  margin: '0 0 12px',
                }}
              >
                Informations éditoriales (S.E.R.)
              </h3>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  margin: 0,
                }}
              >
                {ETUDES_ABOUT_FULL_TEXT.editorialTeam.map((item) => (
                  <div
                    key={item.role}
                    style={{
                      border: '1px solid var(--etudes-border)',
                      borderRadius: 10,
                      padding: '10px 14px',
                    }}
                  >
                    <dt style={{ fontSize: 12, color: 'var(--etudes-text-muted)', fontWeight: 700 }}>
                      {item.role.toUpperCase()}
                    </dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 500 }}>
                      {item.name}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}
      </main>

      {/* ==================== LISEUSE FOLIO INTÉGRÉE (VaultReaderModal) ==================== */}
      {activeDocMeta && activeDecryptedBuffer && (
        <VaultReaderModal
          documentMeta={activeDocMeta}
          decryptedBuffer={activeDecryptedBuffer}
          initialStudyData={activeStudyData}
          initialTheme={isDark ? 'dark' : 'light'}
          onClose={handleCloseReader}
          onLockNow={handleLockVault}
          onToggleFavorite={handleToggleFavoriteInReader}
          onSaveProgress={handleSaveProgress}
          onSaveStudyData={handleSaveStudyData}
        />
      )}

      {/* ==================== MODALE DE DÉVERROUILLAGE / INITIALISATION DU COFFRE FOLIO ==================== */}
      {showVaultModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowVaultModal(false)}
        >
          <div
            style={{ position: 'relative', width: '100%', maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowVaultModal(false)}
              style={{
                position: 'absolute',
                right: 16,
                top: 16,
                zIndex: 10,
                border: 0,
                background: 'rgba(255,255,255,0.85)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                cursor: 'pointer',
                fontWeight: 700,
              }}
              aria-label="Fermer"
            >
              ×
            </button>
            <VaultAuthScreen
              authConfig={authConfig}
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
              onInitializeVault={handleInitializeVault}
              onUnlockVault={handleUnlockVault}
              onResetVault={handleResetVault}
            />
          </div>
        </div>
      )}

      {/* ==================== MODALE APPAREILS CONNECTÉS (DevicesPanel) ==================== */}
      {showDevicesModal && <DevicesPanel onClose={() => setShowDevicesModal(false)} />}

      {/* ==================== TOAST NOTIFICATION ==================== */}
      {toastMessage && (
        <div className="launchpad-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
