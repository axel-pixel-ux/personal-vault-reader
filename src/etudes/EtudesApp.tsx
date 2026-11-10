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
  DEFAULT_CATEGORIES,
  DocumentFormat,
  DocumentStudyData,
  ReadingProgress,
  VaultAuthConfig,
  VaultDocumentMeta,
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
  getVaultAuthConfig,
  resetEntireVault,
  saveVaultAuthConfig,
} from '../services/vaultStorage';
import { extractCleanDocumentMetadata } from '../utils/metadataCleaner';
import { VaultAuthScreen } from '../components/VaultAuthScreen';
import { VaultReaderModal } from '../components/readers/VaultReaderModal';

import { ETUDES_ABOUT_FULL_TEXT } from './etudesCatalog';
import {
  addLinkedVersionToArticle,
  classifyAllThemesWithGemini,
  classifyArticleWithGemini,
  createDefaultReadingList,
  createEtudeArticleWithVersion,
  DEFAULT_READING_LIST_ID,
  deleteEtudeArticle,
  deleteEtudeList,
  deleteEtudeVersion,
  ensureVersionEncryptedBlob,
  ETUDES_ADMIN_EMAIL,
  EtudeArticleItem,
  EtudeListItem,
  EtudeVersionItem,
  fetchEtudesState,
  getEtudesSharedAesKey,
  patchEtudeArticle,
  patchEtudeVersion,
  saveEtudeList,
  saveGeminiApiKey,
  saveVersionStudyEncrypted,
  ThemeGroup,
} from './etudesService';

// Icônes SVG du design Figma svlydaZ169BAsHSgqHY869
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

function detectDefaultVersionLabel(filename: string): string {
  const lower = filename.toLowerCase();
  if (/\bvo\b|_vo\b|-vo\b|\(vo\)/i.test(lower)) return 'VO';
  if (/\bvf\b|_vf\b|-vf\b|\(vf\)/i.test(lower)) return 'VF';
  return 'VF';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDateShort(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
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

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Études — Revue de culture contemporaine';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  // Authentification et clé AES-256-GCM partagées avec Folio (sans partager les fichiers)
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);
  const [authConfig, setAuthConfig] = useState<VaultAuthConfig | null>(null);
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [serverCanManageDocs, setServerCanManageDocs] = useState<boolean>(false);
  const [showVaultModal, setShowVaultModal] = useState<boolean>(false);
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState<boolean>(false);
  const [showDevicesModal, setShowDevicesModal] = useState<boolean>(false);

  // Seul le compte samamaaxel@gmail.com peut ajouter, modifier ou supprimer des documents sur le site Études
  const canManageDocuments = useMemo(() => {
    const emailMatch =
      (accountEmail?.trim().toLowerCase() ?? '') === ETUDES_ADMIN_EMAIL;
    return emailMatch || serverCanManageDocs;
  }, [accountEmail, serverCanManageDocs]);

  // Données exclusives au site Études (aucun fichier de base, aucun fichier Folio)
  const [articles, setArticles] = useState<EtudeArticleItem[]>([]);
  const [lists, setLists] = useState<EtudeListItem[]>(() => [createDefaultReadingList()]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDraggingOverBox, setIsDraggingOverBox] = useState<boolean>(false);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Page dédiée d'une étude (?article=<id>) + sélection de la version (VF / VO / etc.)
  const [openedArticleId, setOpenedArticleId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('article');
  });
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [newLinkedVersionLabel, setNewLinkedVersionLabel] = useState<string>('VO');
  const [isDraggingOverLinkedBox, setIsDraggingOverLinkedBox] = useState<boolean>(false);
  const linkedFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingVersionLabelValue, setEditingVersionLabelValue] = useState<string>('');

  // Synchronisation de l'URL lors de l'ouverture / fermeture d'une page d'étude
  const navigateToArticlePage = useCallback((articleId: string | null) => {
    const url = articleId
      ? `/etudes?article=${encodeURIComponent(articleId)}`
      : '/etudes';
    window.history.pushState({}, '', url);
    setOpenedArticleId(articleId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const id = new URLSearchParams(window.location.search).get('article');
      setOpenedArticleId(id);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Navigation et filtres sur la page principale
  const [activeTab, setActiveTab] = useState<EtudesTab>('apercu');
  const [topSearchQuery, setTopSearchQuery] = useState<string>('');
  const [journalSearchQuery, setJournalSearchQuery] = useState<string>('');
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState<string | null>(null);
  const [selectedThemeFilter, setSelectedThemeFilter] = useState<string | null>(null);
  const [selectedGrandTheme, setSelectedGrandTheme] = useState<string | null>(null);
  const [themesViewMode, setThemesViewMode] = useState<'grands-themes' | 'tags'>('grands-themes');
  const [taxonomyGroups, setTaxonomyGroups] = useState<ThemeGroup[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [isClassifyingThemes, setIsClassifyingThemes] = useState<boolean>(false);
  const [isClassifyingArticle, setIsClassifyingArticle] = useState<boolean>(false);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState<boolean>(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>('');
  const [showGeminiKeyPlain, setShowGeminiKeyPlain] = useState<boolean>(false);
  const [geminiKeyModalError, setGeminiKeyModalError] = useState<string | null>(null);
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState<boolean>(false);
  const [isThemesExpanded, setIsThemesExpanded] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [showAllRecentGrid, setShowAllRecentGrid] = useState<boolean>(false);
  const [activeListId, setActiveListId] = useState<string>(DEFAULT_READING_LIST_ID);
  const [activeListDot, setActiveListDot] = useState<number>(0);

  // Saisie de thèmes sur la fiche d'étude et dans la modale "Modifier la fiche"
  const [ficheThemeInput, setFicheThemeInput] = useState<string>('');
  const [modalThemeInput, setModalThemeInput] = useState<string>('');

  // Modale de création / modification de liste
  const [listModalState, setListModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    listId: string;
    title: string;
    badge: string;
    description: string;
    articleIds: string[];
  } | null>(null);

  // Modale de modification des métadonnées d'une étude
  const [editArticleModal, setEditArticleModal] = useState<{
    articleId: string;
    title: string;
    subtitle: string;
    author: string;
    genre: string;
    issueRef: string;
    description: string;
    themes: string[];
  } | null>(null);

  // Bloquer le défilement de la page en arrière-plan lorsqu'une fenêtre modale est ouverte
  useEffect(() => {
    const anyModalOpen = Boolean(
      editArticleModal || listModalState?.open || showVaultModal || showDevicesModal
    );
    if (!anyModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editArticleModal, listModalState, showVaultModal, showDevicesModal]);

  // Carrousel des études récemment ajoutées
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselPage, setCarouselPage] = useState<number>(0);

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

  // Liseuse Folio (VaultReaderModal) ouverte sur une version précise (VF, VO...)
  const [readerState, setReaderState] = useState<{
    article: EtudeArticleItem;
    version: EtudeVersionItem;
    docMeta: VaultDocumentMeta;
    decryptedBuffer: ArrayBuffer;
    studyData: DocumentStudyData;
  } | null>(null);

  const profileOnServer = useRef<boolean>(false);

  const refreshEtudesData = useCallback(async () => {
    const state = await fetchEtudesState();
    setArticles(state.articles);
    setLists(state.lists.length > 0 ? state.lists : [createDefaultReadingList()]);
    setServerCanManageDocs(Boolean(state.canManageDocuments));
    if (state.taxonomy) {
      setTaxonomyGroups(state.taxonomy.groups || []);
      setHasGeminiKey(Boolean(state.taxonomy.hasGeminiKey));
    }
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
      await refreshEtudesData();
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
    setSessionKey(key);
    await refreshEtudesData();
  }, [refreshEtudesData]);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        await syncFromServer();
      } catch (err) {
        console.error('Synchronisation du compte Folio/Études impossible:', err);
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

  // Initialisation ou déverrouillage du coffre AES-256-GCM (même compte que Folio)
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
      customCategories: [...DEFAULT_CATEGORIES],
    };

    const created = await pushVaultProfile(newConfig, passphrase);
    if (!created) {
      await syncFromServer();
      setShowVaultModal(false);
      return;
    }
    profileOnServer.current = true;
    await saveVaultAuthConfig(newConfig);

    setAuthConfig(newConfig);
    setSessionKey(material.aesKey);
    await refreshEtudesData();
    setShowVaultModal(false);
    showToast(`Bienvenue ${username} — Votre compte Folio & Études est prêt.`);
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

    setSessionKey(derivedKey);
    await refreshEtudesData();
    setShowVaultModal(false);
    showToast('Session déverrouillée avec succès.');
    return true;
  };

  const handleLockVault = useCallback(() => {
    if (readerState?.decryptedBuffer) {
      try {
        new Uint8Array(readerState.decryptedBuffer).fill(0);
      } catch {
        // Ignorer
      }
    }
    setReaderState(null);
    setSessionKey(null);
    setShowAccountMenu(false);
    showToast('Coffre verrouillé pour cette session.');
  }, [readerState, showToast]);

  const handleResetVault = async () => {
    handleLockVault();
    await resetEntireVault();
    await deleteVaultProfile().catch(() => {});
    profileOnServer.current = false;
    setAuthConfig(null);
  };

  // ==================== IMPORT D'UNE NOUVELLE ÉTUDE (Réservé à samamaaxel@gmail.com) ====================
  const handleUploadNewStudies = useCallback(
    async (files: FileList | File[]) => {
      if (!canManageDocuments) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      setIsUploading(true);
      let addedCount = 0;
      const rejected: string[] = [];
      let lastArticle: EtudeArticleItem | null = null;

      try {
        const etudesKey = await getEtudesSharedAesKey();
        for (const file of list) {
          const format = extractFormatFromFilename(file.name);
          if (!format) {
            rejected.push(file.name);
            continue;
          }

          const plainBuffer = await file.arrayBuffer();
          const extracted = await extractCleanDocumentMetadata(file.name, format, plainBuffer);

          // Extrait de texte pour l'analyse IA de Gemini
          let textExcerpt = extracted.description || '';
          if (format === 'txt' || format === 'md') {
            try {
              textExcerpt = new TextDecoder('utf-8').decode(plainBuffer.slice(0, 3000));
            } catch {}
          }

          // Analyse automatique par Gemini pour déterminer le genre et les thèmes
          let aiGenre = 'Étude';
          let aiThemes: string[] = [];
          try {
            const aiResult = await classifyArticleWithGemini({
              title: extracted.title,
              author: extracted.author,
              description: extracted.description,
              filename: file.name,
              excerpt: textExcerpt,
            });
            if (aiResult) {
              aiGenre = aiResult.genre || 'Étude';
              aiThemes = Array.from(
                new Set([aiResult.grandTheme, ...aiResult.sousThemes].filter(Boolean)),
              );
            }
          } catch (aiErr) {
            console.warn('Classification IA automatique du fichier déposé:', aiErr);
          }

          const { iv, encryptedData, ivHex } = await encryptBuffer(plainBuffer, etudesKey);
          const now = Date.now();
          const articleId = window.crypto.randomUUID();
          const versionId = window.crypto.randomUUID();
          const versionLabel = detectDefaultVersionLabel(file.name);

          const created = await createEtudeArticleWithVersion({
            articleId,
            title: extracted.title,
            subtitle: '',
            author: extracted.author || authConfig?.username || 'Études',
            genre: aiGenre,
            issueRef: formatDateShort(now),
            description: extracted.description || '',
            themes: aiThemes.length > 0 ? aiThemes : ['Étude'],
            coverDataUrl: extracted.coverDataUrl,
            addedAt: now,
            version: {
              id: versionId,
              versionLabel,
              originalName: file.name,
              format,
              size: plainBuffer.byteLength,
              cipherSize: encryptedData.byteLength,
              ivHex,
              iv,
              encryptedData,
              addedAt: now,
            },
          });

          if (created) {
            lastArticle = created;
            addedCount++;
          }
        }

        await refreshEtudesData();

        // Met à jour la taxonomie globale des thèmes en arrière-plan
        if (addedCount > 0) {
          void classifyAllThemesWithGemini().then((res) => {
            if (res?.groups) setTaxonomyGroups(res.groups);
          }).catch(() => {});
        }

        if (addedCount === 1 && lastArticle) {
          const themesPreview = (lastArticle.themes || []).join(', ');
          showToast(
            `Étude « ${lastArticle.title} » ajoutée (${lastArticle.genre || 'Étude'}${themesPreview ? ` • Thèmes : ${themesPreview}` : ''})`
          );
          navigateToArticlePage(lastArticle.id);
        } else if (addedCount > 1) {
          showToast(`${addedCount} études ajoutées avec analyse automatique des genres et thèmes.`);
        }
        if (rejected.length > 0) {
          showToast(
            `Format non supporté (${rejected.join(', ')}). Formats acceptés : PDF, EPUB, MD, TXT.`
          );
        }
      } catch (err) {
        console.error('Erreur import étude:', err);
        showToast("Erreur lors de l'importation de l'étude.");
      } finally {
        setIsUploading(false);
      }
    },
    [canManageDocuments, authConfig?.username, refreshEtudesData, showToast, navigateToArticlePage]
  );

  // ==================== AJOUT D'UN FICHIER LIÉ (Réservé à samamaaxel@gmail.com) ====================
  const handleAddLinkedFilesToCurrentArticle = useCallback(
    async (article: EtudeArticleItem, files: FileList | File[], preferredLabel: string) => {
      if (!canManageDocuments) return;
      const list = Array.from(files);
      if (list.length === 0) return;

      setIsUploading(true);
      let addedCount = 0;
      let lastCreatedVersion: EtudeVersionItem | null = null;

      try {
        const etudesKey = await getEtudesSharedAesKey();
        for (let i = 0; i < list.length; i++) {
          const file = list[i];
          const format = extractFormatFromFilename(file.name);
          if (!format) continue;

          const plainBuffer = await file.arrayBuffer();
          const { iv, encryptedData, ivHex } = await encryptBuffer(plainBuffer, etudesKey);
          const now = Date.now();
          const versionId = window.crypto.randomUUID();
          const label =
            preferredLabel.trim() ||
            detectDefaultVersionLabel(file.name) ||
            `Version ${article.versions.length + i + 1}`;

          const createdVer = await addLinkedVersionToArticle({
            articleId: article.id,
            versionId,
            versionLabel: label,
            originalName: file.name,
            format,
            size: plainBuffer.byteLength,
            cipherSize: encryptedData.byteLength,
            ivHex,
            iv,
            encryptedData,
            addedAt: now,
          });

          if (createdVer) {
            lastCreatedVersion = createdVer;
            addedCount++;
          }
        }

        await refreshEtudesData();
        if (lastCreatedVersion) {
          setSelectedVersionId(lastCreatedVersion.id);
          showToast(
            addedCount === 1
              ? `Version « ${lastCreatedVersion.versionLabel} » liée à l’article.`
              : `${addedCount} versions liées ajoutées à l’article.`
          );
        }
      } catch (err) {
        console.error('Erreur ajout fichier lié:', err);
        showToast("Erreur lors de l'ajout du fichier lié.");
      } finally {
        setIsUploading(false);
      }
    },
    [canManageDocuments, refreshEtudesData, showToast]
  );

  // ==================== OUVERTURE D'UNE VERSION DANS LA LISEUSE FOLIO ====================
  const handleReadArticleVersion = useCallback(
    async (article: EtudeArticleItem, version: EtudeVersionItem) => {
      try {
        const blobData = await ensureVersionEncryptedBlob(version);
        if (!blobData) {
          showToast('Impossible de charger le fichier chiffré de cette version.');
          return;
        }

        const etudesKey = await getEtudesSharedAesKey();
        let decryptedBuffer: ArrayBuffer;
        try {
          decryptedBuffer = await decryptBuffer(blobData.encryptedData, blobData.iv, etudesKey);
        } catch {
          if (!sessionKey) {
            setShowVaultModal(true);
            showToast('Déverrouillez votre session pour lire cette étude.');
            return;
          }
          decryptedBuffer = await decryptBuffer(blobData.encryptedData, blobData.iv, sessionKey);
        }

        const activeStudyKey = sessionKey ?? etudesKey;
        const studyData = await decryptStudyData(
          blobData.encryptedAnnotations,
          blobData.annotationsIv,
          activeStudyKey
        );

        const updatedVer = await patchEtudeVersion(version.id, { touchOpenedAt: true });
        await refreshEtudesData();

        const defaultReadingList = lists.find((l) => l.id === DEFAULT_READING_LIST_ID);
        const isFav = Boolean(defaultReadingList?.articleIds.includes(article.id));

        const docMeta: VaultDocumentMeta = {
          id: version.id,
          title: `${article.title} (${version.versionLabel})`,
          author: article.author || 'Études',
          description: article.description || article.subtitle || '',
          category: `Version ${version.versionLabel}`,
          isFavorite: isFav,
          bookmarksCount: studyData.bookmarks.length,
          annotationsCount: studyData.annotations.length,
          originalName: version.originalName,
          format: version.format,
          size: version.size,
          cipherSize: version.cipherSize,
          ivHex: version.ivHex,
          addedAt: version.addedAt,
          lastOpenedAt: Date.now(),
          progress: updatedVer?.progress ?? version.progress,
          coverDataUrl: article.coverDataUrl,
        };

        setReaderState({
          article,
          version: updatedVer ?? version,
          docMeta,
          decryptedBuffer,
          studyData,
        });
      } catch (err) {
        console.error('Erreur déchiffrement version étude:', err);
        showToast('Erreur lors du déchiffrement de cette version.');
      }
    },
    [sessionKey, lists, refreshEtudesData, showToast]
  );

  const handleCloseReader = useCallback(() => {
    if (readerState?.decryptedBuffer) {
      try {
        new Uint8Array(readerState.decryptedBuffer).fill(0);
      } catch {
        // Ignorer
      }
    }
    setReaderState(null);
  }, [readerState]);

  const handleSaveReaderProgress = useCallback(
    async (_versionId: string, progress: Partial<ReadingProgress>) => {
      if (!readerState) return;
      const updated = await patchEtudeVersion(readerState.version.id, {
        progress,
        touchOpenedAt: true,
      });
      if (updated) {
        setReaderState((curr) =>
          curr
            ? {
                ...curr,
                version: updated,
                docMeta: { ...curr.docMeta, progress: updated.progress },
              }
            : null
        );
        setArticles((prev) =>
          prev.map((a) =>
            a.id === readerState.article.id
              ? {
                  ...a,
                  versions: a.versions.map((v) => (v.id === updated.id ? updated : v)),
                }
              : a
          )
        );
      }
    },
    [readerState]
  );

  const handleSaveReaderStudyData = useCallback(
    async (_versionId: string, data: DocumentStudyData) => {
      if (!readerState || !sessionKey) return;
      const { annotationsIv, encryptedAnnotations } = await encryptStudyData(data, sessionKey);
      const updated = await saveVersionStudyEncrypted(
        readerState.version.id,
        annotationsIv,
        encryptedAnnotations,
        data.bookmarks.length,
        data.annotations.length
      );
      if (updated) {
        setReaderState((curr) =>
          curr
            ? {
                ...curr,
                version: updated,
                studyData: data,
                docMeta: {
                  ...curr.docMeta,
                  bookmarksCount: data.bookmarks.length,
                  annotationsCount: data.annotations.length,
                },
              }
            : null
        );
        setArticles((prev) =>
          prev.map((a) =>
            a.id === readerState.article.id
              ? {
                  ...a,
                  versions: a.versions.map((v) => (v.id === updated.id ? updated : v)),
                }
              : a
          )
        );
      }
    },
    [readerState, sessionKey]
  );

  // ==================== GESTION DES LISTES (Ajouter, Modifier, Supprimer) ====================
  const defaultReadingList = useMemo(() => {
    return (
      lists.find((l) => l.id === DEFAULT_READING_LIST_ID) ||
      lists[0] ||
      createDefaultReadingList()
    );
  }, [lists]);

  const handleToggleArticleInList = useCallback(
    async (list: EtudeListItem, article: EtudeArticleItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const exists = list.articleIds.includes(article.id);
      const nextIds = exists
        ? list.articleIds.filter((id) => id !== article.id)
        : [...list.articleIds, article.id];

      const saved = await saveEtudeList(list.id, {
        badge: list.badge,
        title: list.title,
        author: list.author || authConfig?.username || 'Études',
        description: list.description,
        articleIds: nextIds,
      });

      if (saved) {
        setLists((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
        showToast(
          exists
            ? `Retiré de « ${list.title} ».`
            : `Ajouté à « ${list.title} ».`
        );
      }
    },
    [authConfig?.username, showToast]
  );

  const openCreateListModal = useCallback(() => {
    setListModalState({
      open: true,
      mode: 'create',
      listId: `liste-${window.crypto.randomUUID().slice(0, 8)}`,
      title: '',
      badge: 'Liste personnelle',
      description: '',
      articleIds: [],
    });
  }, []);

  const openEditListModal = useCallback(
    (list: EtudeListItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setListModalState({
        open: true,
        mode: 'edit',
        listId: list.id,
        title: list.title,
        badge: list.badge,
        description: list.description,
        articleIds: [...list.articleIds],
      });
    },
    []
  );

  const handleSubmitListModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listModalState) return;
    const cleanTitle = listModalState.title.trim();
    if (!cleanTitle) {
      showToast('Veuillez saisir un titre pour la liste.');
      return;
    }

    const saved = await saveEtudeList(listModalState.listId, {
      badge: listModalState.badge.trim() || 'Liste personnelle',
      title: cleanTitle,
      author: authConfig?.username || accountEmail || 'Mon espace Études',
      description: listModalState.description.trim(),
      articleIds: listModalState.articleIds,
    });

    if (saved) {
      await refreshEtudesData();
      setActiveListId(saved.id);
      setListModalState(null);
      showToast(
        listModalState.mode === 'create'
          ? `Liste « ${saved.title} » créée.`
          : `Liste « ${saved.title} » mise à jour.`
      );
    }
  };

  const handleDeleteList = useCallback(
    async (list: EtudeListItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (list.id === DEFAULT_READING_LIST_ID) {
        // Sur "Ma liste de lecture", vide ses éléments
        const reset = await saveEtudeList(DEFAULT_READING_LIST_ID, {
          badge: 'Liste de lecture',
          title: 'Ma liste de lecture',
          author: list.author || 'Mon espace Études',
          description: list.description,
          articleIds: [],
        });
        if (reset) {
          setLists((prev) => prev.map((l) => (l.id === reset.id ? reset : l)));
          showToast('« Ma liste de lecture » a été vidée.');
        }
        return;
      }

      await deleteEtudeList(list.id);
      await refreshEtudesData();
      setActiveListId(DEFAULT_READING_LIST_ID);
      showToast(`Liste « ${list.title} » supprimée.`);
    },
    [refreshEtudesData, showToast]
  );

  // ==================== GESTION D'UNE ÉTUDE ET DE SES VERSIONS ====================
  const openedArticle = useMemo(() => {
    if (!openedArticleId) return null;
    return articles.find((a) => a.id === openedArticleId) ?? null;
  }, [articles, openedArticleId]);

  useEffect(() => {
    if (!openedArticle) {
      setSelectedVersionId(null);
      return;
    }
    const exists = openedArticle.versions.some((v) => v.id === selectedVersionId);
    if (!exists) {
      setSelectedVersionId(openedArticle.versions[0]?.id ?? null);
    }
    const hasVF = openedArticle.versions.some(
      (v) => v.versionLabel.trim().toUpperCase() === 'VF'
    );
    const hasVO = openedArticle.versions.some(
      (v) => v.versionLabel.trim().toUpperCase() === 'VO'
    );
    if (hasVF && !hasVO) setNewLinkedVersionLabel('VO');
    else if (!hasVF) setNewLinkedVersionLabel('VF');
    else setNewLinkedVersionLabel(`V${openedArticle.versions.length + 1}`);
  }, [openedArticle, selectedVersionId]);

  const handleRenameVersion = async (versionId: string, newLabel: string) => {
    if (!canManageDocuments) return;
    const clean = newLabel.trim();
    if (!clean) return;
    const updated = await patchEtudeVersion(versionId, { versionLabel: clean });
    if (updated) {
      await refreshEtudesData();
      setEditingVersionId(null);
      showToast(`Version renommée en « ${clean} ».`);
    }
  };

  const handleDeleteVersion = async (article: EtudeArticleItem, version: EtudeVersionItem) => {
    if (!canManageDocuments) return;
    if (article.versions.length <= 1) {
      showToast('Une étude doit conserver au moins une version.');
      return;
    }
    await deleteEtudeVersion(version.id);
    await refreshEtudesData();
    showToast(`Version « ${version.versionLabel} » supprimée.`);
  };

  const handleDeleteEntireArticle = async (article: EtudeArticleItem) => {
    if (!canManageDocuments) return;
    await deleteEtudeArticle(
      article.id,
      article.versions.map((v) => v.id)
    );
    await refreshEtudesData();
    navigateToArticlePage(null);
    showToast(`Étude « ${article.title} » supprimée.`);
  };

  const handleAddThemeToArticle = async (article: EtudeArticleItem, rawInput: string) => {
    if (!canManageDocuments) return;
    const candidates = rawInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;

    const currentThemes = Array.isArray(article.themes) ? article.themes : [];
    const nextThemes = [...currentThemes];
    let addedAny = false;
    for (const candidate of candidates) {
      const exists = nextThemes.some((t) => t.toLowerCase() === candidate.toLowerCase());
      if (!exists) {
        nextThemes.push(candidate);
        addedAny = true;
      }
    }
    if (!addedAny) {
      setFicheThemeInput('');
      return;
    }

    const updated = await patchEtudeArticle(article.id, { themes: nextThemes });
    if (updated) {
      await refreshEtudesData();
      setFicheThemeInput('');
      showToast(
        candidates.length > 1
          ? 'Thèmes ajoutés à l’étude.'
          : `Thème « ${candidates[0]} » ajouté à l’étude.`
      );
    }
  };

  const handleRemoveThemeFromArticle = async (
    article: EtudeArticleItem,
    themeToRemove: string
  ) => {
    if (!canManageDocuments) return;
    const currentThemes = Array.isArray(article.themes) ? article.themes : [];
    const nextThemes = currentThemes.filter((t) => t !== themeToRemove);
    const updated = await patchEtudeArticle(article.id, { themes: nextThemes });
    if (updated) {
      await refreshEtudesData();
      showToast(`Thème « ${themeToRemove} » retiré.`);
    }
  };

  const handleSubmitEditArticleModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageDocuments || !editArticleModal) return;
    const cleanTitle = editArticleModal.title.trim();
    if (!cleanTitle) return;

    // Si l'utilisateur a saisi un thème dans le champ sans cliquer sur "+ Ajouter", on l'inclut
    const finalThemes = [...(editArticleModal.themes || [])];
    const pendingThemes = modalThemeInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pt of pendingThemes) {
      if (!finalThemes.some((t) => t.toLowerCase() === pt.toLowerCase())) {
        finalThemes.push(pt);
      }
    }

    const updated = await patchEtudeArticle(editArticleModal.articleId, {
      title: cleanTitle,
      subtitle: editArticleModal.subtitle.trim(),
      author: editArticleModal.author.trim(),
      genre: editArticleModal.genre?.trim() || 'Étude',
      issueRef: editArticleModal.issueRef.trim(),
      description: editArticleModal.description.trim(),
      themes: finalThemes,
    });
    if (updated) {
      await refreshEtudesData();
      setModalThemeInput('');
      setEditArticleModal(null);
      showToast('Informations de l’étude mises à jour.');
    }
  };

  // ==================== RECHERCHE, THÈMES & FILTRES ====================
  const allThemesWithCounts = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const art of articles) {
      const artThemes = Array.isArray(art.themes) ? art.themes : [];
      for (const raw of artThemes) {
        const clean = raw.trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { label: clean, count: 1 });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, 'fr');
    });
  }, [articles]);

  const grandThemesWithData = useMemo(() => {
    // Si la taxonomie personnalisée n'est pas encore enregistrée en base,
    // on applique la taxonomie par défaut pour que tous les comptes bénéficient de la classification
    const activeGroups: ThemeGroup[] =
      taxonomyGroups && taxonomyGroups.length > 0
        ? taxonomyGroups
        : [
            {
              id: 'philosophie-ethique',
              grandTheme: 'Philosophie & Éthique',
              sousThemes: ['philosophie', 'éthique', 'morale', 'métaphysique', 'bioéthique', 'justice', 'humanisme'],
            },
            {
              id: 'sciences-technologies',
              grandTheme: 'Sciences & Technologies',
              sousThemes: ['ia', 'intelligence artificielle', 'technologie', 'numérique', 'sciences', 'algorithmes', 'biologie', 'santé'],
            },
            {
              id: 'societe-politique',
              grandTheme: 'Société & Politique',
              sousThemes: ['démocratie', 'politique', 'société', 'sociologie', 'droit', 'éducation', 'citoyenneté', 'médias'],
            },
            {
              id: 'economie-ecologie',
              grandTheme: 'Économie & Écologie',
              sousThemes: ['économie', 'écologie', 'climat', 'travail', 'environnement', 'transition', 'mondialisation'],
            },
            {
              id: 'culture-arts-histoire',
              grandTheme: 'Culture & Arts',
              sousThemes: ['littérature', 'arts', 'histoire', 'cinéma', 'culture', 'poésie', 'théâtre'],
            },
            {
              id: 'spiritualites-religions',
              grandTheme: 'Spiritualités & Religions',
              sousThemes: ['théologie', 'religion', 'spiritualité', 'christianisme', 'laïcité', 'foi'],
            },
            {
              id: 'relations-internationales',
              grandTheme: 'Relations Internationales',
              sousThemes: ['géopolitique', 'europe', 'guerre', 'paix', 'international', 'diplomatie'],
            },
          ];

    const computed = activeGroups.map((group) => {
      const subthemeSet = new Set(
        group.sousThemes.map((s) => s.toLowerCase().trim()),
      );
      const grandThemeLower = group.grandTheme.toLowerCase().trim();

      // Trouver les articles appartenant à ce Grand Thème
      const matchingArticles = articles.filter((art) => {
        const artThemes = Array.isArray(art.themes) ? art.themes : [];
        return artThemes.some((t) => {
          const clean = t.toLowerCase().trim();
          return (
            clean === grandThemeLower ||
            subthemeSet.has(clean) ||
            clean.startsWith(`${grandThemeLower} /`) ||
            clean.startsWith(`${grandThemeLower} >`)
          );
        });
      });

      // Sous-thèmes avec leur décompte réel d'articles
      const subthemesWithCounts = group.sousThemes.map((subLabel) => {
        const subLower = subLabel.toLowerCase().trim();
        const count = articles.filter((art) => {
          const artThemes = Array.isArray(art.themes) ? art.themes : [];
          return artThemes.some((t) => {
            const clean = t.toLowerCase().trim();
            return (
              clean === subLower ||
              clean.endsWith(`/ ${subLower}`) ||
              clean.endsWith(`> ${subLower}`)
            );
          });
        }).length;
        return { label: subLabel, count };
      });

      return {
        id: group.id,
        grandTheme: group.grandTheme,
        articlesCount: matchingArticles.length,
        matchingArticleIds: new Set(matchingArticles.map((a) => a.id)),
        subthemesWithCounts,
      };
    });

    // On priorise les groupes contenant des études, tout en gardant au moins les groupes principaux
    const withArticles = computed.filter((g) => g.articlesCount > 0);
    return withArticles.length > 0 ? withArticles : computed;
  }, [articles, taxonomyGroups]);

  const combinedQuery = useMemo(() => {
    return [topSearchQuery.trim(), journalSearchQuery.trim(), selectedAuthorFilter || '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }, [topSearchQuery, journalSearchQuery, selectedAuthorFilter]);

  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      // 1. Filtrage par sous-thème spécifique s'il est sélectionné
      if (selectedThemeFilter) {
        const artThemes = Array.isArray(art.themes) ? art.themes : [];
        const filterLower = selectedThemeFilter.trim().toLowerCase();
        const hasTheme = artThemes.some((t) => {
          const clean = t.trim().toLowerCase();
          return (
            clean === filterLower ||
            clean.endsWith(`/ ${filterLower}`) ||
            clean.endsWith(`> ${filterLower}`) ||
            clean.startsWith(`${filterLower} /`)
          );
        });
        if (!hasTheme) return false;
      } else if (selectedGrandTheme) {
        // 2. Filtrage par Grand Thème sélectionné (tous ses articles)
        const group = grandThemesWithData.find(
          (g) => g.grandTheme.toLowerCase() === selectedGrandTheme.toLowerCase(),
        );
        if (group && !group.matchingArticleIds.has(art.id)) {
          return false;
        }
      }

      if (!combinedQuery) return true;
      const versionNames = art.versions
        .map((v) => `${v.versionLabel} ${v.originalName}`)
        .join(' ');
      const themesText = (art.themes || []).join(' ');
      const haystack = `${art.title} ${art.subtitle} ${art.author} ${art.issueRef} ${art.description} ${themesText} ${versionNames}`.toLowerCase();
      return haystack.includes(combinedQuery);
    });
  }, [articles, combinedQuery, selectedThemeFilter, selectedGrandTheme, grandThemesWithData]);

  const latestArticle = useMemo(() => {
    return filteredArticles[0] ?? null;
  }, [filteredArticles]);

  const mostConsultedArticles = useMemo(() => {
    return [...filteredArticles].sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      return (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt);
    });
  }, [filteredArticles]);

  const totalCarouselPages = useMemo(() => {
    return Math.max(1, Math.ceil(Math.max(1, filteredArticles.length) / 4));
  }, [filteredArticles.length]);

  const scrollToCarouselPage = useCallback(
    (pageIndex: number) => {
      const clamped = Math.max(0, Math.min(totalCarouselPages - 1, pageIndex));
      setCarouselPage(clamped);
      const el = carouselRef.current;
      if (!el) return;
      const cardStep = 242;
      el.scrollTo({
        left: clamped * cardStep * 4,
        behavior: 'smooth',
      });
    },
    [totalCarouselPages]
  );

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
  }, [totalCarouselPages]);

  // Drag & Drop sur toute la fenêtre (réservé à samamaaxel@gmail.com) :
  // - si on est sur la page dédiée d'une étude, cela ajoute un fichier lié (version) à cette étude !
  // - sinon, cela crée une nouvelle étude !
  useEffect(() => {
    if (!canManageDocuments) return;
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
      setIsDraggingOverLinkedBox(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      if (openedArticle) {
        void handleAddLinkedFilesToCurrentArticle(
          openedArticle,
          e.dataTransfer.files,
          newLinkedVersionLabel
        );
      } else {
        void handleUploadNewStudies(e.dataTransfer.files);
      }
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
  }, [
    canManageDocuments,
    openedArticle,
    newLinkedVersionLabel,
    handleAddLinkedFilesToCurrentArticle,
    handleUploadNewStudies,
  ]);

  const displayAccountLabel = useMemo(() => {
    if (sessionKey && authConfig?.username) return authConfig.username;
    if (accountEmail) return accountEmail.split('@')[0];
    return 'Se connecter';
  }, [sessionKey, authConfig?.username, accountEmail]);

  const handleClassifyAllThemes = async () => {
    if (!canManageDocuments || isClassifyingThemes) return;
    setIsClassifyingThemes(true);
    try {
      const res = await classifyAllThemesWithGemini();
      if (res && res.groups) {
        setTaxonomyGroups(res.groups);
        setHasGeminiKey(res.hasGeminiKey);
        setThemesViewMode('grands-themes');
        showToast(
          res.hasGeminiKey
            ? `Thèmes organisés avec succès (${res.groups.length} grands thèmes) !`
            : `Thèmes organisés (${res.groups.length} grands thèmes).`
        );
      } else {
        showToast('Impossible de classifier les thèmes pour le moment.');
      }
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la classification des thèmes.');
    } finally {
      setIsClassifyingThemes(false);
    }
  };

  const handleOpenGeminiKeyModal = () => {
    setGeminiKeyInput('');
    setShowGeminiKeyPlain(false);
    setGeminiKeyModalError(null);
    setShowGeminiKeyModal(true);
  };

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingGeminiKey) return;
    setIsSavingGeminiKey(true);
    setGeminiKeyModalError(null);
    try {
      let cleanInput = geminiKeyInput.trim();
      cleanInput = cleanInput.replace(/^["']|["']$/g, '');
      if (cleanInput.includes('=')) cleanInput = cleanInput.split('=').pop()!.trim();
      if (cleanInput.includes(':')) cleanInput = cleanInput.split(':').pop()!.trim();
      cleanInput = cleanInput.replace(/^["']|["']$/g, '').trim();

      const res = await saveGeminiApiKey(cleanInput);
      if (res.ok) {
        setHasGeminiKey(Boolean(res.hasGeminiKey));
        setShowGeminiKeyModal(false);
        showToast(res.message || 'Clé API Gemini vérifiée et enregistrée avec succès !');
        void handleClassifyAllThemes();
      } else {
        setGeminiKeyModalError(res.error || 'Clé API Gemini invalide.');
      }
    } catch {
      setGeminiKeyModalError('Erreur de connexion au serveur.');
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleClassifySingleArticle = async (
    targetArticle: {
      id?: string;
      title: string;
      subtitle?: string;
      author?: string;
      description?: string;
      filename?: string;
      excerpt?: string;
    },
    onSuccessThemes: (newThemes: string[], detectedGenre?: string) => void,
  ) => {
    if (!canManageDocuments || isClassifyingArticle) return;
    if (!targetArticle.title.trim()) {
      showToast('Veuillez renseigner un titre pour analyser l’étude.');
      return;
    }
    setIsClassifyingArticle(true);
    try {
      const res = await classifyArticleWithGemini({
        title: targetArticle.title,
        subtitle: targetArticle.subtitle,
        author: targetArticle.author,
        description: targetArticle.description,
        filename: targetArticle.filename,
        excerpt: targetArticle.excerpt,
      });
      if (res) {
        const suggested = [res.grandTheme, ...res.sousThemes].filter(Boolean);
        onSuccessThemes(suggested, res.genre);
        showToast(`Thèmes : « ${res.grandTheme} » (${res.sousThemes.join(', ')}) • Genre : ${res.genre}`);
      } else {
        showToast('Impossible de classifier cette étude.');
      }
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la détermination des thèmes.');
    } finally {
      setIsClassifyingArticle(false);
    }
  };

  const renderArticleCover = (art: EtudeArticleItem, width: number, height: number) => {
    if (art.coverDataUrl) {
      return (
        <img
          src={art.coverDataUrl}
          alt={art.title}
          width={width}
          height={height}
          style={{ display: 'block', width, height, objectFit: 'cover' }}
        />
      );
    }
    const primaryFormat = art.versions[0]?.format?.toUpperCase() || 'ÉTUDE';
    const genreBadge = (art.genre || primaryFormat).toUpperCase();
    return (
      <div
        style={{
          width,
          height,
          background: 'linear-gradient(155deg, #234c4c 0%, #356868 55%, #4f7878 100%)',
          color: '#ffffff',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            ÉTUDES • {genreBadge}
          </span>
          <span
            style={{
              fontSize: 11,
              backgroundColor: 'rgba(255,255,255,0.2)',
              padding: '2px 7px',
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            {art.versions.map((v) => v.versionLabel).join(' / ')}
          </span>
        </div>

        <div>
          <p
            style={{
              fontFamily: "'Alegreya', serif",
              fontSize: 19,
              fontWeight: 700,
              lineHeight: 1.22,
              margin: '0 0 8px',
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {art.title}
          </p>
          {art.author && (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.88 }}>{art.author}</p>
          )}
        </div>

        <span style={{ fontSize: 11, opacity: 0.75 }}>
          {art.issueRef || formatDateShort(art.addedAt)}
        </span>
      </div>
    );
  };

  const renderThemesBar = (customMarginBottom?: number) => {
    const isShowingGrandThemes = themesViewMode === 'grands-themes' && grandThemesWithData.length > 0;
    const currentItemsCount = isShowingGrandThemes
      ? grandThemesWithData.length
      : allThemesWithCounts.length;

    const showExpandBtn = currentItemsCount > 2;
    const hideExpandOnDesktop = currentItemsCount <= 4;

    const activeGrandThemeObj = selectedGrandTheme
      ? grandThemesWithData.find(
          (g) => g.grandTheme.toLowerCase() === selectedGrandTheme.toLowerCase(),
        )
      : null;

    return (
      <section
        className="etudes-themes-home-bar"
        aria-label="Filtrer par thème d'étude"
        style={customMarginBottom ? { marginBottom: customMarginBottom } : undefined}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--etudes-text-muted)',
              }}
            >
              Thèmes :
            </span>

            {/* Bouton Tous */}
            <button
              type="button"
              className={`etudes-theme-filter-pill ${!selectedThemeFilter && !selectedGrandTheme ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedGrandTheme(null);
                setSelectedThemeFilter(null);
              }}
            >
              Tous ({articles.length})
            </button>

            {/* Bascule Vue Grands Thèmes vs Tous les tags si une taxonomie existe */}
            {grandThemesWithData.length > 0 && (
              <div className="etudes-theme-view-switch" role="group" aria-label="Mode d'affichage des thèmes">
                <button
                  type="button"
                  className={`etudes-theme-view-switch-btn ${themesViewMode === 'grands-themes' ? 'is-active' : ''}`}
                  onClick={() => setThemesViewMode('grands-themes')}
                >
                  🏛️ Par grands thèmes ({grandThemesWithData.length})
                </button>
                <button
                  type="button"
                  className={`etudes-theme-view-switch-btn ${themesViewMode === 'tags' ? 'is-active' : ''}`}
                  onClick={() => setThemesViewMode('tags')}
                >
                  🏷️ Tous les tags ({allThemesWithCounts.length})
                </button>
              </div>
            )}
          </div>

          {/* Contrôles d'administration Gemini (réservés à samamaaxel@gmail.com) */}
          {canManageDocuments && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="etudes-gemini-ai-btn"
                onClick={() => void handleClassifyAllThemes()}
                disabled={isClassifyingThemes}
                title="Organiser automatiquement les thèmes de la revue"
              >
                <span>✨</span>
                <span>{isClassifyingThemes ? 'Organisation…' : 'Thèmes'}</span>
              </button>

              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ padding: '5px 10px', fontSize: 12.5 }}
                onClick={handleOpenGeminiKeyModal}
                title={
                  hasGeminiKey
                    ? 'IA configurée (cliquez pour modifier)'
                    : 'Configurer la clé API Gemini gratuite'
                }
              >
                ⚙️ {hasGeminiKey ? 'IA active' : 'Configuration IA'}
              </button>
            </div>
          )}
        </div>

        {/* ================= VUE 1 : PAR GRANDS THÈMES ================= */}
        {isShowingGrandThemes ? (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                width: '100%',
              }}
            >
              {grandThemesWithData.map((item, index) => {
                const isActive =
                  selectedGrandTheme?.toLowerCase() === item.grandTheme.toLowerCase();
                const hideDesktopClass =
                  !isThemesExpanded && !isActive && index >= 4
                    ? 'etudes-theme-item-hide-desktop'
                    : '';
                const hideMobileClass =
                  !isThemesExpanded && !isActive && index >= 2
                    ? 'etudes-theme-item-hide-mobile'
                    : '';

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`etudes-theme-filter-pill ${isActive ? 'is-active' : ''} ${hideDesktopClass} ${hideMobileClass}`.trim()}
                    onClick={() => {
                      if (isActive) {
                        setSelectedGrandTheme(null);
                        setSelectedThemeFilter(null);
                      } else {
                        setSelectedGrandTheme(item.grandTheme);
                        setSelectedThemeFilter(null);
                      }
                    }}
                  >
                    🏛️ {item.grandTheme} ({item.articlesCount})
                  </button>
                );
              })}

              {showExpandBtn && (
                <button
                  type="button"
                  className={`etudes-theme-expand-btn ${hideExpandOnDesktop ? 'hide-on-desktop' : ''}`.trim()}
                  onClick={() => setIsThemesExpanded((prev) => !prev)}
                  title={
                    isThemesExpanded
                      ? 'Réduire la liste des grands thèmes'
                      : 'Développer tous les grands thèmes'
                  }
                >
                  {isThemesExpanded ? (
                    <>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
                      <span>Réduire</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                      <span>Développer ({currentItemsCount})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Sous-barre des sous-thèmes lorsque le grand thème est sélectionné */}
            {activeGrandThemeObj && (
              <div className="etudes-subthemes-container">
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--etudes-teal-dark)',
                    marginRight: 4,
                  }}
                >
                  Sous-thèmes de « {activeGrandThemeObj.grandTheme} » :
                </span>

                <button
                  type="button"
                  className={`etudes-theme-filter-pill ${!selectedThemeFilter ? 'is-active' : ''}`}
                  style={{ padding: '3px 10px', fontSize: 13 }}
                  onClick={() => setSelectedThemeFilter(null)}
                >
                  Tous ({activeGrandThemeObj.articlesCount})
                </button>

                {activeGrandThemeObj.subthemesWithCounts.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--etudes-text-muted)' }}>
                    Aucun sous-thème spécifique.
                  </span>
                ) : (
                  activeGrandThemeObj.subthemesWithCounts.map((sub) => {
                    const isSubActive =
                      selectedThemeFilter?.toLowerCase() === sub.label.toLowerCase();
                    return (
                      <button
                        key={sub.label}
                        type="button"
                        className={`etudes-theme-filter-pill ${isSubActive ? 'is-active' : ''}`}
                        style={{ padding: '3px 10px', fontSize: 13 }}
                        onClick={() =>
                          setSelectedThemeFilter(isSubActive ? null : sub.label)
                        }
                      >
                        #{sub.label} {sub.count > 0 ? `(${sub.count})` : ''}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        ) : (
          /* ================= VUE 2 : TOUS LES TAGS À PLAT ================= */
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            {allThemesWithCounts.length === 0 ? (
              <span style={{ fontSize: 14, color: 'var(--etudes-text-muted)' }}>
                {canManageDocuments
                  ? 'Aucun thème créé pour le moment — ouvrez la fiche d’une étude pour lui ajouter des thèmes ou lancez la classification IA.'
                  : 'Aucun thème disponible pour le moment.'}
              </span>
            ) : (
              allThemesWithCounts.map((item, index) => {
                const isActive =
                  selectedThemeFilter?.toLowerCase() === item.label.toLowerCase();
                const hideDesktopClass =
                  !isThemesExpanded && !isActive && index >= 4
                    ? 'etudes-theme-item-hide-desktop'
                    : '';
                const hideMobileClass =
                  !isThemesExpanded && !isActive && index >= 2
                    ? 'etudes-theme-item-hide-mobile'
                    : '';

                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`etudes-theme-filter-pill ${isActive ? 'is-active' : ''} ${hideDesktopClass} ${hideMobileClass}`.trim()}
                    onClick={() =>
                      setSelectedThemeFilter(isActive ? null : item.label)
                    }
                  >
                    #{item.label} ({item.count})
                  </button>
                );
              })
            )}

            {showExpandBtn && (
              <button
                type="button"
                className={`etudes-theme-expand-btn ${hideExpandOnDesktop ? 'hide-on-desktop' : ''}`.trim()}
                onClick={() => setIsThemesExpanded((prev) => !prev)}
                title={
                  isThemesExpanded
                    ? 'Réduire la liste des thèmes'
                    : 'Développer tous les thèmes explorables'
                }
              >
                {isThemesExpanded ? (
                  <>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
                    <span>Réduire</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                    <span>Développer ({currentItemsCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {(selectedThemeFilter || selectedGrandTheme) && (
          <button
            type="button"
            className="etudes-text-link-btn"
            style={{ fontSize: 14, marginLeft: 'auto', marginTop: 4 }}
            onClick={() => {
              setSelectedThemeFilter(null);
              setSelectedGrandTheme(null);
            }}
          >
            Réinitialiser le filtre {selectedGrandTheme ? `« ${selectedGrandTheme} »` : ''} {selectedThemeFilter ? `(#{selectedThemeFilter})` : ''}
          </button>
        )}
      </section>
    );
  };

  return (
    <div
      className={`etudes-root ${isDark ? 'is-dark' : ''}`}
      onClick={() => {
        if (showAccountMenu) setShowAccountMenu(false);
        if (showAppSwitcher) setShowAppSwitcher(false);
      }}
    >
      {/* Input fichier caché pour déposer une nouvelle étude (uniquement pour samamaaxel@gmail.com) */}
      {canManageDocuments && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.epub,.md,.markdown,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) {
              void handleUploadNewStudies(e.target.files);
              e.target.value = '';
            }
          }}
        />
      )}

      {/* Overlay global lors d'un glisser-déposer de fichier */}
      {canManageDocuments && isDraggingOverWindow && (
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
            {openedArticle
              ? `Ajouter un fichier lié (${newLinkedVersionLabel}) à « ${openedArticle.title} »`
              : 'Déposez vos fichiers ou études ici'}
          </p>
          <p style={{ fontSize: 16, opacity: 0.9, margin: 0 }}>
            Chiffrement AES-256-GCM sur votre espace Études (.pdf, .epub, .md, .txt)
          </p>
        </div>
      )}

      {/* ==================== BANNIÈRE SUPÉRIEURE STICKY (1:788 / 1:789) ==================== */}
      <header className="etudes-top-banner-wrap">
        <div className="etudes-top-banner">
          <div className="etudes-top-search-cluster">
            <form
              className="etudes-top-search-box"
              onSubmit={(e) => {
                e.preventDefault();
                if (openedArticleId) navigateToArticlePage(null);
              }}
            >
              <input
                type="search"
                className="etudes-top-search-input"
                placeholder="Vos mots-clés"
                aria-label="Recherche globale par mots-clés"
                value={topSearchQuery}
                onChange={(e) => {
                  setTopSearchQuery(e.target.value);
                  if (openedArticleId) navigateToArticlePage(null);
                }}
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
              title="Filtres de recherche"
              aria-label="Filtres de recherche"
              onClick={() => setShowAdvancedFilters((v) => !v)}
            >
              <img src={svg10Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            </button>
          </div>

          <div className="etudes-top-actions">
            {canManageDocuments && (
              <button
                type="button"
                className="etudes-icon-circle-btn"
                title="Déposer une nouvelle étude (.pdf, .epub, .md, .txt)"
                aria-label="Déposer une nouvelle étude"
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
            )}

            <button
              type="button"
              className={`etudes-icon-circle-btn ${isDark ? 'is-active' : ''}`}
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
              aria-label="Basculer le thème clair ou sombre"
              onClick={() => setIsDark((d) => !d)}
            >
              <img src={svg12Url} alt="" width={18} height={18} className="etudes-icon-invert" />
            </button>

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

          {/* Menu déroulant Compte & Sécurité */}
          {showAccountMenu && (
            <div
              className="etudes-dropdown-panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Menu du compte"
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
                    {authConfig?.username || 'Compte connecté'}
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
                  Connexion partagée • Fichiers Études isolés de Folio
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    navigateToArticlePage(null);
                    setActiveTab('listes');
                    setActiveListId(DEFAULT_READING_LIST_ID);
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
                  Ma liste de lecture ({defaultReadingList.articleIds.length})
                </button>

                {canManageDocuments && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountMenu(false);
                      handleOpenGeminiKeyModal();
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--etudes-teal-dark)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 15,
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>⚙️</span>
                    <span>Configuration IA Gemini ({hasGeminiKey ? 'Active' : 'Non configurée'})</span>
                  </button>
                )}

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
                    Verrouiller la session AES-256
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
                    Déverrouiller la session AES-256
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
                Applications
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
                  onClick={(e) => {
                    e.preventDefault();
                    setShowAppSwitcher(false);
                    navigateToArticlePage(null);
                  }}
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
                    Espace actuel • {articles.length} étude{articles.length > 1 ? 's' : ''}
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
                  <strong style={{ fontSize: 15 }}>Folio — Bibliothèque &amp; Liseuse</strong>
                  <span style={{ fontSize: 12.5, color: 'var(--etudes-text-muted)' }}>
                    Bibliothèque indépendante
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ==================== HERO HEADER #234c4c SANS "11 nos/an" NI "S.E.R." (1:7) ==================== */}
      <div className="etudes-hero-outer">
        <section
          className="etudes-hero"
          aria-label="Présentation de la revue Études"
          onClick={() => {
            if (openedArticleId) navigateToArticlePage(null);
          }}
          style={{ cursor: openedArticleId ? 'pointer' : 'default' }}
        >
          <div className="etudes-hero-badge">
            <img src={vector0Url} alt="" width={23} height={18} />
            <span className="etudes-hero-badge-text">Revue</span>
          </div>

          <h1 className="etudes-hero-title">Études</h1>
          <h2 className="etudes-hero-subtitle">Revue de culture contemporaine</h2>
        </section>
      </div>

      {/* ==================== BARRE D'ONGLETS STICKY (1:678 / 1:679) ==================== */}
      <div className="etudes-tabs-bar-wrap">
        <nav className="etudes-tabs-bar" role="tablist" aria-label="Sections de la revue Études">
          <button
            type="button"
            role="tab"
            aria-selected={!openedArticleId && activeTab === 'apercu'}
            className={`etudes-tab-btn ${!openedArticleId && activeTab === 'apercu' ? 'is-active' : ''}`}
            onClick={() => {
              navigateToArticlePage(null);
              setActiveTab('apercu');
            }}
          >
            <img src={svg5Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Aperçu</span>
            {!openedArticleId && activeTab === 'apercu' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!openedArticleId && activeTab === 'numeros'}
            className={`etudes-tab-btn ${!openedArticleId && activeTab === 'numeros' ? 'is-active' : ''}`}
            onClick={() => {
              navigateToArticlePage(null);
              setActiveTab('numeros');
            }}
          >
            <img src={svg6Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Numéros</span>
            {articles.length > 0 && <span className="etudes-tab-badge">{articles.length}</span>}
            {!openedArticleId && activeTab === 'numeros' && (
              <span className="etudes-tab-indicator" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!openedArticleId && activeTab === 'medias'}
            className={`etudes-tab-btn ${!openedArticleId && activeTab === 'medias' ? 'is-active' : ''}`}
            onClick={() => {
              navigateToArticlePage(null);
              setActiveTab('medias');
            }}
          >
            <img src={svg7Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Vidéos / Podcasts</span>
            {!openedArticleId && activeTab === 'medias' && (
              <span className="etudes-tab-indicator" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!openedArticleId && activeTab === 'listes'}
            className={`etudes-tab-btn ${!openedArticleId && activeTab === 'listes' ? 'is-active' : ''}`}
            onClick={() => {
              navigateToArticlePage(null);
              setActiveTab('listes');
            }}
          >
            <img src={svg8Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>Listes</span>
            <span className="etudes-tab-badge">{lists.length}</span>
            {!openedArticleId && activeTab === 'listes' && <span className="etudes-tab-indicator" />}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!openedArticleId && activeTab === 'apropos'}
            className={`etudes-tab-btn ${!openedArticleId && activeTab === 'apropos' ? 'is-active' : ''}`}
            onClick={() => {
              navigateToArticlePage(null);
              setActiveTab('apropos');
            }}
          >
            <img src={svg9Url} alt="" width={20} height={20} className="etudes-icon-invert" />
            <span>À propos</span>
            {!openedArticleId && activeTab === 'apropos' && (
              <span className="etudes-tab-indicator" />
            )}
          </button>
        </nav>
      </div>

      {/* ==================== CONTENU PRINCIPAL (PAGE D'ÉTUDE OU ONGLETS) ==================== */}
      <main className="etudes-main-panel" role="tabpanel">
        {/* ====================================================================================
            VUE 1 : PAGE DÉDIÉE D'UNE ÉTUDE / ARTICLE (AVEC CHOIX VF/VO & AJOUT DE FICHIER LIÉ)
           ==================================================================================== */}
        {openedArticle ? (
          <div className="etudes-detail-page">
            {/* Input caché pour l'ajout d'un fichier lié à cette étude (réservé à samamaaxel@gmail.com) */}
            {canManageDocuments && (
              <input
                ref={linkedFileInputRef}
                type="file"
                multiple
                accept=".pdf,.epub,.md,.markdown,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleAddLinkedFilesToCurrentArticle(
                      openedArticle,
                      e.target.files,
                      newLinkedVersionLabel
                    );
                    e.target.value = '';
                  }
                }}
              />
            )}

            {/* Barre de navigation supérieure de la page d'étude */}
            <div className="etudes-detail-topbar">
              <button
                type="button"
                className="etudes-back-btn"
                onClick={() => navigateToArticlePage(null)}
              >
                <span>← Retour aux études</span>
              </button>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  className="etudes-secondary-btn"
                  onClick={() =>
                    void handleToggleArticleInList(defaultReadingList, openedArticle)
                  }
                >
                  <img
                    src={vector2Url}
                    alt=""
                    width={12}
                    height={16}
                    className="etudes-icon-invert"
                  />
                  <span>
                    {defaultReadingList.articleIds.includes(openedArticle.id)
                      ? 'Dans Ma liste de lecture'
                      : 'Ajouter à Ma liste de lecture'}
                  </span>
                </button>

                {canManageDocuments && (
                  <>
                    <button
                      type="button"
                      className="etudes-secondary-btn"
                      onClick={() => {
                        setModalThemeInput('');
                        setEditArticleModal({
                          articleId: openedArticle.id,
                          title: openedArticle.title,
                          subtitle: openedArticle.subtitle,
                          author: openedArticle.author,
                          genre: openedArticle.genre || 'Étude',
                          issueRef: openedArticle.issueRef,
                          description: openedArticle.description,
                          themes: Array.isArray(openedArticle.themes)
                            ? [...openedArticle.themes]
                            : [],
                        });
                      }}
                    >
                      Modifier la fiche
                    </button>

                    <button
                      type="button"
                      className="etudes-secondary-btn"
                      style={{ color: '#dc2626' }}
                      onClick={() => void handleDeleteEntireArticle(openedArticle)}
                    >
                      Supprimer l’étude
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Carte principale de présentation de l'article + choix de la version et lecture */}
            {(() => {
              const activeVer =
                openedArticle.versions.find((v) => v.id === selectedVersionId) ||
                openedArticle.versions[0];

              return (
                <section className="etudes-detail-hero-card">
                  <div
                    style={{
                      width: 197,
                      height: 300,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid var(--etudes-border-cover)',
                      boxShadow: 'var(--etudes-shadow)',
                      flexShrink: 0,
                    }}
                  >
                    {renderArticleCover(openedArticle, 197, 300)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div className="etudes-meta-type">
                        <img
                          src={vector5Url}
                          alt=""
                          width={16}
                          height={20}
                          className="etudes-icon-invert"
                        />
                        <span className="etudes-meta-type-label">
                          {openedArticle.genre || 'Étude'} • {openedArticle.issueRef || formatDateShort(openedArticle.addedAt)}
                        </span>
                      </div>

                      <h2
                        style={{
                          fontFamily: "'Alegreya', serif",
                          fontSize: 32,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          margin: '12px 0 6px',
                        }}
                      >
                        {openedArticle.title}
                      </h2>

                      {openedArticle.subtitle && (
                        <p
                          style={{
                            fontFamily: "'Alegreya', serif",
                            fontSize: 20,
                            fontStyle: 'italic',
                            margin: '0 0 10px',
                            color: 'var(--etudes-text-secondary)',
                          }}
                        >
                          {openedArticle.subtitle}
                        </p>
                      )}

                      {openedArticle.author && (
                        <p
                          style={{
                            margin: '0 0 14px',
                            fontSize: 16,
                            fontWeight: 500,
                            color: 'var(--etudes-text-secondary)',
                          }}
                        >
                          Par <span style={{ textDecoration: 'underline' }}>{openedArticle.author}</span>
                        </p>
                      )}

                      {openedArticle.description && (
                        <p
                          style={{
                            margin: '0 0 20px',
                            fontSize: 16,
                            lineHeight: 1.55,
                            color: 'var(--etudes-text-main)',
                          }}
                        >
                          {openedArticle.description}
                        </p>
                      )}

                      {/* Section Thèmes de l'étude sur la fiche */}
                      {(canManageDocuments || (openedArticle.themes || []).length > 0) && (
                        <div
                          style={{
                            marginTop: 10,
                            marginBottom: 20,
                            padding: '14px 16px',
                            borderRadius: 12,
                            backgroundColor: 'var(--etudes-surface-subtle)',
                            border: '1px solid var(--etudes-border)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'var(--etudes-text-muted)',
                              }}
                            >
                              Thèmes de l’étude ({(openedArticle.themes || []).length})
                            </span>
                            <span style={{ fontSize: 12.5, color: 'var(--etudes-text-muted)' }}>
                              Cliquez sur un thème pour le retrouver sur la page d’accueil
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: canManageDocuments ? 12 : 0,
                            }}
                          >
                            {(openedArticle.themes || []).length === 0 ? (
                              <span
                                style={{
                                  fontSize: 14,
                                  color: 'var(--etudes-text-muted)',
                                  fontStyle: 'italic',
                                }}
                              >
                                Aucun thème associé pour le moment. Ajoutez-en un ci-dessous.
                              </span>
                            ) : (
                              (openedArticle.themes || []).map((theme) => (
                                <span key={theme} className="etudes-theme-tag">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedThemeFilter(theme);
                                      setActiveTab('apercu');
                                      navigateToArticlePage(null);
                                    }}
                                    style={{
                                      border: 0,
                                      background: 'transparent',
                                      color: 'inherit',
                                      font: 'inherit',
                                      padding: 0,
                                      cursor: 'pointer',
                                    }}
                                    title={`Voir toutes les études du thème « ${theme} » sur la page d'accueil`}
                                  >
                                    #{theme}
                                  </button>
                                  {canManageDocuments && (
                                    <button
                                      type="button"
                                      className="etudes-theme-tag-remove"
                                      title={`Retirer le thème « ${theme} »`}
                                      aria-label={`Retirer le thème ${theme}`}
                                      onClick={() =>
                                        void handleRemoveThemeFromArticle(openedArticle, theme)
                                      }
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))
                            )}
                          </div>

                          {canManageDocuments && (
                            <>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void handleAddThemeToArticle(openedArticle, ficheThemeInput);
                                }}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  alignItems: 'center',
                                }}
                              >
                                <input
                                  type="text"
                                  className="etudes-form-input"
                                  style={{
                                    flex: '1 1 220px',
                                    maxWidth: 320,
                                    padding: '7px 12px',
                                    fontSize: 14,
                                  }}
                                  placeholder="Ajouter un thème (ex: Philosophie, Écologie, IA…)"
                                  aria-label="Ajouter un thème à cette étude"
                                  value={ficheThemeInput}
                                  onChange={(e) => setFicheThemeInput(e.target.value)}
                                />
                                <button
                                  type="submit"
                                  className="etudes-secondary-btn"
                                  style={{ padding: '7px 14px', fontSize: 13.5 }}
                                >
                                  + Ajouter le thème
                                </button>
                                <button
                                  type="button"
                                  className="etudes-gemini-ai-btn"
                                  disabled={isClassifyingArticle}
                                  onClick={() => {
                                    void handleClassifySingleArticle(
                                      openedArticle,
                                      (newThemes, detectedGenre) => {
                                        if (detectedGenre && detectedGenre !== openedArticle.genre) {
                                          void patchEtudeArticle(openedArticle.id, { genre: detectedGenre });
                                        }
                                        void handleAddThemeToArticle(openedArticle, newThemes.join(', '));
                                      }
                                    );
                                  }}
                                  title="Analyser automatiquement le document pour déterminer son genre et ses thèmes"
                                >
                                  <span>✨</span>
                                  <span>{isClassifyingArticle ? 'Analyse…' : 'Thèmes'}</span>
                                </button>
                              </form>

                              {(() => {
                                const currentLower = new Set(
                                  (openedArticle.themes || []).map((t) => t.toLowerCase())
                                );
                                const suggestions = allThemesWithCounts.filter(
                                  (item) => !currentLower.has(item.label.toLowerCase())
                                );
                                if (suggestions.length === 0) return null;
                                return (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      alignItems: 'center',
                                      gap: 6,
                                      marginTop: 10,
                                    }}
                                  >
                                    <span style={{ fontSize: 12.5, color: 'var(--etudes-text-muted)' }}>
                                      Thèmes existants :
                                    </span>
                                    {suggestions.slice(0, 8).map((sug) => (
                                      <button
                                        key={sug.label}
                                        type="button"
                                        onClick={() =>
                                          void handleAddThemeToArticle(openedArticle, sug.label)
                                        }
                                        style={{
                                          border: '1px dashed var(--etudes-border)',
                                          background: 'var(--etudes-bg-card)',
                                          color: 'var(--etudes-text-secondary)',
                                          borderRadius: 999,
                                          padding: '2px 10px',
                                          fontSize: 12.5,
                                          cursor: 'pointer',
                                          fontFamily: 'inherit',
                                        }}
                                      >
                                        + {sug.label}
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      )}

                      {/* Sélecteur rapide de version (ex: VF / VO) */}
                      <div style={{ marginTop: 12, marginBottom: 20 }}>
                        <p
                          style={{
                            margin: '0 0 8px',
                            fontSize: 13,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--etudes-text-muted)',
                          }}
                        >
                          Choisir la version de cet article ({openedArticle.versions.length}) :
                        </p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {openedArticle.versions.map((ver) => {
                            const isSelected = activeVer?.id === ver.id;
                            return (
                              <button
                                key={ver.id}
                                type="button"
                                className={`etudes-version-pill ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => setSelectedVersionId(ver.id)}
                              >
                                <span>{ver.versionLabel}</span>
                                <span style={{ opacity: 0.78, fontWeight: 400, fontSize: 12.5 }}>
                                  ({ver.format.toUpperCase()})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bouton principal pour lancer la lecture de la version sélectionnée */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 14,
                        paddingTop: 16,
                        borderTop: '1px solid var(--etudes-border)',
                      }}
                    >
                      {activeVer && (
                        <button
                          type="button"
                          className="etudes-primary-cta"
                          onClick={() => void handleReadArticleVersion(openedArticle, activeVer)}
                        >
                          <span>
                            Lire l’article — Version {activeVer.versionLabel}
                          </span>
                        </button>
                      )}

                      {canManageDocuments && (
                        <button
                          type="button"
                          className="etudes-secondary-btn"
                          onClick={() => linkedFileInputRef.current?.click()}
                        >
                          + Rajouter un fichier lié (VF, VO…)
                        </button>
                      )}

                      {/* Rattachement rapide aux listes */}
                      {lists.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: 'var(--etudes-text-muted)' }}>
                            Listes :
                          </span>
                          {lists
                            .filter((l) => l.id !== DEFAULT_READING_LIST_ID)
                            .map((customList) => {
                              const inList = customList.articleIds.includes(openedArticle.id);
                              return (
                                <button
                                  key={customList.id}
                                  type="button"
                                  onClick={() =>
                                    void handleToggleArticleInList(customList, openedArticle)
                                  }
                                  style={{
                                    border: '1px solid var(--etudes-border)',
                                    borderRadius: 999,
                                    padding: '4px 10px',
                                    fontSize: 12.5,
                                    cursor: 'pointer',
                                    backgroundColor: inList
                                      ? 'var(--etudes-teal-dark)'
                                      : 'var(--etudes-surface-subtle)',
                                    color: inList ? '#ffffff' : 'var(--etudes-text-main)',
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  {inList ? `✓ ${customList.title}` : `+ ${customList.title}`}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Section : Liste complète des versions de cet article + Ajout d'un fichier lié */}
            <section className="etudes-versions-card" aria-label="Liste des versions de l'article">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div>
                  <h3 className="etudes-section-h2">
                    Liste des versions ({openedArticle.versions.length})
                  </h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--etudes-text-secondary)' }}>
                    {canManageDocuments
                      ? 'Sélectionnez une version (ex. VF ou VO) pour la lire, la renommer ou ajoutez un nouveau fichier lié ci-dessous.'
                      : 'Sélectionnez une version (ex. VF ou VO) pour la lire.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {openedArticle.versions.map((ver) => {
                  const isSelected =
                    (selectedVersionId || openedArticle.versions[0]?.id) === ver.id;
                  const isEditingLabel = editingVersionId === ver.id;

                  return (
                    <div
                      key={ver.id}
                      className={`etudes-version-row ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedVersionId(ver.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 240 }}>
                        {isEditingLabel ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleRenameVersion(ver.id, editingVersionLabelValue);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingVersionLabelValue}
                              onChange={(e) => setEditingVersionLabelValue(e.target.value)}
                              className="etudes-form-input"
                              style={{ width: 110, padding: '4px 10px', fontSize: 14 }}
                              placeholder="VF, VO..."
                              autoFocus
                            />
                            <button type="submit" className="etudes-secondary-btn">
                              OK
                            </button>
                            <button
                              type="button"
                              className="etudes-secondary-btn"
                              onClick={() => setEditingVersionId(null)}
                            >
                              Annuler
                            </button>
                          </form>
                        ) : (
                          <span
                            style={{
                              backgroundColor: isSelected
                                ? 'var(--etudes-teal-dark)'
                                : 'var(--etudes-teal-accent)',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: 14,
                              padding: '5px 14px',
                              borderRadius: 999,
                              letterSpacing: '0.03em',
                            }}
                          >
                            {ver.versionLabel}
                          </span>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <strong
                            style={{
                              display: 'block',
                              fontSize: 16,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {ver.originalName}
                          </strong>
                          <span style={{ fontSize: 13.5, color: 'var(--etudes-text-muted)' }}>
                            Format {ver.format.toUpperCase()} • {formatFileSize(ver.size)} • Ajouté le{' '}
                            {formatDateShort(ver.addedAt)}
                            {ver.progress?.percentage
                              ? ` • Lu à ${Math.round(ver.progress.percentage)}%`
                              : ''}
                            {ver.annotationsCount > 0
                              ? ` • ${ver.annotationsCount} note${ver.annotationsCount > 1 ? 's' : ''}`
                              : ''}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="etudes-primary-cta"
                          style={{ height: 36, padding: '0 16px', fontSize: 14 }}
                          onClick={() => void handleReadArticleVersion(openedArticle, ver)}
                        >
                          Lire ({ver.versionLabel})
                        </button>

                        {canManageDocuments && (
                          <>
                            <button
                              type="button"
                              className="etudes-secondary-btn"
                              onClick={() => {
                                setEditingVersionId(ver.id);
                                setEditingVersionLabelValue(ver.versionLabel);
                              }}
                              title="Modifier le nom de la version (ex. VF, VO)"
                            >
                              Renommer (VF/VO)
                            </button>

                            {openedArticle.versions.length > 1 && (
                              <button
                                type="button"
                                className="etudes-secondary-btn"
                                style={{ color: '#dc2626' }}
                                onClick={() => void handleDeleteVersion(openedArticle, ver)}
                                title="Supprimer cette version"
                              >
                                Supprimer
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Zone pour rajouter un fichier lié (uniquement pour samamaaxel@gmail.com) */}
              {canManageDocuments && (
                <div
                  style={{
                    borderTop: '1px solid var(--etudes-border)',
                    paddingTop: 22,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontFamily: "'Alegreya', serif",
                          fontSize: 20,
                          fontWeight: 700,
                          margin: 0,
                        }}
                      >
                        Rajouter un fichier lié à cet article
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: 14, color: 'var(--etudes-text-muted)' }}>
                        Choisissez le type de version (ex. VF, VO, Annexe) puis déposez ou sélectionnez
                        votre fichier : il apparaîtra immédiatement dans la liste des versions ci-dessus.
                      </p>
                    </div>

                    {/* Choix rapide du libellé de la nouvelle version liée */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--etudes-text-secondary)' }}>
                        Version à ajouter :
                      </span>
                      {['VF', 'VO', 'Traduction', 'Annexe'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewLinkedVersionLabel(preset)}
                          style={{
                            border: '1px solid var(--etudes-border)',
                            borderRadius: 999,
                            padding: '4px 12px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            backgroundColor:
                              newLinkedVersionLabel === preset
                                ? 'var(--etudes-teal-dark)'
                                : 'var(--etudes-surface-subtle)',
                            color:
                              newLinkedVersionLabel === preset
                                ? '#ffffff'
                                : 'var(--etudes-text-main)',
                            fontFamily: 'inherit',
                          }}
                        >
                          {preset}
                        </button>
                      ))}
                      <input
                        type="text"
                        value={newLinkedVersionLabel}
                        onChange={(e) => setNewLinkedVersionLabel(e.target.value)}
                        placeholder="Ex: VF, VO..."
                        className="etudes-form-input"
                        style={{ width: 110, padding: '5px 10px', fontSize: 14 }}
                        aria-label="Nom de la version à ajouter"
                      />
                    </div>
                  </div>

                  <div
                    className={`etudes-linked-dropzone ${isDraggingOverLinkedBox ? 'is-dragging' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => linkedFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') linkedFileInputRef.current?.click();
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOverLinkedBox(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOverLinkedBox(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOverLinkedBox(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOverLinkedBox(false);
                      if (e.dataTransfer?.files?.length) {
                        void handleAddLinkedFilesToCurrentArticle(
                          openedArticle,
                          e.dataTransfer.files,
                          newLinkedVersionLabel
                        );
                      }
                    }}
                  >
                    <img
                      src={vector3Url}
                      alt=""
                      width={24}
                      height={24}
                      className="etudes-icon-invert"
                    />
                    <strong style={{ fontSize: 16, color: 'var(--etudes-text-main)' }}>
                      {isUploading
                        ? 'Chiffrement et liaison en cours…'
                        : `Cliquez ou glissez-déposez un fichier lié pour la version « ${
                            newLinkedVersionLabel || 'VO'
                          } »`}
                    </strong>
                    <span style={{ fontSize: 13, color: 'var(--etudes-text-muted)' }}>
                      Formats acceptés : PDF, EPUB, Markdown (.md), Texte (.txt)
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ====================================================================================
             VUE 2 : ONGLETS DE LA PAGE PRINCIPALE (APERÇU, NUMÉROS, MÉDIAS, LISTES, À PROPOS)
             ==================================================================================== */
          <>
            {/* -------------------- ONGLET 1 : APERÇU -------------------- */}
            {activeTab === 'apercu' && (
              <>
                {/* Ligne supérieure : À propos (1:53) + Dernier numéro / étude (1:58) */}
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
                    >
                      <h2 className="etudes-about-card-title">À propos</h2>
                      <p className="etudes-about-card-excerpt">
                        {ETUDES_ABOUT_FULL_TEXT.shortExcerpt}
                      </p>
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

                  {/* Dernier numéro / Dernière étude déposée (1:58) */}
                  <div className="etudes-latest-col">
                    <h2 className="etudes-section-h2">Dernier numéro</h2>

                    {latestArticle ? (
                      <div className="etudes-latest-body">
                        <button
                          type="button"
                          className="etudes-latest-cover-btn"
                          onClick={() => navigateToArticlePage(latestArticle.id)}
                          title={`Ouvrir la page de ${latestArticle.title}`}
                        >
                          {renderArticleCover(latestArticle, 197, 300)}
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
                              <span className="etudes-meta-type-label">
                                Numéro / Étude •{' '}
                                {latestArticle.versions.map((v) => v.versionLabel).join(', ')}
                              </span>
                            </div>

                            <button
                              type="button"
                              className={`etudes-bookmark-btn ${
                                defaultReadingList.articleIds.includes(latestArticle.id)
                                  ? 'is-saved'
                                  : ''
                              }`}
                              title="Ajouter ou retirer de Ma liste de lecture"
                              aria-label="Ajouter à la liste de lecture"
                              onClick={(e) =>
                                void handleToggleArticleInList(
                                  defaultReadingList,
                                  latestArticle,
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
                            onClick={() => navigateToArticlePage(latestArticle.id)}
                          >
                            {latestArticle.issueRef || formatDateShort(latestArticle.addedAt)}
                          </p>
                          <h3
                            className="etudes-issue-title"
                            onClick={() => navigateToArticlePage(latestArticle.id)}
                          >
                            {latestArticle.title}
                          </h3>
                          {latestArticle.author && (
                            <p
                              style={{
                                margin: '8px 0 0',
                                fontSize: 15,
                                color: 'var(--etudes-text-secondary)',
                              }}
                            >
                              {latestArticle.author}
                            </p>
                          )}
                          {(latestArticle.themes || []).length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                marginTop: 10,
                              }}
                            >
                              {(latestArticle.themes || []).map((theme) => (
                                <button
                                  key={theme}
                                  type="button"
                                  className="etudes-theme-tag"
                                  style={{ cursor: 'pointer', border: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedThemeFilter((curr) =>
                                      curr?.toLowerCase() === theme.toLowerCase() ? null : theme
                                    );
                                  }}
                                >
                                  #{theme}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="etudes-article-card"
                        style={{
                          marginTop: 22,
                          padding: '36px 28px',
                          textAlign: 'center',
                          borderStyle: 'dashed',
                          cursor: canManageDocuments ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (canManageDocuments) fileInputRef.current?.click();
                        }}
                      >
                        {canManageDocuments && (
                          <img
                            src={vector3Url}
                            alt=""
                            width={24}
                            height={24}
                            className="etudes-icon-invert"
                            style={{ margin: '0 auto 10px' }}
                          />
                        )}
                        <h3 className="etudes-article-title" style={{ marginBottom: 6 }}>
                          Aucune étude publiée pour le moment
                        </h3>
                        <p style={{ margin: 0, color: 'var(--etudes-text-muted)', fontSize: 15 }}>
                          {canManageDocuments
                            ? 'Utilisez le bouton « Rajouter un fichier, étude / Drag & Drop » ci-dessous pour déposer votre première étude.'
                            : 'Les études publiées apparaîtront ici dès leur mise en ligne.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ligne Recherche filtrée (1:67) + Drag & Drop Upload (1:886, uniquement pour samamaaxel@gmail.com) */}
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
                      title="Rechercher"
                      aria-label="Rechercher"
                    >
                      <img src={vector4Url} alt="" width={18} height={18} />
                    </button>
                  </form>

                  {canManageDocuments && (
                    <div
                      className={`etudes-dropzone-pill ${isDraggingOverBox ? 'is-dragging' : ''}`}
                      role="button"
                      tabIndex={0}
                      title="Cliquez ou glissez-déposez un fichier (.pdf, .epub, .md, .txt) pour créer une étude"
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
                          void handleUploadNewStudies(e.dataTransfer.files);
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
                  )}
                </div>

                {/* ==================== BARRE DES THÈMES SUR LA PAGE D'ACCUEIL DU SITE ==================== */}
                {renderThemesBar()}

                {/* ==================== SECTION : NUMÉROS RÉCEMMENT AJOUTÉS (1:76) ==================== */}
                <section className="etudes-recent-section" aria-label="Numéros récemment ajoutés">
                  <div className="etudes-section-header">
                    <h2 className="etudes-section-h2">Numéros récemment ajoutés</h2>

                    <div className="etudes-section-header-right">
                      {filteredArticles.length > 0 && (
                        <button
                          type="button"
                          className="etudes-text-link-btn"
                          onClick={() => setShowAllRecentGrid((v) => !v)}
                        >
                          {showAllRecentGrid ? 'Réduire en carrousel' : 'Voir tout'}
                        </button>
                      )}

                      {!showAllRecentGrid && (
                        <div
                          className="etudes-dots-row"
                          role="tablist"
                          aria-label="Pages du carrousel"
                        >
                          {Array.from({ length: totalCarouselPages }).map((_, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="etudes-dot-btn"
                              aria-label={`Page ${idx + 1}`}
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

                  {filteredArticles.length === 0 ? (
                    <div
                      className="etudes-article-card"
                      style={{
                        padding: 28,
                        textAlign: 'center',
                        cursor: canManageDocuments ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (canManageDocuments) fileInputRef.current?.click();
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 16, color: 'var(--etudes-text-muted)' }}>
                        {canManageDocuments
                          ? 'Aucun fichier déposé sur le site Études. Cliquez ici ou glissez-déposez vos fichiers pour les afficher dans cette section.'
                          : 'Aucune étude disponible dans cette section pour le moment.'}
                      </p>
                    </div>
                  ) : showAllRecentGrid ? (
                    <div className="etudes-issues-grid">
                      {filteredArticles.map((art) => (
                        <div key={art.id} className="etudes-issue-card">
                          <button
                            type="button"
                            className="etudes-issue-cover-btn"
                            onClick={() => navigateToArticlePage(art.id)}
                          >
                            {renderArticleCover(art, 206, 300)}
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
                              <span className="etudes-meta-type-label">
                                {art.versions.map((v) => v.versionLabel).join(' · ')}
                              </span>
                            </div>
                            <button
                              type="button"
                              className={`etudes-bookmark-btn ${
                                defaultReadingList.articleIds.includes(art.id) ? 'is-saved' : ''
                              }`}
                              onClick={(e) =>
                                void handleToggleArticleInList(defaultReadingList, art, e)
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
                            onClick={() => navigateToArticlePage(art.id)}
                          >
                            {art.issueRef || formatDateShort(art.addedAt)}
                          </p>
                          <h3
                            className="etudes-issue-title"
                            onClick={() => navigateToArticlePage(art.id)}
                          >
                            {art.title}
                          </h3>
                          {(art.themes || []).length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 5,
                                marginTop: 6,
                              }}
                            >
                              {(art.themes || []).map((theme) => (
                                <button
                                  key={theme}
                                  type="button"
                                  className="etudes-theme-tag"
                                  style={{ cursor: 'pointer', border: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedThemeFilter((curr) =>
                                      curr?.toLowerCase() === theme.toLowerCase() ? null : theme
                                    );
                                  }}
                                >
                                  #{theme}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="etudes-carousel-outer">
                      <button
                        type="button"
                        className="etudes-carousel-arrow etudes-carousel-arrow--prev"
                        aria-label="Précédent"
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

                      <div
                        ref={carouselRef}
                        className="etudes-carousel-viewport"
                        onScroll={handleCarouselScroll}
                      >
                        {filteredArticles.map((art) => (
                          <div key={art.id} className="etudes-issue-card">
                            <button
                              type="button"
                              className="etudes-issue-cover-btn"
                              onClick={() => navigateToArticlePage(art.id)}
                            >
                              {renderArticleCover(art, 206, 300)}
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
                                <span className="etudes-meta-type-label">
                                  {art.versions.map((v) => v.versionLabel).join(' · ')}
                                </span>
                              </div>
                              <button
                                type="button"
                                className={`etudes-bookmark-btn ${
                                  defaultReadingList.articleIds.includes(art.id) ? 'is-saved' : ''
                                }`}
                                onClick={(e) =>
                                  void handleToggleArticleInList(defaultReadingList, art, e)
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
                              onClick={() => navigateToArticlePage(art.id)}
                            >
                              {art.issueRef || formatDateShort(art.addedAt)}
                            </p>
                            <h3
                              className="etudes-issue-title"
                              onClick={() => navigateToArticlePage(art.id)}
                            >
                              {art.title}
                            </h3>
                            {(art.themes || []).length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 5,
                                  marginTop: 6,
                                }}
                              >
                                {(art.themes || []).map((theme) => (
                                  <button
                                    key={theme}
                                    type="button"
                                    className="etudes-theme-tag"
                                    style={{ cursor: 'pointer', border: 0 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedThemeFilter((curr) =>
                                        curr?.toLowerCase() === theme.toLowerCase() ? null : theme
                                      );
                                    }}
                                  >
                                    #{theme}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="etudes-carousel-arrow etudes-carousel-arrow--next"
                        aria-label="Suivant"
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
                <section
                  className="etudes-articles-section"
                  aria-label="Articles les plus consultés"
                >
                  <h2 className="etudes-section-h2">Articles les plus consultés</h2>

                  {mostConsultedArticles.length === 0 ? (
                    <div
                      className="etudes-article-card"
                      style={{ marginTop: 24, padding: 28, textAlign: 'center', cursor: 'default' }}
                    >
                      <p style={{ margin: 0, fontSize: 16, color: 'var(--etudes-text-muted)' }}>
                        Vos études déposées apparaîtront ici selon leur fréquence de consultation.
                      </p>
                    </div>
                  ) : (
                    <div className="etudes-articles-list">
                      {mostConsultedArticles.map((article) => (
                        <article
                          key={article.id}
                          className="etudes-article-card"
                          onClick={() => navigateToArticlePage(article.id)}
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
                              <span className="etudes-meta-type-label">
                                Article / Étude • Versions :{' '}
                                {article.versions.map((v) => v.versionLabel).join(', ')}
                              </span>
                            </div>

                            <button
                              type="button"
                              className={`etudes-bookmark-btn ${
                                defaultReadingList.articleIds.includes(article.id) ? 'is-saved' : ''
                              }`}
                              title="Ajouter à Ma liste de lecture"
                              aria-label="Ajouter à Ma liste de lecture"
                              onClick={(e) =>
                                void handleToggleArticleInList(defaultReadingList, article, e)
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

                          <div className="etudes-article-title-row">
                            <h3 className="etudes-article-title">{article.title}</h3>
                            {article.subtitle && (
                              <p className="etudes-article-subtitle">{article.subtitle}</p>
                            )}
                          </div>

                          {article.author && (
                            <div className="etudes-article-authors">
                              <button
                                type="button"
                                className="etudes-author-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAuthorFilter((curr) =>
                                    curr === article.author ? null : article.author
                                  );
                                }}
                              >
                                {article.author}
                              </button>
                            </div>
                          )}

                          {(article.themes || []).length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                marginBottom: 8,
                              }}
                            >
                              {(article.themes || []).map((theme) => (
                                <button
                                  key={theme}
                                  type="button"
                                  className="etudes-theme-tag"
                                  style={{ cursor: 'pointer', border: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedThemeFilter((curr) =>
                                      curr?.toLowerCase() === theme.toLowerCase() ? null : theme
                                    );
                                  }}
                                >
                                  #{theme}
                                </button>
                              ))}
                            </div>
                          )}

                          <p className="etudes-article-citation">
                            {article.versions.length} version
                            {article.versions.length > 1 ? 's' : ''} disponible
                            {article.versions.length > 1 ? 's' : ''} (
                            {article.versions.map((v) => v.versionLabel).join(' / ')}) •{' '}
                            {canManageDocuments
                              ? 'Cliquez pour choisir la version ou lier un fichier'
                              : 'Cliquez pour lire l’étude ou choisir la version'}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {/* ==================== SECTION : LISTES (Uniquement "Ma liste de lecture" de base + bouton +) ==================== */}
                <section className="etudes-lists-section" aria-label="Listes">
                  <div className="etudes-section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h2 className="etudes-section-h2">Listes</h2>
                      <button
                        type="button"
                        className="etudes-btn-plus-circle"
                        title="Créer une nouvelle liste"
                        aria-label="Créer une nouvelle liste"
                        onClick={openCreateListModal}
                      >
                        +
                      </button>
                    </div>

                    <div className="etudes-section-header-right">
                      <button
                        type="button"
                        className="etudes-btn-plus"
                        onClick={openCreateListModal}
                      >
                        <span>+ Nouvelle liste</span>
                      </button>

                      <div
                        className="etudes-dots-row"
                        role="tablist"
                        aria-label="Sélection de listes"
                      >
                        {lists.map((l, idx) => (
                          <button
                            key={l.id}
                            type="button"
                            className="etudes-dot-btn"
                            aria-label={l.title}
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
                  </div>

                  <div className="etudes-lists-row">
                    {lists.map((listEntry, idx) => (
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
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                height: 32,
                              }}
                            >
                              <div className="etudes-meta-type">
                                <img
                                  src={svg4Url}
                                  alt=""
                                  width={24}
                                  height={24}
                                  className="etudes-icon-invert"
                                />
                                <span className="etudes-meta-type-label">{listEntry.badge}</span>
                              </div>

                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => openEditListModal(listEntry, e)}
                                  title="Modifier cette liste"
                                  style={{
                                    border: 0,
                                    background: 'var(--etudes-surface-subtle)',
                                    borderRadius: 8,
                                    padding: '3px 7px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    color: 'var(--etudes-text-secondary)',
                                  }}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => void handleDeleteList(listEntry, e)}
                                  title={
                                    listEntry.isDefault
                                      ? 'Vider Ma liste de lecture'
                                      : 'Supprimer cette liste'
                                  }
                                  style={{
                                    border: 0,
                                    background: 'var(--etudes-surface-subtle)',
                                    borderRadius: 8,
                                    padding: '3px 7px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    color: '#dc2626',
                                  }}
                                >
                                  {listEntry.isDefault ? 'Vider' : '×'}
                                </button>
                              </div>
                            </div>

                            <h3 className="etudes-stacked-title">{listEntry.title}</h3>
                            <p className="etudes-stacked-author">
                              {listEntry.author || authConfig?.username || 'Études'}
                            </p>
                          </div>

                          <p className="etudes-stacked-count">
                            {listEntry.articleIds.length} élément
                            {listEntry.articleIds.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Carte + pour créer une nouvelle liste directement */}
                    <button
                      type="button"
                      className="etudes-add-list-card"
                      onClick={openCreateListModal}
                    >
                      <span className="etudes-btn-plus-circle">+</span>
                      <strong
                        style={{
                          fontFamily: "'Alegreya', serif",
                          fontSize: 20,
                          color: 'var(--etudes-text-main)',
                        }}
                      >
                        Ajouter une liste
                      </strong>
                      <span style={{ fontSize: 14, color: 'var(--etudes-text-muted)' }}>
                        Créer une liste personnalisée d’études
                      </span>
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* -------------------- ONGLET 2 : NUMÉROS / ÉTUDES -------------------- */}
            {activeTab === 'numeros' && (
              <section aria-label="Toutes vos études">
                <div
                  className="etudes-section-header"
                  style={{ flexWrap: 'wrap', gap: 16, marginBottom: 28 }}
                >
                  <div>
                    <h2 className="etudes-section-h2">
                      Études ({filteredArticles.length})
                    </h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--etudes-text-secondary)' }}>
                      {canManageDocuments
                        ? 'Cliquez sur une étude pour ouvrir sa page dédiée, choisir sa version (VF / VO) ou y lier un nouveau fichier.'
                        : 'Cliquez sur une étude pour ouvrir sa page dédiée et choisir sa version (VF / VO).'}
                    </p>
                  </div>

                  {canManageDocuments && (
                    <button
                      type="button"
                      className="etudes-btn-plus"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      + Ajouter une étude
                    </button>
                  )}
                </div>

                {allThemesWithCounts.length > 0 && renderThemesBar(28)}

                {filteredArticles.length === 0 ? (
                  <div
                    className="etudes-article-card"
                    style={{
                      textAlign: 'center',
                      padding: 36,
                      cursor: canManageDocuments ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (canManageDocuments) fileInputRef.current?.click();
                    }}
                  >
                    <h3 className="etudes-article-title" style={{ marginBottom: 8 }}>
                      Aucune étude disponible
                    </h3>
                    <p style={{ margin: 0, color: 'var(--etudes-text-muted)' }}>
                      {canManageDocuments
                        ? 'Cliquez ici ou glissez-déposez un fichier (.pdf, .epub, .md, .txt) pour l’ajouter au site Études.'
                        : 'Aucune étude n’est publiée pour le moment.'}
                    </p>
                  </div>
                ) : (
                  <div className="etudes-issues-grid">
                    {filteredArticles.map((art) => (
                      <div key={art.id} className="etudes-issue-card">
                        <button
                          type="button"
                          className="etudes-issue-cover-btn"
                          onClick={() => navigateToArticlePage(art.id)}
                        >
                          {renderArticleCover(art, 206, 300)}
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
                            <span className="etudes-meta-type-label">
                              {art.versions.map((v) => v.versionLabel).join(' · ')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={`etudes-bookmark-btn ${
                              defaultReadingList.articleIds.includes(art.id) ? 'is-saved' : ''
                            }`}
                            onClick={(e) =>
                              void handleToggleArticleInList(defaultReadingList, art, e)
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
                          onClick={() => navigateToArticlePage(art.id)}
                        >
                          {art.issueRef || formatDateShort(art.addedAt)}
                        </p>
                        <h3
                          className="etudes-issue-title"
                          onClick={() => navigateToArticlePage(art.id)}
                        >
                          {art.title}
                        </h3>
                        {(art.themes || []).length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 5,
                              marginTop: 6,
                            }}
                          >
                            {(art.themes || []).map((theme) => (
                              <button
                                key={theme}
                                type="button"
                                className="etudes-theme-tag"
                                style={{ cursor: 'pointer', border: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedThemeFilter((curr) =>
                                    curr?.toLowerCase() === theme.toLowerCase() ? null : theme
                                  );
                                }}
                              >
                                #{theme}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* -------------------- ONGLET 3 : VIDÉOS / PODCASTS -------------------- */}
            {activeTab === 'medias' && (
              <section aria-label="Vidéos et Podcasts">
                <div className="etudes-section-header">
                  <h2 className="etudes-section-h2">Vidéos / Podcasts</h2>
                  {canManageDocuments && (
                    <button
                      type="button"
                      className="etudes-btn-plus"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      + Ajouter une transcription / étude
                    </button>
                  )}
                </div>
                <div
                  className="etudes-article-card"
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    cursor: canManageDocuments ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (canManageDocuments) fileInputRef.current?.click();
                  }}
                >
                  <p style={{ margin: 0, fontSize: 16, color: 'var(--etudes-text-muted)' }}>
                    {canManageDocuments
                      ? 'Aucun fichier média ou transcription pré-chargé. Déposez vos propres fichiers pour les consulter.'
                      : 'Aucun média ou transcription disponible pour le moment.'}
                  </p>
                </div>
              </section>
            )}

            {/* -------------------- ONGLET 4 : LISTES (Ajouter, Modifier, Supprimer) -------------------- */}
            {activeTab === 'listes' && (
              <section aria-label="Listes de lecture">
                <div className="etudes-section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h2 className="etudes-section-h2">Listes</h2>
                    <button
                      type="button"
                      className="etudes-btn-plus-circle"
                      title="Ajouter une nouvelle liste"
                      onClick={openCreateListModal}
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    className="etudes-btn-plus"
                    onClick={openCreateListModal}
                  >
                    + Ajouter une liste
                  </button>
                </div>

                <div className="etudes-lists-row" style={{ marginBottom: 40 }}>
                  {lists.map((listEntry) => {
                    const isSelected = activeListId === listEntry.id;
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
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                height: 32,
                              }}
                            >
                              <div className="etudes-meta-type">
                                <img
                                  src={svg4Url}
                                  alt=""
                                  width={24}
                                  height={24}
                                  className="etudes-icon-invert"
                                />
                                <span className="etudes-meta-type-label">{listEntry.badge}</span>
                              </div>

                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => openEditListModal(listEntry, e)}
                                  style={{
                                    border: 0,
                                    background: 'var(--etudes-surface-subtle)',
                                    borderRadius: 8,
                                    padding: '3px 7px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    color: 'var(--etudes-text-secondary)',
                                  }}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => void handleDeleteList(listEntry, e)}
                                  style={{
                                    border: 0,
                                    background: 'var(--etudes-surface-subtle)',
                                    borderRadius: 8,
                                    padding: '3px 7px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    color: '#dc2626',
                                  }}
                                >
                                  {listEntry.isDefault ? 'Vider' : 'Supprimer'}
                                </button>
                              </div>
                            </div>

                            <h3 className="etudes-stacked-title">{listEntry.title}</h3>
                            <p className="etudes-stacked-author">
                              {listEntry.author || authConfig?.username || 'Études'}
                            </p>
                          </div>

                          <p className="etudes-stacked-count">
                            {listEntry.articleIds.length} élément
                            {listEntry.articleIds.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="etudes-add-list-card"
                    onClick={openCreateListModal}
                  >
                    <span className="etudes-btn-plus-circle">+</span>
                    <strong
                      style={{
                        fontFamily: "'Alegreya', serif",
                        fontSize: 20,
                        color: 'var(--etudes-text-main)',
                      }}
                    >
                      Nouvelle liste
                    </strong>
                    <span style={{ fontSize: 14, color: 'var(--etudes-text-muted)' }}>
                      Cliquez sur + pour créer une liste
                    </span>
                  </button>
                </div>

                {/* Détail de la liste sélectionnée */}
                {(() => {
                  const currentList =
                    lists.find((l) => l.id === activeListId) || defaultReadingList;
                  const listArticles = currentList.articleIds
                    .map((id) => articles.find((a) => a.id === id))
                    .filter((a): a is EtudeArticleItem => Boolean(a));

                  return (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          marginBottom: 16,
                        }}
                      >
                        <div>
                          <h3 className="etudes-section-h2">{currentList.title}</h3>
                          {currentList.description && (
                            <p style={{ margin: '4px 0 0', color: 'var(--etudes-text-secondary)' }}>
                              {currentList.description}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            className="etudes-secondary-btn"
                            onClick={() => openEditListModal(currentList)}
                          >
                            Modifier la liste
                          </button>
                          <button
                            type="button"
                            className="etudes-secondary-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => void handleDeleteList(currentList)}
                          >
                            {currentList.isDefault
                              ? 'Vider Ma liste de lecture'
                              : 'Supprimer la liste'}
                          </button>
                        </div>
                      </div>

                      {listArticles.length === 0 ? (
                        <div className="etudes-article-card" style={{ padding: 28 }}>
                          <p style={{ margin: 0, color: 'var(--etudes-text-muted)' }}>
                            Cette liste ne contient aucune étude pour le moment. Utilisez le bouton
                            « Modifier la liste » ou cliquez sur l’icône de signet d’une étude pour
                            l’y ajouter.
                          </p>
                        </div>
                      ) : (
                        <div className="etudes-articles-list">
                          {listArticles.map((art) => (
                            <article
                              key={art.id}
                              className="etudes-article-card"
                              onClick={() => navigateToArticlePage(art.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 16,
                              }}
                            >
                              <div>
                                <span className="etudes-meta-type-label">
                                  Versions : {art.versions.map((v) => v.versionLabel).join(' / ')}
                                </span>
                                <h4 className="etudes-article-title" style={{ marginTop: 6 }}>
                                  {art.title}
                                </h4>
                                {art.author && (
                                  <p
                                    style={{
                                      margin: '4px 0 0',
                                      color: 'var(--etudes-text-secondary)',
                                    }}
                                  >
                                    {art.author}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                className="etudes-secondary-btn"
                                onClick={(e) =>
                                  void handleToggleArticleInList(currentList, art, e)
                                }
                              >
                                Retirer de la liste
                              </button>
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
              <section aria-label="À propos">
                <div
                  className="etudes-article-card"
                  style={{ cursor: 'default', padding: '32px 36px' }}
                >
                  <h2 className="etudes-section-h2" style={{ marginBottom: 16 }}>
                    À propos de votre espace Études
                  </h2>
                  <p style={{ fontSize: 18, lineHeight: 1.6, margin: '0 0 24px' }}>
                    {ETUDES_ABOUT_FULL_TEXT.shortExcerpt}
                  </p>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 20,
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
                        <p
                          style={{
                            margin: 0,
                            lineHeight: 1.55,
                            color: 'var(--etudes-text-secondary)',
                          }}
                        >
                          {sec.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* ==================== MODALE CRÉER / MODIFIER UNE LISTE ==================== */}
      {listModalState?.open && (
        <div
          className="etudes-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={
            listModalState.mode === 'create' ? 'Créer une nouvelle liste' : 'Modifier la liste'
          }
        >
          <div className="etudes-modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <h3 className="etudes-section-h2" style={{ margin: 0 }}>
                {listModalState.mode === 'create'
                  ? 'Ajouter une nouvelle liste'
                  : 'Modifier la liste'}
              </h3>
              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}
                aria-label="Fermer la fenêtre"
                onClick={() => setListModalState(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitListModal}>
              <div className="etudes-form-field">
                <label htmlFor="etudes-list-title">Nom de la liste</label>
                <input
                  id="etudes-list-title"
                  type="text"
                  className="etudes-form-input"
                  placeholder="Ex: Géopolitique, Écologie, Lectures prioritaires..."
                  value={listModalState.title}
                  onChange={(e) =>
                    setListModalState((s) => (s ? { ...s, title: e.target.value } : null))
                  }
                  required
                  autoFocus
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="etudes-list-badge">Catégorie / Étiquette</label>
                <input
                  id="etudes-list-badge"
                  type="text"
                  className="etudes-form-input"
                  placeholder="Ex: Liste personnelle, Dossier..."
                  value={listModalState.badge}
                  onChange={(e) =>
                    setListModalState((s) => (s ? { ...s, badge: e.target.value } : null))
                  }
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="etudes-list-desc">Description (optionnelle)</label>
                <textarea
                  id="etudes-list-desc"
                  rows={3}
                  className="etudes-form-textarea"
                  placeholder="Description ou notes sur cette liste..."
                  value={listModalState.description}
                  onChange={(e) =>
                    setListModalState((s) => (s ? { ...s, description: e.target.value } : null))
                  }
                />
              </div>

              {articles.length > 0 && (
                <div className="etudes-form-field">
                  <label>Études incluses dans cette liste ({listModalState.articleIds.length})</label>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      border: '1px solid var(--etudes-border)',
                      borderRadius: 10,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {articles.map((art) => {
                      const checked = listModalState.articleIds.includes(art.id);
                      return (
                        <label
                          key={art.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontWeight: 400,
                            cursor: 'pointer',
                            color: 'var(--etudes-text-main)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setListModalState((s) => {
                                if (!s) return null;
                                const nextIds = checked
                                  ? s.articleIds.filter((id) => id !== art.id)
                                  : [...s.articleIds, art.id];
                                return { ...s, articleIds: nextIds };
                              });
                            }}
                          />
                          <span>
                            {art.title} ({art.versions.map((v) => v.versionLabel).join(', ')})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 22,
                }}
              >
                <button
                  type="button"
                  className="etudes-secondary-btn"
                  onClick={() => setListModalState(null)}
                >
                  Annuler
                </button>
                <button type="submit" className="etudes-primary-cta" style={{ height: 38 }}>
                  {listModalState.mode === 'create' ? 'Créer la liste' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODALE MODIFIER LES MÉTADONNÉES D'UNE ÉTUDE (Réservé à samamaaxel@gmail.com) ==================== */}
      {canManageDocuments && editArticleModal && (
        <div
          className="etudes-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier les informations de l'étude"
        >
          <div className="etudes-modal-card" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <h3 className="etudes-section-h2" style={{ margin: 0 }}>
                Modifier la fiche de l’étude
              </h3>
              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}
                aria-label="Fermer la fenêtre"
                onClick={() => {
                  setModalThemeInput('');
                  setEditArticleModal(null);
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitEditArticleModal}>
              <div className="etudes-form-field">
                <label htmlFor="edit-art-title">Titre de l’étude</label>
                <input
                  id="edit-art-title"
                  type="text"
                  className="etudes-form-input"
                  value={editArticleModal.title}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, title: e.target.value } : null))
                  }
                  required
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-subtitle">Sous-titre</label>
                <input
                  id="edit-art-subtitle"
                  type="text"
                  className="etudes-form-input"
                  value={editArticleModal.subtitle}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, subtitle: e.target.value } : null))
                  }
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-author">Auteur(s)</label>
                <input
                  id="edit-art-author"
                  type="text"
                  className="etudes-form-input"
                  value={editArticleModal.author}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, author: e.target.value } : null))
                  }
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-genre">Genre de l’étude (ex: Essai, Dossier, Entretien…)</label>
                <input
                  id="edit-art-genre"
                  type="text"
                  className="etudes-form-input"
                  value={editArticleModal.genre}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, genre: e.target.value } : null))
                  }
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-ref">Référence / Date</label>
                <input
                  id="edit-art-ref"
                  type="text"
                  className="etudes-form-input"
                  value={editArticleModal.issueRef}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, issueRef: e.target.value } : null))
                  }
                />
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-themes">Thèmes de l’étude</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {(editArticleModal.themes || []).length === 0 ? (
                    <span
                      style={{
                        fontSize: 13.5,
                        color: 'var(--etudes-text-muted)',
                        fontStyle: 'italic',
                      }}
                    >
                      Aucun thème ajouté pour le moment.
                    </span>
                  ) : (
                    (editArticleModal.themes || []).map((theme) => (
                      <span key={theme} className="etudes-theme-tag">
                        <span>#{theme}</span>
                        <button
                          type="button"
                          className="etudes-theme-tag-remove"
                          title={`Retirer le thème « ${theme} »`}
                          onClick={() =>
                            setEditArticleModal((s) =>
                              s
                                ? {
                                    ...s,
                                    themes: s.themes.filter((t) => t !== theme),
                                  }
                                : null
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    id="edit-art-themes"
                    type="text"
                    className="etudes-form-input"
                    placeholder="Ex: Philosophie, Écologie, Géopolitique..."
                    value={modalThemeInput}
                    onChange={(e) => setModalThemeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const toAdd = modalThemeInput
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        if (toAdd.length === 0) return;
                        setEditArticleModal((s) => {
                          if (!s) return null;
                          const next = [...s.themes];
                          for (const item of toAdd) {
                            if (!next.some((t) => t.toLowerCase() === item.toLowerCase())) {
                              next.push(item);
                            }
                          }
                          return { ...s, themes: next };
                        });
                        setModalThemeInput('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="etudes-secondary-btn"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      const toAdd = modalThemeInput
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (toAdd.length === 0) return;
                      setEditArticleModal((s) => {
                        if (!s) return null;
                        const next = [...s.themes];
                        for (const item of toAdd) {
                          if (!next.some((t) => t.toLowerCase() === item.toLowerCase())) {
                            next.push(item);
                          }
                        }
                        return { ...s, themes: next };
                      });
                      setModalThemeInput('');
                    }}
                  >
                    + Ajouter
                  </button>
                  <button
                    type="button"
                    className="etudes-gemini-ai-btn"
                    style={{ flexShrink: 0 }}
                    disabled={isClassifyingArticle}
                    onClick={() => {
                      if (!editArticleModal) return;
                      void handleClassifySingleArticle(
                        {
                          title: editArticleModal.title,
                          subtitle: editArticleModal.subtitle,
                          author: editArticleModal.author,
                          description: editArticleModal.description,
                        },
                        (newThemes, detectedGenre) => {
                          setEditArticleModal((s) => {
                            if (!s) return null;
                            const next = [...s.themes];
                            for (const item of newThemes) {
                              if (!next.some((t) => t.toLowerCase() === item.toLowerCase())) {
                                next.push(item);
                              }
                            }
                            return {
                              ...s,
                              themes: next,
                              genre: detectedGenre || s.genre,
                            };
                          });
                        }
                      );
                    }}
                    title="Analyser le titre et la description pour déterminer le genre et les thèmes"
                  >
                    <span>✨</span>
                    <span>{isClassifyingArticle ? 'Analyse…' : 'Thèmes'}</span>
                  </button>
                </div>
              </div>

              <div className="etudes-form-field">
                <label htmlFor="edit-art-desc">Résumé / Description</label>
                <textarea
                  id="edit-art-desc"
                  rows={3}
                  className="etudes-form-textarea"
                  value={editArticleModal.description}
                  onChange={(e) =>
                    setEditArticleModal((s) => (s ? { ...s, description: e.target.value } : null))
                  }
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  className="etudes-secondary-btn"
                  onClick={() => {
                    setModalThemeInput('');
                    setEditArticleModal(null);
                  }}
                >
                  Annuler
                </button>
                <button type="submit" className="etudes-primary-cta" style={{ height: 38 }}>
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== LISEUSE FOLIO INTÉGRÉE (VaultReaderModal) ==================== */}
      {readerState && (
        <VaultReaderModal
          documentMeta={readerState.docMeta}
          decryptedBuffer={readerState.decryptedBuffer}
          initialStudyData={readerState.studyData}
          initialTheme={isDark ? 'dark' : 'light'}
          onClose={handleCloseReader}
          onLockNow={handleLockVault}
          onToggleFavorite={async () => {
            await handleToggleArticleInList(defaultReadingList, readerState.article);
          }}
          onSaveProgress={handleSaveReaderProgress}
          onSaveStudyData={handleSaveReaderStudyData}
        />
      )}

      {/* ==================== MODALE DE DÉVERROUILLAGE / INITIALISATION DU COFFRE ==================== */}
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

      {/* ==================== MODALE APPAREILS CONNECTÉS ==================== */}
      {showDevicesModal && <DevicesPanel onClose={() => setShowDevicesModal(false)} />}

      {/* ==================== MODALE CONFIGURATION CLÉ GEMINI ==================== */}
      {showGeminiKeyModal && (
        <div
          className="etudes-modal-backdrop"
          onClick={() => setShowGeminiKeyModal(false)}
        >
          <div
            className="etudes-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✨</span> Clé API Google Gemini
              </h3>
              <button
                type="button"
                className="etudes-icon-btn"
                onClick={() => setShowGeminiKeyModal(false)}
                title="Fermer"
              >
                ×
              </button>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--etudes-text-main)' }}>
              L'API Google Gemini permet d'analyser vos études pour <strong>organiser automatiquement les thèmes en Grands Thèmes et Sous-thèmes</strong>, et de suggérer les bons tags dès l'import d'un document.
            </p>

            <div
              style={{
                backgroundColor: 'var(--etudes-surface-subtle)',
                border: '1px solid var(--etudes-border)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 18,
                fontSize: 13.5,
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--etudes-teal-dark)' }}>
                🎁 100% Gratuit — Aucun abonnement ni carte bancaire requis :
              </div>
              <div style={{ color: 'var(--etudes-text-muted)' }}>
                Obtenez votre clé en 30 secondes sur le site officiel Google AI Studio :
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--etudes-teal-dark)',
                  fontWeight: 700,
                  marginTop: 6,
                  textDecoration: 'underline',
                }}
              >
                🔗 Ouvrir Google AI Studio (aistudio.google.com)
              </a>
            </div>

            <form onSubmit={handleSaveGeminiKey}>
              <div className="etudes-form-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label htmlFor="gemini-api-key-input" style={{ margin: 0 }}>
                    Clé API Gemini (commence par AIzaSy...)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowGeminiKeyPlain((v) => !v)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'var(--etudes-teal-dark)',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    {showGeminiKeyPlain ? 'Masquer' : 'Afficher la clé'}
                  </button>
                </div>
                <input
                  id="gemini-api-key-input"
                  type={showGeminiKeyPlain ? 'text' : 'password'}
                  className="etudes-form-input"
                  style={{ fontFamily: 'monospace', fontSize: 13.5 }}
                  placeholder={
                    hasGeminiKey
                      ? '•••••••••••••••••••••••• (Clé active — collez pour remplacer)'
                      : 'AIzaSy...'
                  }
                  value={geminiKeyInput}
                  onChange={(e) => {
                    setGeminiKeyInput(e.target.value);
                    if (geminiKeyModalError) setGeminiKeyModalError(null);
                  }}
                  autoFocus
                />
              </div>

              {geminiKeyModalError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 13.5,
                    marginBottom: 14,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Erreur de validation de la clé</div>
                  <div>{geminiKeyModalError}</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                    Conseil : Allez sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>aistudio.google.com</a>, cliquez sur "Create API key", puis copiez la clé complète.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                {hasGeminiKey && (
                  <button
                    type="button"
                    className="etudes-secondary-btn"
                    style={{ marginRight: 'auto', color: '#ef4444' }}
                    onClick={async () => {
                      if (confirm('Voulez-vous vraiment retirer la clé Gemini enregistrée ?')) {
                        await saveGeminiApiKey('');
                        setHasGeminiKey(false);
                        setShowGeminiKeyModal(false);
                        showToast('Clé Gemini retirée.');
                      }
                    }}
                  >
                    Supprimer la clé
                  </button>
                )}

                <button
                  type="button"
                  className="etudes-secondary-btn"
                  onClick={() => setShowGeminiKeyModal(false)}
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="etudes-primary-btn"
                  disabled={isSavingGeminiKey || (!geminiKeyInput.trim() && !hasGeminiKey)}
                >
                  {isSavingGeminiKey ? 'Vérification…' : 'Valider & Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== TOAST NOTIFICATION ==================== */}
      {toastMessage && (
        <div className="launchpad-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
