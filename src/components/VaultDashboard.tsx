import React, { useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Edit3,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  ImagePlus,
  LayoutGrid,
  List,
  Lock,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  DocumentFormat,
  VaultAuthConfig,
  VaultDocumentMeta,
} from '../types/vault';
import { resizeImageBlobToDataUrl } from '../utils/metadataCleaner';
import { GoogleDriveModal } from './GoogleDriveModal';

interface VaultDashboardProps {
  authConfig: VaultAuthConfig;
  documents: VaultDocumentMeta[];
  categories: string[];
  isDark: boolean;
  isUploading: boolean;
  onToggleTheme: () => void;
  onLockVault: () => void;
  onUploadFiles: (
    files: File[],
    defaultCategory?: string
  ) => Promise<{ added: number; rejected: string[] }>;
  onOpenDocument: (doc: VaultDocumentMeta) => Promise<void>;
  onToggleFavorite: (id: string) => Promise<void>;
  onUpdateDocumentMeta: (
    id: string,
    updates: {
      title?: string;
      category?: string;
      description?: string;
      coverDataUrl?: string | null;
    }
  ) => Promise<void>;
  onAddCategory: (categoryName: string) => Promise<void>;
  onDeleteCategory: (categoryName: string) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onDownloadDecrypted: (doc: VaultDocumentMeta) => Promise<void>;
  onLoadSampleBooks: () => Promise<void>;
  onDriveBookLinked?: (doc: VaultDocumentMeta) => void;
  onRefreshDriveLibrary?: () => Promise<void>;
}

const COVER_PALETTES = [
  'from-stone-800 via-zinc-800 to-zinc-950 text-stone-100 border-stone-700/60',
  'from-slate-800 via-slate-900 to-zinc-950 text-slate-100 border-slate-700/60',
  'from-amber-950 via-stone-900 to-zinc-950 text-amber-50 border-amber-800/50',
  'from-emerald-950 via-teal-950 to-zinc-950 text-emerald-50 border-emerald-800/50',
  'from-indigo-950 via-slate-900 to-zinc-950 text-indigo-50 border-indigo-800/50',
  'from-rose-950 via-stone-900 to-zinc-950 text-rose-50 border-rose-800/50',
];

function getCoverPalette(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
}

const BookCover: React.FC<{
  doc: VaultDocumentMeta;
  size?: 'md' | 'sm';
  onClick?: () => void;
}> = ({ doc, size = 'md', onClick }) => {
  const palette = getCoverPalette(doc.title || doc.id);
  const dimensions =
    size === 'sm'
      ? 'w-10 h-14 rounded-md'
      : 'w-20 sm:w-24 h-28 sm:h-34 rounded-lg';

  if (doc.coverDataUrl) {
    return (
      <div
        onClick={onClick}
        className={`relative ${dimensions} shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xs bg-zinc-100 dark:bg-zinc-900 ${
          onClick ? 'cursor-pointer group/cover' : ''
        }`}
      >
        <img
          src={doc.coverDataUrl}
          alt={`Couverture de ${doc.title}`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-r from-black/25 to-transparent pointer-events-none" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative ${dimensions} shrink-0 overflow-hidden border bg-gradient-to-br ${palette} shadow-xs flex flex-col justify-between p-2 select-none ${
        onClick ? 'cursor-pointer hover:brightness-110 transition-all' : ''
      }`}
    >
      {/* Reliure / dos de livre */}
      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/35 via-white/10 to-transparent pointer-events-none" />

      {size === 'md' ? (
        <>
          <div className="pl-1.5 flex items-center justify-between gap-1">
            <span className="text-[8px] font-mono uppercase tracking-wider opacity-75 truncate">
              {doc.category.split(' / ').pop()}
            </span>
          </div>
          <div className="pl-1.5 my-auto">
            <p className="text-[11px] font-serif font-semibold leading-snug line-clamp-3 break-words">
              {doc.title}
            </p>
            {doc.author && (
              <p className="text-[9px] opacity-75 truncate mt-1">{doc.author}</p>
            )}
          </div>
          <div className="pl-1.5 flex items-center justify-between">
            <span className="text-[8px] font-mono uppercase px-1 py-0.2 rounded bg-white/10">
              {doc.format}
            </span>
          </div>
        </>
      ) : (
        <div className="pl-1 my-auto text-center">
          <p className="text-[8px] font-serif font-semibold leading-tight line-clamp-2">
            {doc.title}
          </p>
        </div>
      )}
    </div>
  );
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} Ko`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} Mo`;
}

export function formatDateShort(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  authConfig,
  documents,
  categories,
  isDark,
  isUploading,
  onToggleTheme,
  onLockVault,
  onUploadFiles,
  onOpenDocument,
  onToggleFavorite,
  onUpdateDocumentMeta,
  onAddCategory,
  onDeleteCategory,
  onDeleteDocument,
  onDownloadDecrypted,
  onLoadSampleBooks,
  onDriveBookLinked,
  onRefreshDriveLibrary,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [showDriveModal, setShowDriveModal] = useState<boolean>(false);

  // Filtres principaux : Toutes les lectures / Favoris / En cours / Terminés
  const [navScope, setNavScope] = useState<'all' | 'favorites' | 'reading' | 'completed'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | DocumentFormat>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'addedAt' | 'lastOpened' | 'progress' | 'title'>('addedAt');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Création libre de catégorie ou sous-catégorie
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [showNewSubCategoryInput, setShowNewSubCategoryInput] = useState<boolean>(false);
  const [newSubCategoryName, setNewSubCategoryName] = useState<string>('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);

  // Upload
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Édition d'un document (Titre, Catégorie, Description, Couverture)
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editCustomCategory, setEditCustomCategory] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editCoverDataUrl, setEditCoverDataUrl] = useState<string | null | undefined>(
    undefined
  );

  // Suppression avec confirmation inline
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const allAvailableCategories = useMemo(() => {
    const base = categories.length > 0 ? categories : [...DEFAULT_CATEGORIES];
    const set = new Set<string>(base);
    documents.forEach((d) => {
      if (d.category) {
        set.add(d.category);
        if (d.category.includes(' / ')) {
          set.add(d.category.split(' / ')[0]);
        }
      }
    });
    return Array.from(set);
  }, [categories, documents]);

  // Catégories principales (racines) et sous-catégories associées
  const { rootCategories, subCategoriesByRoot } = useMemo(() => {
    const roots = new Set<string>();
    const subsMap = new Map<string, string[]>();

    allAvailableCategories.forEach((cat) => {
      const parts = cat.split(' / ').map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return;
      const root = parts[0];
      roots.add(root);
      if (parts.length > 1) {
        const fullSub = `${root} / ${parts.slice(1).join(' / ')}`;
        const existing = subsMap.get(root) || [];
        if (!existing.includes(fullSub)) {
          existing.push(fullSub);
          subsMap.set(root, existing);
        }
      }
    });

    return {
      rootCategories: Array.from(roots),
      subCategoriesByRoot: subsMap,
    };
  }, [allAvailableCategories]);

  const activeRootCategory = useMemo(() => {
    if (selectedCategory === 'all') return null;
    return selectedCategory.split(' / ')[0];
  }, [selectedCategory]);

  const favoritesCount = useMemo(
    () => documents.filter((d) => d.isFavorite).length,
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents
      .filter((doc) => {
        if (navScope === 'favorites' && !doc.isFavorite) return false;
        if (
          navScope === 'reading' &&
          (doc.progress.percentage <= 0 || doc.progress.percentage >= 100)
        ) {
          return false;
        }
        if (navScope === 'completed' && doc.progress.percentage < 100) return false;

        if (selectedCategory !== 'all') {
          const isExact = doc.category === selectedCategory;
          const isChildOfRoot =
            !selectedCategory.includes(' / ') &&
            doc.category.startsWith(`${selectedCategory} / `);
          if (!isExact && !isChildOfRoot) {
            return false;
          }
        }
        if (formatFilter !== 'all' && doc.format !== formatFilter) {
          return false;
        }
        if (!q) return true;
        return (
          doc.title.toLowerCase().includes(q) ||
          (doc.author && doc.author.toLowerCase().includes(q)) ||
          doc.description.toLowerCase().includes(q) ||
          doc.category.toLowerCase().includes(q) ||
          doc.format.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'fr');
        if (sortBy === 'progress')
          return (b.progress?.percentage || 0) - (a.progress?.percentage || 0);
        if (sortBy === 'lastOpened')
          return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
        return b.addedAt - a.addedAt;
      });
  }, [documents, navScope, selectedCategory, formatFilter, searchQuery, sortBy]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadFeedback(null);
    const filesArray = Array.from(fileList);
    const defaultCat =
      selectedCategory !== 'all' ? selectedCategory : DEFAULT_CATEGORIES[0];

    try {
      const result = await onUploadFiles(filesArray, defaultCat);
      if (result.rejected.length > 0 && result.added === 0) {
        setUploadFeedback({
          type: 'error',
          message: `Format non pris en charge (${result.rejected.join(', ')}). Formats acceptés : .txt, .md, .pdf, .epub.`,
        });
      } else if (result.rejected.length > 0) {
        setUploadFeedback({
          type: 'success',
          message: `${result.added} ouvrage(s) ajouté(s). Ignoré(s) : ${result.rejected.join(', ')}.`,
        });
      } else {
        setUploadFeedback({
          type: 'success',
          message: `${result.added} ouvrage(s) ajouté(s) à votre bibliothèque.`,
        });
      }
    } catch (err: any) {
      setUploadFeedback({
        type: 'error',
        message: err?.message || 'Impossible d’importer ce fichier.',
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    await handleFilesSelected(e.dataTransfer.files);
  };

  const startEditingDoc = (doc: VaultDocumentMeta) => {
    setEditingDocId(doc.id);
    setEditTitle(doc.title);
    setEditCategory(doc.category || DEFAULT_CATEGORIES[0]);
    setEditCustomCategory('');
    setEditDescription(
      doc.description === 'Aucune description' ? '' : doc.description
    );
    setEditCoverDataUrl(doc.coverDataUrl);
    setDeletingId(null);
  };

  const handleEditCoverFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImageBlobToDataUrl(file);
    if (dataUrl) {
      setEditCoverDataUrl(dataUrl);
    }
    e.target.value = '';
  };

  const submitDocEdit = async (id: string) => {
    const finalCategory =
      editCategory === '__custom__' && editCustomCategory.trim()
        ? editCustomCategory.trim()
        : editCategory;

    if (editCategory === '__custom__' && editCustomCategory.trim()) {
      await onAddCategory(editCustomCategory.trim());
    }

    await onUpdateDocumentMeta(id, {
      title: editTitle.trim() || undefined,
      category: finalCategory,
      description: editDescription.trim(),
      coverDataUrl: editCoverDataUrl,
    });
    setEditingDocId(null);
  };

  const handleCreateNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    await onAddCategory(trimmed);
    setSelectedCategory(trimmed);
    setNewCategoryName('');
    setShowNewCategoryInput(false);
  };

  const handleCreateNewSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRootCategory) return;
    const trimmed = newSubCategoryName.trim().replace(/^\/+|\/+$/g, '').trim();
    if (!trimmed) return;
    const fullCat = `${activeRootCategory} / ${trimmed}`;
    await onAddCategory(fullCat);
    setSelectedCategory(fullCat);
    setNewSubCategoryName('');
    setShowNewSubCategoryInput(false);
  };

  const handleConfirmDeleteCategory = async (catToDelete: string) => {
    await onDeleteCategory(catToDelete);
    if (
      selectedCategory === catToDelete ||
      selectedCategory.startsWith(`${catToDelete} / `)
    ) {
      if (catToDelete.includes(' / ')) {
        setSelectedCategory(catToDelete.split(' / ')[0]);
      } else {
        setSelectedCategory('all');
      }
    }
    setConfirmDeleteCategory(null);
  };

  const handleOpen = async (doc: VaultDocumentMeta) => {
    setOpeningId(doc.id);
    try {
      await onOpenDocument(doc);
    } finally {
      setOpeningId(null);
    }
  };

  const getFormatIcon = (format: DocumentFormat) => {
    switch (format) {
      case 'pdf':
        return <FileSpreadsheet className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />;
      case 'epub':
        return <BookOpen className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />;
      case 'md':
        return <FileCode className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />;
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Barre de navigation supérieure (Contrat 3 zones : Titre — Filtres de navigation — Action Verrouiller) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 sm:px-10 py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
        {/* Zone 1 : Titre sobre */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setNavScope('all');
            setSelectedCategory('all');
          }}
          className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0"
        >
          Bibliothèque
        </a>

        {/* Zone 2 : Navigation principale avec filtre rapide "Favoris" */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => setNavScope('all')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              navScope === 'all'
                ? 'text-zinc-900 dark:text-zinc-100 underline underline-offset-8'
                : 'hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Mes lectures ({documents.length})
          </button>

          <button
            type="button"
            onClick={() => setNavScope('favorites')}
            className={`inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              navScope === 'favorites'
                ? 'text-zinc-900 dark:text-zinc-100 underline underline-offset-8'
                : 'hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Star
              className="w-3.5 h-3.5 text-amber-500"
              fill={navScope === 'favorites' ? 'currentColor' : 'none'}
            />
            <span>Favoris ({favoritesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setNavScope('reading')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              navScope === 'reading'
                ? 'text-zinc-900 dark:text-zinc-100 underline underline-offset-8'
                : 'hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            En cours
          </button>

          <button
            type="button"
            onClick={() => setNavScope('completed')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              navScope === 'completed'
                ? 'text-zinc-900 dark:text-zinc-100 underline underline-offset-8'
                : 'hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Terminés
          </button>
        </nav>

        {/* Zone 3 : Action primaire */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onLockVault}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Verrouiller la bibliothèque"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Verrouiller</span>
          </button>
        </div>
      </header>

      {/* Contenu principal */}
      <main id="top" className="flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 py-8 space-y-8">
        {/* En-tête de section & Actions secondaires */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              Collection de {authConfig.username}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {navScope === 'favorites'
                ? 'Ouvrages favoris'
                : navScope === 'reading'
                ? 'Lectures en cours'
                : navScope === 'completed'
                ? 'Lectures terminées'
                : 'Mes lectures'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Clair</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Sombre</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowDriveModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Lier Google Drive</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Ajouter un livre</span>
            </button>
          </div>
        </section>

        {/* Zone Drag & Drop discrète */}
        <section>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border border-dashed px-6 py-4 transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isDragging
                ? 'border-zinc-500 bg-zinc-200/50 dark:bg-zinc-900'
                : 'border-zinc-300 dark:border-zinc-800/90 bg-white/60 dark:bg-zinc-900/30 hover:border-zinc-400 dark:hover:border-zinc-700'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.pdf,.epub"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
            />

            <div className="flex items-center gap-3.5 text-center sm:text-left">
              <FolderPlus className="w-5 h-5 text-zinc-400 shrink-0 hidden sm:block" />
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Glissez-déposez vos fichiers ici ou cliquez pour importer
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-0.5">
                  Formats supportés : .epub, .pdf, .md, .txt
                </p>
              </div>
            </div>

            {isUploading && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Importation en cours...
              </span>
            )}
          </div>

          {uploadFeedback && (
            <div className="mt-3 px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center justify-between gap-4">
              <span className="text-zinc-700 dark:text-zinc-300">
                {uploadFeedback.message}
              </span>
              <button
                type="button"
                onClick={() => setUploadFeedback(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Rangée de navigation par Catégories &Sous-catégories */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setConfirmDeleteCategory(null);
                  setShowNewSubCategoryInput(false);
                  if (navScope === 'favorites') setNavScope('all');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === 'all' && navScope !== 'favorites'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Toutes les catégories
              </button>

              <button
                type="button"
                onClick={() =>
                  setNavScope((s) => (s === 'favorites' ? 'all' : 'favorites'))
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  navScope === 'favorites'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Star
                  className="w-3 h-3 text-amber-500"
                  fill={navScope === 'favorites' ? 'currentColor' : 'none'}
                />
                <span>Favoris</span>
              </button>

              {rootCategories.map((rootCat) => {
                const isSelectedRoot = activeRootCategory === rootCat;
                const subCount = (subCategoriesByRoot.get(rootCat) || []).length;
                const canDeleteRoot = rootCategories.length > 1;

                return (
                  <div
                    key={rootCat}
                    className={`inline-flex items-center rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelectedRoot
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(rootCat);
                        setConfirmDeleteCategory(null);
                        setShowNewSubCategoryInput(false);
                        if (navScope === 'favorites') setNavScope('all');
                      }}
                      className="pl-3 pr-2 py-1.5 cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>{rootCat}</span>
                      {subCount > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isSelectedRoot
                              ? 'bg-white/20 dark:bg-black/20'
                              : 'bg-zinc-200/80 dark:bg-zinc-800'
                          }`}
                        >
                          {subCount}
                        </span>
                      )}
                    </button>

                    {canDeleteRoot && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteCategory(
                            confirmDeleteCategory === rootCat ? null : rootCat
                          );
                        }}
                        title={`Supprimer la catégorie "${rootCat}"`}
                        className={`pr-2 pl-0.5 py-1.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer ${
                          isSelectedRoot
                            ? 'hover:text-red-300 dark:hover:text-red-600'
                            : 'hover:text-red-500'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {!showNewCategoryInput ? (
                <button
                  type="button"
                  onClick={() => setShowNewCategoryInput(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Créer une catégorie ou sous-catégorie (ex: Romans / SF)"
                >
                  <Plus className="w-3 h-3" />
                  <span>Catégorie</span>
                </button>
              ) : (
                <form
                  onSubmit={handleCreateNewCategory}
                  className="inline-flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Ex: Romans ou Romans / SF..."
                    autoFocus
                    className="px-2.5 py-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                    className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Barre de sous-catégories lorsqu'une catégorie principale est sélectionnée */}
          {activeRootCategory && (
            <div className="flex flex-wrap items-center gap-1.5 pl-2 pt-1 border-l-2 border-zinc-300 dark:border-zinc-800">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mr-1">
                <span>{activeRootCategory}</span>
                <ChevronRight className="w-3 h-3" />
              </span>

              <button
                type="button"
                onClick={() => setSelectedCategory(activeRootCategory)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  selectedCategory === activeRootCategory
                    ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Tout ({activeRootCategory})
              </button>

              {(subCategoriesByRoot.get(activeRootCategory) || []).map((fullSub) => {
                const subLabel = fullSub.split(' / ').slice(1).join(' / ');
                const isSubSelected = selectedCategory === fullSub;

                return (
                  <div
                    key={fullSub}
                    className={`inline-flex items-center rounded-md text-xs font-medium transition-colors ${
                      isSubSelected
                        ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(fullSub);
                        setConfirmDeleteCategory(null);
                      }}
                      className="pl-2.5 pr-1.5 py-1 cursor-pointer"
                    >
                      {subLabel}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteCategory(
                          confirmDeleteCategory === fullSub ? null : fullSub
                        );
                      }}
                      title={`Supprimer la sous-catégorie "${subLabel}"`}
                      className="pr-2 pl-0.5 py-1 opacity-60 hover:opacity-100 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {!showNewSubCategoryInput ? (
                <button
                  type="button"
                  onClick={() => setShowNewSubCategoryInput(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Sous-catégorie</span>
                </button>
              ) : (
                <form
                  onSubmit={handleCreateNewSubCategory}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newSubCategoryName}
                    onChange={(e) => setNewSubCategoryName(e.target.value)}
                    placeholder={`Sous-catégorie de ${activeRootCategory}...`}
                    autoFocus
                    className="px-2 py-0.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewSubCategoryInput(false);
                      setNewSubCategoryName('');
                    }}
                    className="p-1 rounded border border-zinc-300 dark:border-zinc-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Confirmation inline de suppression de catégorie ou sous-catégorie */}
          {confirmDeleteCategory && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs">
              <span className="text-red-600 dark:text-red-300">
                Supprimer la {confirmDeleteCategory.includes(' / ') ? 'sous-catégorie' : 'catégorie'}{' '}
                <strong>« {confirmDeleteCategory} »</strong> ? Les ouvrages associés seront conservés et déplacés automatiquement.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteCategory(confirmDeleteCategory)}
                  className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium cursor-pointer"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCategory(null)}
                  className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Barre de recherche, Filtre par format, Tri et Vue Grille/Liste */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un titre, un auteur, une description..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filtre par format */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 'epub', label: 'ePub' },
                    { id: 'pdf', label: 'PDF' },
                    { id: 'md', label: 'MD' },
                    { id: 'txt', label: 'TXT' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFormatFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      formatFilter === tab.id
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tri */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Trier les ouvrages"
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none"
              >
                <option value="addedAt">Ajout récent</option>
                <option value="lastOpened">Lecture récente</option>
                <option value="progress">Progression</option>
                <option value="title">Ordre alphabétique</option>
              </select>

              {/* Grille / Liste */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                  title="Grille"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                  title="Liste"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Liste ou Grille des ouvrages */}
        <section>
          {filteredDocuments.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-12 text-center max-w-xl mx-auto my-4 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {documents.length === 0
                    ? 'Aucun ouvrage dans votre bibliothèque'
                    : 'Aucun résultat pour cette sélection'}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {documents.length === 0
                    ? 'Importez vos fichiers (.epub, .pdf, .md, .txt) ou chargez les quatre ouvrages d’exemple.'
                    : 'Modifiez vos filtres de catégorie ou votre recherche.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {documents.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-medium"
                    >
                      Importer un fichier
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDriveModal(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-800 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Lier depuis Google Drive</span>
                    </button>
                    <button
                      type="button"
                      onClick={onLoadSampleBooks}
                      className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-800 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      Charger les ouvrages d’exemple
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNavScope('all');
                      setSelectedCategory('all');
                      setFormatFilter('all');
                      setSearchQuery('');
                    }}
                    className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 text-xs font-medium"
                  >
                    Tout afficher
                  </button>
                )}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => {
                const isEditing = editingDocId === doc.id;
                const isDeleting = deletingId === doc.id;
                const isOpening = openingId === doc.id;
                const pct = doc.progress?.percentage || 0;

                return (
                  <div
                    key={doc.id}
                    className="group flex flex-col justify-between p-6 rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                  >
                    <div>
                      {/* En-tête de carte : Métadonnées sobres non-encapsulées + Étoile Favori */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
                          {getFormatIcon(doc.format)}
                          <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
                            {doc.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono uppercase text-[11px]">
                            {doc.format}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[11px]">
                            {doc.driveFileId
                              ? `${doc.size > 0 ? `${formatBytes(doc.size)} · ` : ''}Drive (0 o local)`
                              : formatBytes(doc.size)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleFavorite(doc.id)}
                          className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
                            doc.isFavorite
                              ? 'text-amber-500'
                              : 'text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-400'
                          }`}
                          title={
                            doc.isFavorite
                              ? 'Retirer des favoris'
                              : 'Ajouter aux favoris'
                          }
                        >
                          <Star
                            className="w-4 h-4"
                            fill={doc.isFavorite ? 'currentColor' : 'none'}
                          />
                        </button>
                      </div>

                      {/* Formulaire d'édition (Titre, Catégorie, Description, Couverture) ou Affichage avec Couverture */}
                      {isEditing ? (
                        <div className="space-y-3 my-2 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70">
                          <div>
                            <label className="block text-[11px] text-zinc-500 mb-1">
                              Image de couverture
                            </label>
                            <div className="flex items-center gap-3">
                              <BookCover
                                doc={{
                                  ...doc,
                                  title: editTitle || doc.title,
                                  category: editCategory || doc.category,
                                  coverDataUrl:
                                    editCoverDataUrl === null
                                      ? undefined
                                      : editCoverDataUrl ?? doc.coverDataUrl,
                                }}
                                size="sm"
                              />
                              <div className="flex flex-wrap items-center gap-1.5">
                                <input
                                  ref={coverInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleEditCoverFileSelected}
                                  className="hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => coverInputRef.current?.click()}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                                >
                                  <ImagePlus className="w-3.5 h-3.5" />
                                  <span>Choisir une image</span>
                                </button>
                                {(editCoverDataUrl ||
                                  (editCoverDataUrl === undefined && doc.coverDataUrl)) && (
                                  <button
                                    type="button"
                                    onClick={() => setEditCoverDataUrl(null)}
                                    className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-xs text-red-500 hover:bg-red-500/10 cursor-pointer"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] text-zinc-500 mb-1">
                              Titre
                            </label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs font-medium rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-zinc-500 mb-1">
                              Catégorie ou sous-catégorie
                            </label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none"
                            >
                              {allAvailableCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                              <option value="__custom__">
                                + Créer une catégorie / sous-catégorie...
                              </option>
                            </select>
                            {editCategory === '__custom__' && (
                              <input
                                type="text"
                                value={editCustomCategory}
                                onChange={(e) => setEditCustomCategory(e.target.value)}
                                placeholder="Ex: Romans / Science-Fiction"
                                className="mt-1.5 w-full px-2.5 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] text-zinc-500 mb-1">
                              Description (résumé concis)
                            </label>
                            <textarea
                              rows={2}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Aucune description"
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none resize-none"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => submitDocEdit(doc.id)}
                              className="px-3 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-medium cursor-pointer"
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDocId(null)}
                              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-xs cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-4 mb-4">
                          <BookCover
                            doc={doc}
                            size="md"
                            onClick={() => handleOpen(doc)}
                          />
                          <div className="min-w-0 flex-1">
                            <h3
                              onClick={() => handleOpen(doc)}
                              className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors cursor-pointer line-clamp-2 mb-1"
                            >
                              {doc.title}
                            </h3>

                            {doc.author && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 truncate">
                                {doc.author}
                              </p>
                            )}

                            {/* Description nettoyée (sans balises HTML, 150-200 caractères max) */}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3">
                              {doc.description}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3.5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                      {/* Progression et compteurs de signets/notes */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                          <div className="flex items-center gap-2 truncate">
                            <span>
                              {pct === 0
                                ? 'Non commencé'
                                : pct >= 100
                                ? 'Terminé'
                                : doc.progress.page
                                ? `Page ${doc.progress.page} / ${doc.progress.totalPages || '?'}`
                                : doc.progress.chapterLabel
                                ? doc.progress.chapterLabel
                                : 'En lecture'}
                            </span>

                            {(doc.bookmarksCount > 0 || doc.annotationsCount > 0) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-2">
                                  {doc.bookmarksCount > 0 && (
                                    <span
                                      className="inline-flex items-center gap-0.5 tabular-nums"
                                      title="Signets enregistrés"
                                    >
                                      <Bookmark className="w-3 h-3" />
                                      {doc.bookmarksCount}
                                    </span>
                                  )}
                                  {doc.annotationsCount > 0 && (
                                    <span
                                      className="inline-flex items-center gap-0.5 tabular-nums"
                                      title="Notes enregistrées"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      {doc.annotationsCount}
                                    </span>
                                  )}
                                </span>
                              </>
                            )}
                          </div>

                          <span className="font-mono tabular-nums font-medium text-zinc-700 dark:text-zinc-300 shrink-0">
                            {pct}%
                          </span>
                        </div>

                        <div className="w-full h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-zinc-700 dark:bg-zinc-300 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions de la carte */}
                      {isDeleting ? (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs">
                          <span className="text-red-500 dark:text-red-300">
                            Supprimer cet ouvrage ?
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteDocument(doc.id);
                                setDeletingId(null);
                              }}
                              className="px-2.5 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-500"
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpen(doc)}
                            disabled={isOpening}
                            className="flex-1 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              {isOpening
                                ? 'Ouverture...'
                                : pct > 0 && pct < 100
                                ? 'Reprendre'
                                : 'Lire'}
                            </span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditingDoc(doc)}
                              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              title="Modifier le titre, la catégorie ou la description"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadDecrypted(doc)}
                              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              title="Exporter le fichier"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingId(doc.id);
                                setEditingDocId(null);
                              }}
                              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-500/40 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vue en liste sobre */
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-900">
                      <th className="py-3 px-4 w-8"></th>
                      <th className="py-3 px-4 font-medium">Ouvrage</th>
                      <th className="py-3 px-4 font-medium">Catégorie</th>
                      <th className="py-3 px-4 font-medium">Format</th>
                      <th className="py-3 px-4 font-medium text-right">Progression</th>
                      <th className="py-3 px-4 font-medium text-right">Ajouté le</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                    {filteredDocuments.map((doc) => {
                      const pct = doc.progress?.percentage || 0;
                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-3 pl-4 pr-1">
                            <button
                              type="button"
                              onClick={() => onToggleFavorite(doc.id)}
                              className={`p-1 rounded transition-colors ${
                                doc.isFavorite
                                  ? 'text-amber-500'
                                  : 'text-zinc-300 dark:text-zinc-700 hover:text-zinc-500'
                              }`}
                            >
                              <Star
                                className="w-3.5 h-3.5"
                                fill={doc.isFavorite ? 'currentColor' : 'none'}
                              />
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleOpen(doc)}
                              className="text-left group cursor-pointer flex items-center gap-3"
                            >
                              <BookCover doc={doc} size="sm" />
                              <div>
                                <p className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:underline">
                                  {doc.title}
                                </p>
                                <p className="text-[11px] text-zinc-500 line-clamp-1 max-w-md">
                                  {doc.description}
                                </p>
                              </div>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                            {doc.category}
                          </td>
                          <td className="py-3 px-4 font-mono uppercase text-zinc-500">
                            {doc.format}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-right font-medium">
                            {pct}%
                          </td>
                          <td className="py-3 px-4 tabular-nums text-right text-zinc-500 whitespace-nowrap">
                            {formatDateShort(doc.addedAt)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpen(doc)}
                                className="px-2.5 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-medium"
                              >
                                {pct > 0 && pct < 100 ? 'Reprendre' : 'Lire'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewMode('grid');
                                  startEditingDoc(doc);
                                }}
                                className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                title="Modifier"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDownloadDecrypted(doc)}
                                className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                title="Exporter"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteDocument(doc.id)}
                                className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:text-red-500"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Pied de page minimaliste */}
      <footer className="mt-12 border-t border-zinc-200/80 dark:border-zinc-900 px-6 sm:px-10 py-6 text-xs text-zinc-500 dark:text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>Bibliothèque personnelle · {documents.length} ouvrage(s)</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onLoadSampleBooks}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            Importer les ouvrages d’exemple
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onLockVault}
            className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
          >
            Verrouiller
          </button>
        </div>
      </footer>
      {showDriveModal && (
        <GoogleDriveModal
          categories={allAvailableCategories}
          defaultCategory={
            selectedCategory !== 'all' ? selectedCategory : DEFAULT_CATEGORIES[0]
          }
          onClose={() => setShowDriveModal(false)}
          onBookLinked={(book) => {
            onDriveBookLinked?.(book);
          }}
          onRefreshLibrary={onRefreshDriveLibrary}
        />
      )}
    </div>
  );
};
