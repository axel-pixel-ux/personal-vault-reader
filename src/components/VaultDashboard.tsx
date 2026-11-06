import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CATEGORIES,
  DocumentFormat,
  VaultAuthConfig,
  VaultDocumentMeta,
} from '../types/vault';
import { resizeImageBlobToDataUrl } from '../utils/metadataCleaner';
import { FolioIcon } from './FolioIcon';
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
  onToggleRead: (id: string) => Promise<void>;
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
  onDeleteAllDocuments?: () => Promise<void>;
  onDownloadDecrypted: (doc: VaultDocumentMeta) => Promise<void>;
  onLoadSampleBooks: () => Promise<void>;
  onDriveBookLinked?: (doc: VaultDocumentMeta) => void;
  onRefreshDriveLibrary?: () => Promise<void>;
}

const FOLIO_COVER_STYLES = [
  'gatsby',
  'room',
  'stranger',
  'spring',
  'darkness',
  'meditations',
] as const;

function getFolioCoverStyle(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return FOLIO_COVER_STYLES[Math.abs(hash) % FOLIO_COVER_STYLES.length];
}

function getFolioCoverMark(title: string): string {
  const words = (title || 'Book')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 12).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((w) => w.slice(0, 12))
    .join('\n')
    .toUpperCase();
}

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
  onToggleRead,
  onUpdateDocumentMeta,
  onAddCategory,
  onDeleteCategory,
  onDeleteDocument,
  onDeleteAllDocuments,
  onDownloadDecrypted,
  onLoadSampleBooks,
  onDriveBookLinked,
  onRefreshDriveLibrary,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showDriveModal, setShowDriveModal] = useState<boolean>(false);

  // Filtres principaux : Toutes les lectures / Favoris / En cours / Terminés
  const [navScope, setNavScope] = useState<'all' | 'favorites' | 'reading' | 'completed'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | DocumentFormat>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'addedAt' | 'lastOpened' | 'progress' | 'title'>(() => {
    const v = localStorage.getItem('folio_default_sort');
    return v === 'lastOpened' || v === 'progress' || v === 'title' ? v : 'addedAt';
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    localStorage.getItem('folio_default_view') === 'list' ? 'list' : 'grid'
  );
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<boolean>(false);
  const [deleteAllText, setDeleteAllText] = useState<string>('');
  const [deletingAll, setDeletingAll] = useState<boolean>(false);

  // Création libre de catégorie ou sous-catégorie
  const [showNewCategoryModal, setShowNewCategoryModal] = useState<boolean>(false);
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState<boolean>(false);
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

  // Suppression avec confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Raccourci clavier ⌘K / Ctrl+K pour la recherche
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      const parts = cat
        .split(' / ')
        .map((p) => p.trim())
        .filter(Boolean);
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
        const isDocRead = Boolean(
          doc.progress?.isRead || doc.progress?.percentage >= 100
        );
        if (navScope === 'favorites' && !doc.isFavorite) return false;
        if (navScope === 'reading' && (isDocRead || doc.progress.percentage <= 0)) {
          return false;
        }
        if (navScope === 'completed' && !isDocRead) return false;

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

  const submitDocEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDocId) return;
    const finalCategory =
      editCategory === '__custom__' && editCustomCategory.trim()
        ? editCustomCategory.trim()
        : editCategory;

    if (editCategory === '__custom__' && editCustomCategory.trim()) {
      await onAddCategory(editCustomCategory.trim());
    }

    await onUpdateDocumentMeta(editingDocId, {
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
    setShowNewCategoryModal(false);
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

  const editingDoc = useMemo(
    () => documents.find((d) => d.id === editingDocId) || null,
    [documents, editingDocId]
  );

  const deletingDoc = useMemo(
    () => documents.find((d) => d.id === deletingId) || null,
    [documents, deletingId]
  );

  return (
    <div className={`app-shell ${isDark ? 'dark' : ''}`}>
      {/* Barre supérieure Folio */}
      <header className="topbar">
        <a
          className="brand"
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setNavScope('all');
            setSelectedCategory('all');
          }}
        >
          <span className="brand-mark">
            <FolioIcon name="book" size={20} />
          </span>
          Folio
        </a>

        <nav className="main-nav" aria-label="Library sections">
          <button
            type="button"
            className={navScope === 'all' ? 'active' : ''}
            onClick={() => setNavScope('all')}
          >
            My reads <span>{documents.length}</span>
          </button>
          <button
            type="button"
            className={navScope === 'favorites' ? 'active' : ''}
            onClick={() => setNavScope('favorites')}
          >
            <FolioIcon name="star" size={14} /> Favorites <span>{favoritesCount}</span>
          </button>
          <button
            type="button"
            className={navScope === 'reading' ? 'active' : ''}
            onClick={() => setNavScope('reading')}
          >
            In progress
          </button>
          <button
            type="button"
            className={navScope === 'completed' ? 'active' : ''}
            onClick={() => setNavScope('completed')}
          >
            Finished
          </button>
        </nav>

        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className={!isDark ? 'active' : ''}>
              <FolioIcon name="sun" size={14} />
            </span>
            <span className={isDark ? 'active' : ''}>
              <FolioIcon name="moon" size={14} />
            </span>
          </button>

          <button
            className="drive-button"
            type="button"
            onClick={() => setShowDriveModal(true)}
            title="Link Google Drive"
            aria-label="Link Google Drive"
          >
            <FolioIcon name="drive" size={16} />
            <span>Link Google Drive</span>
          </button>

          <button
            className="add-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Add book"
            aria-label="Add book"
          >
            <FolioIcon name="plus" size={17} />
            <span>Add book</span>
          </button>

          <button
            className="settings-button"
            type="button"
            onClick={() => setShowSettings(true)}
            title="Paramètres"
            aria-label="Paramètres"
          >
            <FolioIcon name="settings" size={16} />
          </button>

          <button
            className="lock-button"
            type="button"
            onClick={onLockVault}
            title="Verrouiller la bibliothèque"
            aria-label="Lock"
          >
            <FolioIcon name="lock" size={16} />
            <span>Lock</span>
          </button>
        </div>
      </header>

      <main id="top">
        {/* Hero éditorial Folio */}
        <section className="hero">
          <p className="eyebrow">
            <FolioIcon name="sparkle" size={14} />
            Your personal reading space
          </p>
          <h1>
            A quiet place for
            <br />
            <em>curious minds.</em>
          </h1>
          <p className="hero-copy">
            Keep your favorite books, essays, and reading notes in one calm, searchable collection.
          </p>

          <label className="search-box" aria-label="Search books">
            <FolioIcon name="search" size={18} />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by title, author, or category..."
            />
            <span>⌘ K</span>
          </label>
        </section>

        {/* Section Bibliothèque */}
        <section className="library" id="collection">
          <div className="library-heading">
            <div>
              <p className="section-kicker">{authConfig.username}’s collection</p>
              <h2>
                {navScope === 'favorites'
                  ? 'Favorite books'
                  : navScope === 'reading'
                  ? 'Currently reading'
                  : navScope === 'completed'
                  ? 'Finished books'
                  : 'My reads'}
              </h2>
            </div>
            <p className="library-count">
              {filteredDocuments.length}{' '}
              {filteredDocuments.length === 1 ? 'book' : 'books'} shown
            </p>
          </div>

          {/* Zone Drag & Drop */}
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.pdf,.epub"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
            />
            <span className="drop-icon">
              <FolioIcon name="upload" size={20} />
            </span>
            <div>
              <strong>
                {isUploading
                  ? 'Importing files...'
                  : 'Drag and drop your files here, or click to import'}
              </strong>
              <p>Supported formats: .epub, .pdf, .md, .txt</p>
            </div>
          </div>

          {uploadFeedback && (
            <div
              style={{
                marginBottom: '18px',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--cream)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.86rem',
              }}
            >
              <span>{uploadFeedback.message}</span>
              <button
                type="button"
                className="icon-close"
                style={{ width: '28px', height: '28px' }}
                onClick={() => setUploadFeedback(null)}
              >
                <FolioIcon name="close" size={14} />
              </button>
            </div>
          )}

          {/* Filtres par catégories */}
          <div className="filter-row">
            {rootCategories.length > 8 && (
              <button
                type="button"
                className={`categories-burger ${mobileCategoriesOpen ? 'open' : ''}`}
                aria-expanded={mobileCategoriesOpen}
                aria-label="Afficher les catégories"
                onClick={() => setMobileCategoriesOpen((v) => !v)}
              >
                <span className="burger-icon" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="burger-label">
                  {activeRootCategory ?? 'All books'}
                </span>
                <span className="burger-count">{rootCategories.length}</span>
              </button>
            )}
            <div
              className={`categories ${rootCategories.length > 8 ? 'categories--collapsible' : ''} ${
                mobileCategoriesOpen ? 'open' : ''
              }`}
              role="tablist"
              aria-label="Book categories"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button[role="tab"]')) {
                  setMobileCategoriesOpen(false);
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                className={selectedCategory === 'all' ? 'active' : ''}
                onClick={() => {
                  setSelectedCategory('all');
                  setConfirmDeleteCategory(null);
                  setShowNewSubCategoryInput(false);
                }}
              >
                All books
              </button>

              {rootCategories.map((rootCat) => {
                const isSelectedRoot = activeRootCategory === rootCat;
                const subCount = (subCategoriesByRoot.get(rootCat) || []).length;
                const canDeleteRoot = rootCategories.length > 1;

                if (!canDeleteRoot) {
                  return (
                    <button
                      key={rootCat}
                      type="button"
                      role="tab"
                      aria-selected={isSelectedRoot}
                      className={isSelectedRoot ? 'active' : ''}
                      onClick={() => {
                        setSelectedCategory(rootCat);
                        setConfirmDeleteCategory(null);
                        setShowNewSubCategoryInput(false);
                      }}
                    >
                      {rootCat}
                      {subCount > 0 ? ` (${subCount})` : ''}
                    </button>
                  );
                }

                return (
                  <div
                    key={rootCat}
                    className={`category-pill-group ${isSelectedRoot ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelectedRoot}
                      onClick={() => {
                        setSelectedCategory(rootCat);
                        setConfirmDeleteCategory(null);
                        setShowNewSubCategoryInput(false);
                      }}
                      style={{
                        height: '36px',
                        padding: '0 10px 0 15px',
                        fontSize: '0.87rem',
                        fontWeight: 500,
                      }}
                    >
                      {rootCat}
                      {subCount > 0 ? ` (${subCount})` : ''}
                    </button>
                    <button
                      type="button"
                      className="category-pill-delete"
                      title={`Supprimer la catégorie "${rootCat}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteCategory(
                          confirmDeleteCategory === rootCat ? null : rootCat
                        );
                      }}
                      style={{ height: '36px', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <FolioIcon name="close" size={13} />
                    </button>
                  </div>
                );
              })}

              <button
                className="add-category"
                type="button"
                onClick={() => setShowNewCategoryModal(true)}
              >
                <FolioIcon name="plus" size={14} />
                Category
              </button>
            </div>
          </div>

          {/* Barre de sous-catégories lorsqu'une catégorie principale est sélectionnée */}
          {activeRootCategory && (
            <div
              className="categories"
              style={{
                marginTop: '-12px',
                marginBottom: '20px',
                paddingLeft: '12px',
                borderLeft: '2px solid var(--line)',
              }}
            >
              <button
                type="button"
                className={selectedCategory === activeRootCategory ? 'active' : ''}
                onClick={() => setSelectedCategory(activeRootCategory)}
                style={{ height: '30px', fontSize: '0.8rem', padding: '0 12px' }}
              >
                Tout ({activeRootCategory})
              </button>

              {(subCategoriesByRoot.get(activeRootCategory) || []).map((fullSub) => {
                const subLabel = fullSub.split(' / ').slice(1).join(' / ');
                const isSubSelected = selectedCategory === fullSub;
                return (
                  <div
                    key={fullSub}
                    className={`category-pill-group ${isSubSelected ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(fullSub);
                        setConfirmDeleteCategory(null);
                      }}
                      style={{ height: '30px', padding: '0 8px 0 12px', fontSize: '0.8rem' }}
                    >
                      {subLabel}
                    </button>
                    <button
                      type="button"
                      className="category-pill-delete"
                      title={`Supprimer la sous-catégorie "${subLabel}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteCategory(
                          confirmDeleteCategory === fullSub ? null : fullSub
                        );
                      }}
                      style={{ height: '30px', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <FolioIcon name="close" size={12} />
                    </button>
                  </div>
                );
              })}

              {!showNewSubCategoryInput ? (
                <button
                  type="button"
                  className="add-category"
                  onClick={() => setShowNewSubCategoryInput(true)}
                  style={{ height: '30px', fontSize: '0.8rem', padding: '0 12px' }}
                >
                  <FolioIcon name="plus" size={12} />
                  Sous-catégorie
                </button>
              ) : (
                <form
                  onSubmit={handleCreateNewSubCategory}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <input
                    type="text"
                    value={newSubCategoryName}
                    onChange={(e) => setNewSubCategoryName(e.target.value)}
                    placeholder={`Sous-catégorie de ${activeRootCategory}...`}
                    autoFocus
                    style={{
                      height: '30px',
                      padding: '0 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--line)',
                      background: 'var(--paper)',
                      color: 'var(--ink)',
                      fontSize: '0.8rem',
                    }}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    style={{ height: '30px', padding: '0 12px', fontSize: '0.78rem' }}
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ height: '30px', padding: '0 10px', fontSize: '0.78rem' }}
                    onClick={() => {
                      setShowNewSubCategoryInput(false);
                      setNewSubCategoryName('');
                    }}
                  >
                    Annuler
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Confirmation de suppression de catégorie */}
          {confirmDeleteCategory && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(169, 68, 68, 0.35)',
                background: 'rgba(169, 68, 68, 0.08)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.85rem',
              }}
            >
              <span>
                Supprimer la{' '}
                {confirmDeleteCategory.includes(' / ') ? 'sous-catégorie' : 'catégorie'}{' '}
                <strong>« {confirmDeleteCategory} »</strong> ? Les ouvrages associés seront conservés.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ height: '34px', background: '#a94444' }}
                  onClick={() => handleConfirmDeleteCategory(confirmDeleteCategory)}
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ height: '34px' }}
                  onClick={() => setConfirmDeleteCategory(null)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Barre d'outils (Format, Tri, Grille/Liste) */}
          <div className="library-tools">
            <span className="tool-summary">
              {filteredDocuments.length}{' '}
              {filteredDocuments.length === 1 ? 'book' : 'books'}
            </span>

            <div className="tool-controls">
              <div className="format-filter" role="group" aria-label="Filter by file format">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'epub', label: 'EPUB' },
                    { id: 'pdf', label: 'PDF' },
                    { id: 'md', label: 'MD' },
                    { id: 'txt', label: 'TXT' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={formatFilter === item.id ? 'active' : ''}
                    onClick={() => setFormatFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <select
                className="sort-select"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as any)}
                aria-label="Sort books"
              >
                <option value="addedAt">Recently added</option>
                <option value="lastOpened">Recently opened</option>
                <option value="progress">Reading progress</option>
                <option value="title">Title A–Z</option>
              </select>

              <div className="view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === 'grid' ? 'active' : ''}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <FolioIcon name="grid" size={16} />
                </button>
                <button
                  type="button"
                  className={viewMode === 'list' ? 'active' : ''}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <FolioIcon name="list" size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Grille ou Liste des livres */}
          {filteredDocuments.length > 0 ? (
            <div className={`book-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
              {filteredDocuments.map((doc) => {
                const isOpening = openingId === doc.id;
                const pct = doc.progress?.percentage || 0;
                const isRead = Boolean(doc.progress?.isRead || pct >= 100);
                const coverStyle = getFolioCoverStyle(doc.title || doc.id);
                const coverMark = getFolioCoverMark(doc.title);

                return (
                  <article className="book-card" key={doc.id}>
                    <div
                      className={`cover-wrap ${coverStyle}`}
                      onClick={() => handleOpen(doc)}
                      style={{ cursor: 'pointer' }}
                    >
                      <button
                        className={`bookmark ${doc.isFavorite ? 'saved' : ''}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onToggleFavorite(doc.id);
                        }}
                        aria-label={
                          doc.isFavorite
                            ? `Remove ${doc.title} from favorites`
                            : `Add ${doc.title} to favorites`
                        }
                      >
                        <FolioIcon name="star" size={16} />
                      </button>

                      {doc.coverDataUrl ? (
                        <div className="cover has-custom-image">
                          <img
                            src={doc.coverDataUrl}
                            alt={`Couverture de ${doc.title}`}
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="cover">
                          <span className="cover-author">
                            {doc.author || 'Folio Edition'}
                          </span>
                          <strong className="cover-title">{coverMark}</strong>
                          <span className="cover-detail" aria-hidden="true" />
                        </div>
                      )}

                      <span className="category-tag">{doc.category}</span>
                    </div>

                    <div className="book-info">
                      <div className="book-meta">
                        <span>{doc.author || 'Auteur inconnu'}</span>
                        <span>•</span>
                        <span>{doc.format.toUpperCase()}</span>
                        <span>•</span>
                        <span>
                          {doc.driveFileId
                            ? `${doc.size > 0 ? `${formatBytes(doc.size)} · ` : ''}Drive`
                            : formatBytes(doc.size)}
                        </span>
                      </div>

                      <h3
                        onClick={() => handleOpen(doc)}
                        style={{ cursor: 'pointer' }}
                      >
                        {doc.title}
                      </h3>

                      <p className="book-description">{doc.description}</p>

                      <div className="reading-status">
                        <span>
                          {pct === 0 && !isRead
                            ? 'Not started'
                            : isRead
                            ? 'Finished'
                            : doc.progress.page
                            ? `Page ${doc.progress.page} / ${doc.progress.totalPages || '?'}`
                            : doc.progress.chapterLabel
                            ? doc.progress.chapterLabel
                            : 'In progress'}
                          {(doc.bookmarksCount > 0 || doc.annotationsCount > 0) &&
                            ` · ${doc.bookmarksCount} signet(s) · ${doc.annotationsCount} note(s)`}
                        </span>
                        <strong>{pct}%</strong>
                      </div>

                      <div className="progress-track" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>

                      <div className="card-actions">
                        <button
                          className="read-button"
                          type="button"
                          disabled={isOpening}
                          onClick={() => handleOpen(doc)}
                        >
                          <FolioIcon name="book" size={16} />
                          {isOpening
                            ? 'Opening...'
                            : pct > 0 && pct < 100
                            ? 'Resume'
                            : 'Read'}
                        </button>

                        <button
                          className={`icon-action ${isRead ? 'is-read-active' : ''}`}
                          type="button"
                          role="checkbox"
                          aria-checked={isRead}
                          aria-label={
                            isRead
                              ? `Marquer ${doc.title} comme non lu`
                              : `Marquer ${doc.title} comme lu`
                          }
                          title={isRead ? 'Marquer comme non lu' : 'Marquer comme lu'}
                          onClick={() => void onToggleRead(doc.id)}
                        >
                          <FolioIcon name="check" size={16} />
                        </button>

                        <button
                          className="icon-action"
                          type="button"
                          aria-label={`Edit ${doc.title}`}
                          title="Modifier le titre, la catégorie, la couverture ou la description"
                          onClick={() => startEditingDoc(doc)}
                        >
                          <FolioIcon name="edit" size={16} />
                        </button>

                        <button
                          className="icon-action"
                          type="button"
                          aria-label={`Download ${doc.title}`}
                          title="Télécharger le fichier"
                          onClick={() => void onDownloadDecrypted(doc)}
                        >
                          <FolioIcon name="download" size={16} />
                        </button>

                        <button
                          className="icon-action danger"
                          type="button"
                          aria-label={`Delete ${doc.title}`}
                          title="Supprimer"
                          onClick={() => {
                            setDeletingId(doc.id);
                            setEditingDocId(null);
                          }}
                        >
                          <FolioIcon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>
                {documents.length === 0
                  ? 'No books in your library yet.'
                  : 'No books match your search.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                  marginTop: '6px',
                }}
              >
                {documents.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Import a file
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDriveModal(true)}
                    >
                      Link Google Drive
                    </button>
                    <button type="button" onClick={onLoadSampleBooks}>
                      Load sample books
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
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Pied de page Folio */}
      <footer>
        <div className="footer-brand">
          <span className="brand-mark">
            <FolioIcon name="book" size={18} />
          </span>
          <strong>Folio</strong>
          <span>— Digital library for thoughtful reading.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onLoadSampleBooks}
            style={{
              border: 0,
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: '0.85rem',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Load sample books
          </button>
          <p style={{ margin: 0 }}>© 2026 Folio · {documents.length} book(s)</p>
        </div>
      </footer>

      {/* Modale d'ajout de catégorie */}
      {showNewCategoryModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="New category"
          onClick={() => setShowNewCategoryModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-kicker">Organize</p>
                <h3>Create a category</h3>
              </div>
              <button
                type="button"
                className="icon-close"
                onClick={() => setShowNewCategoryModal(false)}
                aria-label="Close"
              >
                <FolioIcon name="close" size={18} />
              </button>
            </div>
            <p className="modal-copy">
              Group your books by theme, subject, or reading mood (e.g., <em>Fiction</em> or{' '}
              <em>Fiction / Sci-Fi</em>).
            </p>
            <form className="modal-form" onSubmit={handleCreateNewCategory}>
              <label>
                Category name
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Poetry, History, Design..."
                  autoFocus
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowNewCategoryModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Add category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale d'édition d'un livre (Titre, Catégorie, Description, Image de couverture) */}
      {editingDoc && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit book"
          onClick={() => setEditingDocId(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-kicker">Book details</p>
                <h3>Edit book</h3>
              </div>
              <button
                type="button"
                className="icon-close"
                onClick={() => setEditingDocId(null)}
                aria-label="Close"
              >
                <FolioIcon name="close" size={18} />
              </button>
            </div>

            <form className="modal-form" onSubmit={submitDocEdit}>
              <div>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 500, marginBottom: '8px' }}>
                  Cover image
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '78px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid var(--line)',
                      background: 'var(--cream)',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {(editCoverDataUrl ?? (editCoverDataUrl === null ? null : editingDoc.coverDataUrl)) ? (
                      <img
                        src={
                          (editCoverDataUrl === null
                            ? undefined
                            : editCoverDataUrl ?? editingDoc.coverDataUrl) || ''
                        }
                        alt="Aperçu couverture"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <FolioIcon name="book" size={20} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleEditCoverFileSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ height: '34px', padding: '0 12px', fontSize: '0.8rem' }}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Choose cover image
                    </button>
                    {(editCoverDataUrl ||
                      (editCoverDataUrl === undefined && editingDoc.coverDataUrl)) && (
                      <button
                        type="button"
                        className="secondary-button"
                        style={{
                          height: '34px',
                          padding: '0 12px',
                          fontSize: '0.8rem',
                          color: '#a94444',
                        }}
                        onClick={() => setEditCoverDataUrl(null)}
                      >
                        Remove cover
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label>
                Title
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </label>

              <label>
                Category
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {allAvailableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__custom__">+ Create new category / subcategory...</option>
                </select>
              </label>

              {editCategory === '__custom__' && (
                <label>
                  New category name
                  <input
                    type="text"
                    value={editCustomCategory}
                    onChange={(e) => setEditCustomCategory(e.target.value)}
                    placeholder="Ex: Fiction / Science-Fiction"
                    required
                  />
                </label>
              )}

              <label>
                Short description
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="A short note about why this book matters..."
                />
              </label>

              <div className="modal-actions edit-modal-actions">
                <button
                  type="button"
                  className="cancel-danger-button"
                  onClick={() => setEditingDocId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="save-success-button">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale de confirmation de suppression d'un livre */}
      {deletingDoc && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete book"
          onClick={() => setDeletingId(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-kicker">Remove from library</p>
                <h3>Delete “{deletingDoc.title}”?</h3>
              </div>
              <button
                type="button"
                className="icon-close"
                onClick={() => setDeletingId(null)}
                aria-label="Close"
              >
                <FolioIcon name="close" size={18} />
              </button>
            </div>
            <p className="modal-copy">
              This will permanently remove this book and its reading notes from your library.
            </p>
            <div className="modal-actions delete-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeletingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-confirm-button"
                onClick={async () => {
                  await onDeleteDocument(deletingDoc.id);
                  setDeletingId(null);
                }}
              >
                Delete book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Paramètres */}
      {showSettings && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Paramètres"
          onClick={() => {
            setShowSettings(false);
            setConfirmDeleteAll(false);
            setDeleteAllText('');
          }}
        >
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="section-kicker">Préférences</p>
                <h3>Paramètres</h3>
              </div>
              <button
                type="button"
                className="icon-close"
                aria-label="Close"
                onClick={() => {
                  setShowSettings(false);
                  setConfirmDeleteAll(false);
                  setDeleteAllText('');
                }}
              >
                <FolioIcon name="close" size={18} />
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-row">
                <span>Thème</span>
                <div className="settings-segment">
                  <button type="button" className={!isDark ? 'active' : ''} onClick={() => isDark && onToggleTheme()}>
                    <FolioIcon name="sun" size={14} /> Clair
                  </button>
                  <button type="button" className={isDark ? 'active' : ''} onClick={() => !isDark && onToggleTheme()}>
                    <FolioIcon name="moon" size={14} /> Sombre
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <span>Affichage par défaut</span>
                <div className="settings-segment">
                  <button
                    type="button"
                    className={viewMode === 'grid' ? 'active' : ''}
                    onClick={() => {
                      setViewMode('grid');
                      localStorage.setItem('folio_default_view', 'grid');
                    }}
                  >
                    <FolioIcon name="grid" size={14} /> Grille
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'list' ? 'active' : ''}
                    onClick={() => {
                      setViewMode('list');
                      localStorage.setItem('folio_default_view', 'list');
                    }}
                  >
                    <FolioIcon name="list" size={14} /> Liste
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <span>Tri par défaut</span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const v = e.target.value as typeof sortBy;
                    setSortBy(v);
                    localStorage.setItem('folio_default_sort', v);
                  }}
                >
                  <option value="addedAt">Récemment ajoutés</option>
                  <option value="lastOpened">Récemment ouverts</option>
                  <option value="progress">Progression</option>
                  <option value="title">Titre</option>
                </select>
              </div>

              <div className="settings-row">
                <span>Filtres</span>
                <button
                  type="button"
                  className="secondary-button settings-small"
                  onClick={() => {
                    setSelectedCategory('all');
                    setNavScope('all');
                    setFormatFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>

            <div className="settings-section settings-danger">
              <p className="section-kicker">Zone de danger</p>
              {!confirmDeleteAll ? (
                <button
                  type="button"
                  className="delete-confirm-button settings-delete-all"
                  disabled={documents.length === 0}
                  onClick={() => setConfirmDeleteAll(true)}
                >
                  <FolioIcon name="trash" size={15} /> Supprimer tous les livres ({documents.length})
                </button>
              ) : (
                <div className="settings-confirm">
                  <p className="modal-copy">
                    Cette action supprime définitivement les {documents.length} livre(s) de la
                    bibliothèque, ainsi que leurs notes de lecture. Tapez <strong>SUPPRIMER</strong>{' '}
                    pour confirmer.
                  </p>
                  <input
                    type="text"
                    value={deleteAllText}
                    onChange={(e) => setDeleteAllText(e.target.value)}
                    placeholder="SUPPRIMER"
                    autoFocus
                  />
                  <div className="modal-actions delete-modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setConfirmDeleteAll(false);
                        setDeleteAllText('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="delete-confirm-button"
                      disabled={deleteAllText.trim() !== 'SUPPRIMER' || deletingAll}
                      onClick={async () => {
                        if (!onDeleteAllDocuments) return;
                        setDeletingAll(true);
                        try {
                          await onDeleteAllDocuments();
                        } finally {
                          setDeletingAll(false);
                          setConfirmDeleteAll(false);
                          setDeleteAllText('');
                          setShowSettings(false);
                        }
                      }}
                    >
                      {deletingAll ? 'Suppression…' : 'Tout supprimer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bouton de bascule de thème flottant en bas à gauche sur téléphone */}
      <button
        className="mobile-theme-toggle"
        type="button"
        onClick={onToggleTheme}
        aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      >
        {isDark ? <FolioIcon name="moon" size={18} /> : <FolioIcon name="sun" size={18} />}
      </button>

      {/* Modale Google Drive */}
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
