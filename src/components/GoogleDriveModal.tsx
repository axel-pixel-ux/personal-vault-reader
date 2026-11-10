import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import { DEFAULT_CATEGORIES, DocumentFormat, VaultDocumentMeta } from '../types/vault';
import {
  deleteDriveFolder,
  disconnectDrive,
  DriveStatus,
  getDriveConnectUrl,
  getDriveFolders,
  getDriveStatus,
  linkDriveBook,
  linkDriveFolder,
  LinkedDriveFolder,
  listRemoteDriveItems,
  RemoteDriveFile,
  RemoteDriveFolder,
  saveDriveOAuthConfig,
  syncDriveFolder,
} from '../auth/driveService';
import { formatBytes, formatDateShort } from './VaultDashboard';

interface GoogleDriveModalProps {
  categories: string[];
  defaultCategory: string;
  onClose: () => void;
  onBookLinked: (book: VaultDocumentMeta) => void;
  onBooksAdded?: (books: VaultDocumentMeta[]) => void;
  onRefreshLibrary?: () => Promise<void>;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_drive_link:
    'Lien ou identifiant Google Drive invalide. Collez un lien de dossier (https://drive.google.com/drive/folders/...) ou de fichier.',
  is_file_not_folder:
    'Ce lien pointe vers un fichier unique et non un dossier. Utilisez l’onglet « Fichier unique » ou collez le lien d’un dossier.',
  is_folder_use_folder_tab:
    'Ce lien pointe vers un dossier Google Drive. Utilisez l’onglet « Dossier (Bibliothèque) » pour importer tout le dossier.',
  not_a_folder:
    'Cet identifiant ne correspond pas à un dossier Google Drive accessible.',
  drive_folder_private:
    'Ce dossier Google Drive est privé. Dans Google Drive, faites clic droit sur le dossier → Partager → « Tous les utilisateurs disposant du lien », ou connectez votre compte Google dans le 3e onglet.',
  drive_folder_unreachable:
    'Impossible de lire ce dossier Google Drive. Vérifiez le lien de partage et réessayez.',
  folder_empty_no_books:
    'Aucun livre (.epub, .pdf, .md, .txt) n’a été trouvé dans ce dossier Google Drive.',
  drive_file_private:
    'Ce fichier Google Drive est restreint. Activez « Tous les utilisateurs disposant du lien » sur Google Drive, ou liez votre compte Google.',
  drive_unreachable:
    'Impossible de joindre ce fichier sur Google Drive. Vérifiez le lien et réessayez.',
  oauth_not_configured:
    'Veuillez d’abord renseigner le Client ID et le Client Secret OAuth Google Cloud.',
};

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  categories,
  defaultCategory,
  onClose,
  onBookLinked,
  onBooksAdded,
  onRefreshLibrary,
}) => {
  const [tab, setTab] = useState<'folder' | 'file' | 'account'>('folder');
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);

  // Onglet 1 : Dossier Google Drive (toute la bibliothèque)
  const [folderInput, setFolderInput] = useState<string>('');
  const [folderCategory, setFolderCategory] = useState<string>(
    defaultCategory || DEFAULT_CATEGORIES[0]
  );
  const [linkingFolder, setLinkingFolder] = useState<boolean>(false);
  const [linkedFolders, setLinkedFolders] = useState<LinkedDriveFolder[]>([]);
  const [syncingFolderId, setSyncingFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  // Onglet 2 : Fichier unique par lien / ID
  const [fileInput, setFileInput] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [category, setCategory] = useState<string>(defaultCategory || DEFAULT_CATEGORIES[0]);
  const [format, setFormat] = useState<'auto' | DocumentFormat>('auto');
  const [description, setDescription] = useState<string>('');
  const [linking, setLinking] = useState<boolean>(false);

  // Messages globaux
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Onglet 3 : Compte Google OAuth & explorateur de dossiers/fichiers
  const [showOAuthSetup, setShowOAuthSetup] = useState<boolean>(false);
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [savingOAuth, setSavingOAuth] = useState<boolean>(false);
  const [copiedUri, setCopiedUri] = useState<boolean>(false);

  const [remoteFolders, setRemoteFolders] = useState<RemoteDriveFolder[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<RemoteDriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [remoteSearch, setRemoteSearch] = useState<string>('');
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);

  const refreshStatusAndFolders = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [s, folders] = await Promise.all([getDriveStatus(), getDriveFolders()]);
      setStatus(s);
      setLinkedFolders(folders);
      if (!s.oauthConfigured) {
        setShowOAuthSetup(true);
      }
    } catch {
      // Ignorer
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchRemoteItems = useCallback(async (q: string = '') => {
    setLoadingFiles(true);
    setError(null);
    try {
      const res = await listRemoteDriveItems(q);
      setRemoteFolders(res.folders);
      setRemoteFiles(res.files);
    } catch (err: any) {
      setError(ERROR_MESSAGES[err?.message] || 'Impossible de récupérer vos éléments Google Drive.');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatusAndFolders();
  }, [refreshStatusAndFolders]);

  useEffect(() => {
    if (tab === 'account' && status?.connected) {
      void fetchRemoteItems(remoteSearch);
    }
  }, [tab, status?.connected, fetchRemoteItems]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'google-drive-connected') {
        void refreshStatusAndFolders();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshStatusAndFolders]);

  const handleLinkFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!folderInput.trim()) return;

    setLinkingFolder(true);
    try {
      const res = await linkDriveFolder({
        folderInput: folderInput.trim(),
        defaultCategory: folderCategory,
      });
      setLinkedFolders((prev) => {
        const filtered = prev.filter((f) => f.id !== res.folder.id);
        return [res.folder, ...filtered];
      });
      if (res.books.length > 0) {
        onBooksAdded?.(res.books);
      }
      await onRefreshLibrary?.();
      setSuccessMsg(
        res.addedCount > 0
          ? `Dossier « ${res.folder.name} » lié : ${res.addedCount} nouveau(x) livre(s) importé(s) (${res.totalInFolder} au total, 0 Mo utilisé sur le site).`
          : `Dossier « ${res.folder.name} » synchronisé (${res.totalInFolder} livre(s) déjà présents).`
      );
      setFolderInput('');
    } catch (err: any) {
      setError(
        ERROR_MESSAGES[err?.message] ?? 'Impossible de lier ce dossier Google Drive.'
      );
    } finally {
      setLinkingFolder(false);
    }
  };

  const handleSyncExistingFolder = async (folder: LinkedDriveFolder) => {
    setError(null);
    setSuccessMsg(null);
    setSyncingFolderId(folder.id);
    try {
      const res = await syncDriveFolder(folder.id);
      setLinkedFolders((prev) =>
        prev.map((f) => (f.id === res.folder.id ? res.folder : f))
      );
      if (res.books.length > 0) {
        onBooksAdded?.(res.books);
      }
      await onRefreshLibrary?.();
      setSuccessMsg(
        res.addedCount > 0
          ? `${res.addedCount} nouveau(x) livre(s) ajouté(s) depuis « ${res.folder.name} ».`
          : `« ${res.folder.name} » est à jour (${res.totalInFolder} livre(s)).`
      );
    } catch (err: any) {
      setError(
        ERROR_MESSAGES[err?.message] ?? 'Impossible de synchroniser ce dossier.'
      );
    } finally {
      setSyncingFolderId(null);
    }
  };

  const handleRemoveFolder = async (folder: LinkedDriveFolder) => {
    setError(null);
    setDeletingFolderId(folder.id);
    try {
      await deleteDriveFolder(folder.id);
      setLinkedFolders((prev) => prev.filter((f) => f.id !== folder.id));
      await onRefreshLibrary?.();
      setSuccessMsg(`Le dossier « ${folder.name} » a été délié.`);
    } catch {
      setError('Impossible de retirer ce dossier.');
    } finally {
      setDeletingFolderId(null);
    }
  };

  const handleLinkByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!fileInput.trim()) return;

    setLinking(true);
    try {
      const created = await linkDriveBook({
        fileInput: fileInput.trim(),
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        description: description.trim() || undefined,
        category,
        format: format === 'auto' ? undefined : format,
      });
      onBookLinked(created);
      setSuccessMsg(
        `« ${created.title} » a été lié à votre bibliothèque (0 o utilisé sur le site).`
      );
      setFileInput('');
      setTitle('');
      setAuthor('');
      setDescription('');
    } catch (err: any) {
      setError(ERROR_MESSAGES[err?.message] ?? 'Impossible de lier ce fichier Google Drive.');
    } finally {
      setLinking(false);
    }
  };

  const handleLinkRemoteFolder = async (folder: RemoteDriveFolder) => {
    setError(null);
    setSuccessMsg(null);
    setLinkingItemId(folder.id);
    try {
      const res = await linkDriveFolder({
        folderInput: folder.id,
        defaultCategory: folderCategory,
      });
      setLinkedFolders((prev) => [
        res.folder,
        ...prev.filter((f) => f.id !== res.folder.id),
      ]);
      if (res.books.length > 0) {
        onBooksAdded?.(res.books);
      }
      await onRefreshLibrary?.();
      setSuccessMsg(
        `Dossier « ${res.folder.name} » lié : ${res.addedCount} livre(s) ajouté(s) (${res.totalInFolder} au total).`
      );
    } catch (err: any) {
      setError(ERROR_MESSAGES[err?.message] ?? 'Impossible de lier ce dossier.');
    } finally {
      setLinkingItemId(null);
    }
  };

  const handleLinkRemoteFile = async (f: RemoteDriveFile) => {
    setError(null);
    setSuccessMsg(null);
    setLinkingItemId(f.id);
    try {
      const created = await linkDriveBook({
        fileInput: f.id,
        title: f.name.replace(/\.(epub|pdf|md|markdown|txt)$/i, ''),
        category,
        format: f.format,
      });
      onBookLinked(created);
      setSuccessMsg(`« ${created.title} » a été lié à votre bibliothèque.`);
    } catch (err: any) {
      setError(ERROR_MESSAGES[err?.message] ?? 'Impossible de lier ce fichier.');
    } finally {
      setLinkingItemId(null);
    }
  };

  const handleSaveOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavingOAuth(true);
    try {
      await saveDriveOAuthConfig(clientId.trim(), clientSecret.trim());
      setClientSecret('');
      setShowOAuthSetup(false);
      await refreshStatusAndFolders();
    } catch {
      setError('Identifiants OAuth invalides.');
    } finally {
      setSavingOAuth(false);
    }
  };

  const handleConnectGoogle = async () => {
    setError(null);
    try {
      const url = await getDriveConnectUrl();
      window.open(url, 'google_drive_oauth', 'width=540,height=680');
    } catch (err: any) {
      setError(ERROR_MESSAGES[err?.message] ?? 'Impossible de démarrer la connexion Google.');
    }
  };

  const handleDisconnectGoogle = async () => {
    await disconnectDrive();
    setRemoteFolders([]);
    setRemoteFiles([]);
    await refreshStatusAndFolders();
  };

  const copyRedirectUri = () => {
    if (!status?.redirectUri) return;
    void navigator.clipboard.writeText(status.redirectUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lier un dossier ou livre depuis Google Drive"
        onClick={(e) => e.stopPropagation()}
        className="modal"
        style={{ width: 'min(620px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        {/* En-tête Folio */}
        <div className="modal-header" style={{ padding: '24px 26px 14px' }}>
          <div>
            <p className="section-kicker">Cloud import</p>
            <h3>Link Google Drive</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="modal-copy" style={{ padding: '0 26px', margin: '0 0 14px' }}>
          Importez tout un dossier ou un fichier depuis Google Drive · 0 Mo stocké localement.
        </p>

        {/* Navigation par onglets */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--line)',
            borderTop: '1px solid var(--line)',
            padding: '0 26px',
            background: 'var(--cream)',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setTab('folder');
              setError(null);
            }}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'folder'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            Dossier (Toute la bibliothèque)
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('file');
              setError(null);
            }}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'file'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            Fichier unique
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('account');
              setError(null);
            }}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === 'account'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <span>Compte Google (OAuth)</span>
            {status?.connected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Connecté" />
            )}
          </button>
        </div>

        {/* Corps */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="px-3.5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="px-3.5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
              <span>{successMsg}</span>
              <button
                type="button"
                onClick={onClose}
                className="underline font-medium shrink-0 cursor-pointer"
              >
                Voir mes livres
              </button>
            </div>
          )}

          {tab === 'folder' ? (
            <div className="space-y-5">
              <form onSubmit={handleLinkFolderSubmit} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed flex items-start gap-2.5">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                  <div className="space-y-1">
                    <p>
                      Collez le lien d’un <strong>dossier Google Drive</strong> contenant vos livres
                      (<code>.epub</code>, <code>.pdf</code>, <code>.md</code>, <code>.txt</code>).
                      Tous les livres du dossier seront ajoutés d’un coup sans occuper d’espace sur
                      le site.
                    </p>
                    <p className="text-zinc-500">
                      Astuce : si votre dossier contient des sous-dossiers, leurs noms deviendront
                      automatiquement les catégories de vos livres.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    Lien ou ID du dossier Google Drive *
                  </label>
                  <div className="relative">
                    <FolderPlus className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={folderInput}
                      onChange={(e) => setFolderInput(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp...?usp=sharing"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1">
                      Catégorie par défaut (si pas de sous-dossier)
                    </label>
                    <select
                      value={folderCategory}
                      onChange={(e) => setFolderCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={linkingFolder || !folderInput.trim()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-medium cursor-pointer shrink-0"
                  >
                    {linkingFolder ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyse du dossier...</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Importer tout le dossier</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Liste des dossiers déjà liés avec bouton Synchroniser */}
              {linkedFolders.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Dossiers Google Drive liés à votre compte ({linkedFolders.length})
                    </h3>
                    <span className="text-[11px] text-zinc-500">
                      Cliquez sur Synchroniser si vous ajoutez des livres sur Drive
                    </span>
                  </div>

                  <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                    {linkedFolders.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs bg-zinc-50/40 dark:bg-zinc-950/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Folder className="w-4 h-4 text-zinc-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{f.name}</p>
                            <p className="text-[11px] text-zinc-500">
                              {f.booksCount} livre(s) · Catégorie : {f.defaultCategory} · Sync{' '}
                              {formatDateShort(f.lastSyncedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={syncingFolderId === f.id}
                            onClick={() => void handleSyncExistingFolder(f)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium cursor-pointer disabled:opacity-50"
                            title="Rechercher les nouveaux livres ajoutés dans ce dossier"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${syncingFolderId === f.id ? 'animate-spin' : ''}`}
                            />
                            <span>Synchroniser</span>
                          </button>
                          <button
                            type="button"
                            disabled={deletingFolderId === f.id}
                            onClick={() => void handleRemoveFolder(f)}
                            className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-500/40 cursor-pointer"
                            title="Délier ce dossier et retirer ses livres"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : tab === 'file' ? (
            <form onSubmit={handleLinkByUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Lien ou ID d’un fichier Google Drive *
                </label>
                <div className="relative">
                  <Link2 className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fileInput}
                    onChange={(e) => setFileInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/1BxiMVs0XRA5.../view"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Titre (optionnel, détecté auto.)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. Pensées pour moi-même"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Auteur (optionnel)</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Ex. Marc Aurèle"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Format du fichier</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                  >
                    <option value="auto">Détection automatique</option>
                    <option value="epub">ePub (.epub)</option>
                    <option value="pdf">PDF (.pdf)</option>
                    <option value="md">Markdown (.md)</option>
                    <option value="txt">Texte (.txt)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Description (optionnel)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Note ou résumé court..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={linking || !fileInput.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-medium cursor-pointer"
                >
                  {linking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Vérification & liaison...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Lier ce livre</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {loadingStatus ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Chargement du statut Google Drive...</span>
                </div>
              ) : (
                <>
                  {/* Barre d'état du compte Google */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50">
                    <div className="text-xs">
                      {status?.connected ? (
                        <div>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            Connecté à Google Drive
                          </span>
                          {status.googleEmail && (
                            <span className="text-zinc-500 ml-1.5">({status.googleEmail})</span>
                          )}
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Vos dossiers et fichiers restent privés sur votre Google Drive.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="font-medium">Compte Google non relié</span>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Reliez votre compte Google pour importer vos dossiers privés sans partage par lien.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowOAuthSetup((v) => !v)}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        title="Paramètres OAuth Google Cloud"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>

                      {status?.connected ? (
                        <button
                          type="button"
                          onClick={handleDisconnectGoogle}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <Unplug className="w-3.5 h-3.5" />
                          <span>Déconnecter</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectGoogle}
                          disabled={!status?.oauthConfigured}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 disabled:opacity-40 text-xs font-medium cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Connecter Google Drive</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Configuration OAuth Google Cloud */}
                  {showOAuthSetup && (
                    <form
                      onSubmit={handleSaveOAuth}
                      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40 space-y-3"
                    >
                      <div className="text-xs font-medium">
                        Identifiants OAuth 2.0 Google Cloud (enregistrés sur votre compte)
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Dans Google Cloud Console → <em>APIs & Services → Credentials</em>, créez un{' '}
                        <strong>OAuth client ID (Web application)</strong> avec cette URL de
                        redirection :
                      </p>
                      {status?.redirectUri && (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-2.5 py-1.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono break-all">
                            {status.redirectUri}
                          </code>
                          <button
                            type="button"
                            onClick={copyRedirectUri}
                            className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs inline-flex items-center gap-1 shrink-0"
                          >
                            {copiedUri ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          required
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="Google Client ID (...apps.googleusercontent.com)"
                          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        />
                        <input
                          type="password"
                          required
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="Google Client Secret (GOCSPX-...)"
                          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={savingOAuth}
                          className="px-3.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-medium"
                        >
                          {savingOAuth ? 'Enregistrement...' : 'Enregistrer les identifiants'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Liste des dossiers & fichiers du Google Drive connecté */}
                  {status?.connected && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={remoteSearch}
                            onChange={(e) => setRemoteSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void fetchRemoteItems(remoteSearch);
                              }
                            }}
                            placeholder="Rechercher un dossier ou un livre dans mon Google Drive..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void fetchRemoteItems(remoteSearch)}
                          className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          title="Actualiser"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`}
                          />
                        </button>
                      </div>

                      {loadingFiles ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          Recherche des dossiers et livres dans votre Google Drive...
                        </div>
                      ) : remoteFolders.length === 0 && remoteFiles.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                          Aucun dossier ni fichier .epub, .pdf, .md ou .txt trouvé.
                        </div>
                      ) : (
                        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-64 overflow-y-auto">
                          {remoteFolders.map((folder) => (
                            <li
                              key={folder.id}
                              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Folder className="w-4 h-4 text-zinc-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{folder.name}</p>
                                  <p className="text-[11px] text-zinc-500">Dossier Google Drive</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={linkingItemId === folder.id}
                                onClick={() => void handleLinkRemoteFolder(folder)}
                                className="px-3 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-medium shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                {linkingItemId === folder.id ? 'Import...' : 'Lier tout le dossier'}
                              </button>
                            </li>
                          ))}
                          {remoteFiles.map((f) => (
                            <li
                              key={f.id}
                              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">{f.name}</p>
                                <p className="text-[11px] text-zinc-500 uppercase font-mono">
                                  {f.format} · {formatBytes(f.size)}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={linkingItemId === f.id}
                                onClick={() => void handleLinkRemoteFile(f)}
                                className="px-3 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                {linkingItemId === f.id ? 'Liaison...' : 'Lier'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
