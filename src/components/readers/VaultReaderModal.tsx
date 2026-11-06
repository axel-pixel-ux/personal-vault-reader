import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Lock,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  Star,
  Sun,
  Sunset,
  Trash2,
  X,
} from 'lucide-react';
import {
  DocumentStudyData,
  HighlightColor,
  ReaderTheme,
  ReadingProgress,
  VaultAnnotation,
  VaultBookmark,
  VaultDocumentMeta,
} from '../../types/vault';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../utils/highlightHtml';
import { TextLocationSnapshot, TextMarkdownReader } from './TextMarkdownReader';
import { PdfLocationSnapshot, PdfVaultReader } from './PdfVaultReader';
import { EpubLocationSnapshot, EpubVaultReader } from './EpubVaultReader';

interface VaultReaderModalProps {
  documentMeta: VaultDocumentMeta;
  decryptedBuffer: ArrayBuffer;
  initialStudyData: DocumentStudyData;
  initialTheme: ReaderTheme;
  onClose: () => void;
  onLockNow: () => void;
  onToggleFavorite: (docId: string) => Promise<void>;
  onSaveProgress: (docId: string, progress: Partial<ReadingProgress>) => void;
  onSaveStudyData: (docId: string, data: DocumentStudyData) => Promise<void>;
}

interface ActiveLocationState {
  percentage: number;
  locationLabel: string;
  page?: number;
  totalPages?: number;
  cfi?: string;
  chapterIndex?: number;
  chapterLabel?: string;
  scrollRatio?: number;
}

const READER_FONT_OPTIONS = [
  { label: 'Georgia (Serif)', value: 'Georgia, Cambria, serif' },
  { label: 'Calibri (Sans)', value: 'Calibri, Candara, "Segoe UI", sans-serif' },
  { label: 'Arial (Sans)', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana (Sans)', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { label: 'Source Serif 4', value: '"Source Serif 4", Georgia, serif' },
  { label: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", sans-serif' },
  { label: 'Courier New (Mono)', value: '"Courier New", Courier, monospace' },
] as const;

export const VaultReaderModal: React.FC<VaultReaderModalProps> = ({
  documentMeta,
  decryptedBuffer,
  initialStudyData,
  initialTheme,
  onClose,
  onLockNow,
  onToggleFavorite,
  onSaveProgress,
  onSaveStudyData,
}) => {
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(initialTheme);
  const [fontSize, setFontSize] = useState<number>(19);
  const [fontFamily, setFontFamily] = useState<string>(READER_FONT_OPTIONS[0].value);
  const [toolbarCollapsed, setToolbarCollapsed] = useState<boolean>(false);
  const [livePercentage, setLivePercentage] = useState<number>(
    documentMeta.progress?.percentage || 0
  );

  // État courant de la position pour associer les signets et annotations
  const [currentLoc, setCurrentLoc] = useState<ActiveLocationState>(() => {
    const p = documentMeta.progress;
    const label = p?.page
      ? `Page ${p.page}`
      : p?.chapterLabel
      ? p.chapterLabel
      : `Position ${p?.percentage || 0}%`;
    return {
      percentage: p?.percentage || 0,
      locationLabel: label,
      page: p?.page,
      totalPages: p?.totalPages,
      cfi: p?.cfi,
      chapterIndex: p?.chapterIndex,
      chapterLabel: p?.chapterLabel,
      scrollRatio: p?.scrollRatio,
    };
  });

  // Tiroir latéral Signets & Notes
  const [sidePanelTab, setSidePanelTab] = useState<'none' | 'bookmarks' | 'notes'>('none');
  const [bookmarks, setBookmarks] = useState<VaultBookmark[]>(
    initialStudyData.bookmarks || []
  );
  const [annotations, setAnnotations] = useState<VaultAnnotation[]>(
    initialStudyData.annotations || []
  );

  // Formulaire de nouveau signet
  const [bookmarkLabelInput, setBookmarkLabelInput] = useState<string>('');
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);

  // Formulaire de nouvelle note / édition de note
  const [noteContentInput, setNoteContentInput] = useState<string>('');
  const [noteQuoteInput, setNoteQuoteInput] = useState<string>('');
  const [noteColorInput, setNoteColorInput] = useState<HighlightColor>('yellow');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');
  const [editingNoteColor, setEditingNoteColor] = useState<HighlightColor>('yellow');

  // Cible de saut direct (page PDF, CFI/chapitre ePub, ratio de défilement TXT/MD)
  const [jumpTarget, setJumpTarget] = useState<{
    timestamp: number;
    page?: number;
    cfi?: string;
    chapterIndex?: number;
    scrollRatio?: number;
  } | null>(null);

  const saveTimerRef = useRef<number | null>(null);

  const handleProgressUpdate = useCallback(
    (progress: Partial<ReadingProgress>) => {
      if (typeof progress.percentage === 'number') {
        setLivePercentage(Math.max(0, Math.min(100, Math.round(progress.percentage))));
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        onSaveProgress(documentMeta.id, progress);
      }, 250);
    },
    [documentMeta.id, onSaveProgress]
  );

  const handleTextLocationSnapshot = useCallback((snap: TextLocationSnapshot) => {
    setCurrentLoc((prev) => {
      if (
        prev.percentage === snap.percentage &&
        prev.locationLabel === snap.locationLabel &&
        prev.scrollRatio === snap.scrollRatio
      ) {
        return prev;
      }
      return {
        percentage: snap.percentage,
        locationLabel: snap.locationLabel,
        scrollRatio: snap.scrollRatio,
        chapterLabel: snap.chapterLabel,
      };
    });
  }, []);

  const handlePdfLocationSnapshot = useCallback((snap: PdfLocationSnapshot) => {
    setCurrentLoc((prev) => {
      if (
        prev.percentage === snap.percentage &&
        prev.page === snap.page &&
        prev.totalPages === snap.totalPages
      ) {
        return prev;
      }
      return {
        percentage: snap.percentage,
        locationLabel: snap.locationLabel,
        page: snap.page,
        totalPages: snap.totalPages,
      };
    });
  }, []);

  const handleEpubLocationSnapshot = useCallback((snap: EpubLocationSnapshot) => {
    setCurrentLoc((prev) => {
      if (
        prev.percentage === snap.percentage &&
        prev.locationLabel === snap.locationLabel &&
        prev.chapterIndex === snap.chapterIndex &&
        prev.page === snap.page &&
        prev.scrollRatio === snap.scrollRatio
      ) {
        return prev;
      }
      return {
        percentage: snap.percentage,
        locationLabel: snap.locationLabel,
        cfi: snap.cfi,
        chapterIndex: snap.chapterIndex,
        chapterLabel: snap.chapterLabel,
        page: snap.page,
        scrollRatio: snap.scrollRatio,
      };
    });
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const persistStudyChanges = async (
    nextBookmarks: VaultBookmark[],
    nextAnnotations: VaultAnnotation[]
  ) => {
    setBookmarks(nextBookmarks);
    setAnnotations(nextAnnotations);
    await onSaveStudyData(documentMeta.id, {
      bookmarks: nextBookmarks,
      annotations: nextAnnotations,
    });
  };

  // Ajout rapide ou personnalisé d'un signet
  const handleAddBookmark = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const customLabel = bookmarkLabelInput.trim();
    const defaultLabel = currentLoc.locationLabel || `Position ${livePercentage}%`;

    const newBookmark: VaultBookmark = {
      id: window.crypto.randomUUID(),
      label: customLabel || defaultLabel,
      createdAt: Date.now(),
      percentage: livePercentage,
      page: currentLoc.page,
      cfi: currentLoc.cfi,
      chapterIndex: currentLoc.chapterIndex,
      chapterLabel: currentLoc.chapterLabel,
      scrollRatio: currentLoc.scrollRatio,
    };

    const next = [newBookmark, ...bookmarks];
    setBookmarkLabelInput('');
    await persistStudyChanges(next, annotations);

    setBookmarkToast(`Signet enregistré (${newBookmark.label})`);
    window.setTimeout(() => setBookmarkToast(null), 2200);
  };

  const handleDeleteBookmark = async (id: string) => {
    const next = bookmarks.filter((b) => b.id !== id);
    await persistStudyChanges(next, annotations);
  };

  const handleJumpToLocation = (item: {
    page?: number;
    cfi?: string;
    chapterIndex?: number;
    scrollRatio?: number;
  }) => {
    setJumpTarget({
      timestamp: Date.now(),
      page: item.page,
      cfi: item.cfi,
      chapterIndex: item.chapterIndex,
      scrollRatio: item.scrollRatio,
    });
    if (window.innerWidth < 768) {
      setSidePanelTab('none');
    }
  };

  // Ajout d'une nouvelle note ou d'un surlignage
  const handleAddAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteContentInput.trim();
    const quote = noteQuoteInput.trim();
    if (!content && !quote) return;

    const now = Date.now();
    const newAnnotation: VaultAnnotation = {
      id: window.crypto.randomUUID(),
      content,
      quote: quote || undefined,
      highlightColor: quote ? noteColorInput : undefined,
      locationLabel: currentLoc.locationLabel || `Position ${livePercentage}%`,
      createdAt: now,
      updatedAt: now,
      percentage: livePercentage,
      page: currentLoc.page,
      cfi: currentLoc.cfi,
      chapterIndex: currentLoc.chapterIndex,
      scrollRatio: currentLoc.scrollRatio,
    };

    const next = [newAnnotation, ...annotations];
    setNoteContentInput('');
    setNoteQuoteInput('');
    await persistStudyChanges(bookmarks, next);
  };

  const handleCreateHighlight = useCallback(
    async (quote: string, color: HighlightColor, comment?: string) => {
      const cleanQuote = quote.trim();
      if (!cleanQuote) return;
      const now = Date.now();
      const newAnnotation: VaultAnnotation = {
        id: window.crypto.randomUUID(),
        content: (comment || '').trim(),
        quote: cleanQuote,
        highlightColor: color,
        locationLabel: currentLoc.locationLabel || `Position ${livePercentage}%`,
        createdAt: now,
        updatedAt: now,
        percentage: livePercentage,
        page: currentLoc.page,
        cfi: currentLoc.cfi,
        chapterIndex: currentLoc.chapterIndex,
        scrollRatio: currentLoc.scrollRatio,
      };

      const next = [newAnnotation, ...annotations];
      await persistStudyChanges(bookmarks, next);

      setBookmarkToast(
        comment?.trim()
          ? 'Passage surligné et note enregistrés'
          : 'Passage surligné (cliquez dessus pour ajouter une note)'
      );
      window.setTimeout(() => setBookmarkToast(null), 2400);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotations, bookmarks, currentLoc, livePercentage, documentMeta.id]
  );

  const handleSelectAnnotation = useCallback(
    (annotationId: string) => {
      const found = annotations.find((a) => a.id === annotationId);
      setSidePanelTab('notes');
      if (found) {
        setEditingNoteId(found.id);
        setEditingNoteText(found.content || '');
        setEditingNoteColor(found.highlightColor || 'yellow');
      }
    },
    [annotations]
  );

  const handleSaveEditedAnnotation = async (id: string) => {
    const trimmed = editingNoteText.trim();
    const targetAnn = annotations.find((a) => a.id === id);
    if (!trimmed && !targetAnn?.quote) return;
    const next = annotations.map((a) =>
      a.id === id
        ? {
            ...a,
            content: trimmed,
            highlightColor: a.quote ? editingNoteColor : a.highlightColor,
            updatedAt: Date.now(),
          }
        : a
    );
    setEditingNoteId(null);
    setEditingNoteText('');
    await persistStudyChanges(bookmarks, next);
  };

  const handleDeleteAnnotation = async (id: string) => {
    const next = annotations.filter((a) => a.id !== id);
    await persistStudyChanges(bookmarks, next);
  };

  const handleQuickAnnotateSelection = useCallback(
    (selectedText: string, color?: HighlightColor) => {
      setSidePanelTab('notes');
      setNoteQuoteInput(selectedText);
      if (color) {
        setNoteColorInput(color);
      }
    },
    []
  );

  // Export des signets et annotations en fichier Markdown
  const handleExportNotes = () => {
    const lines: string[] = [
      `# Notes et Signets — ${documentMeta.title}`,
      `Catégorie : ${documentMeta.category} · Progression : ${livePercentage}%`,
      '',
    ];

    if (bookmarks.length > 0) {
      lines.push('## Signets');
      bookmarks.forEach((b) => {
        lines.push(`- **${b.label}** (${b.percentage}%)`);
      });
      lines.push('');
    }

    if (annotations.length > 0) {
      lines.push('## Annotations');
      annotations.forEach((a) => {
        lines.push(`### ${a.locationLabel} (${a.percentage}%)`);
        if (a.quote) {
          lines.push(`> « ${a.quote} »`);
          lines.push('');
        }
        lines.push(a.content);
        lines.push('');
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notes-${documentMeta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const headerStyle =
    readerTheme === 'light'
      ? 'bg-white border-zinc-200 text-zinc-900'
      : readerTheme === 'sepia'
      ? 'bg-[#e9dec0] border-[#d3c29d] text-[#3b2f2f]'
      : 'bg-zinc-900 border-zinc-800/90 text-zinc-100';

  const drawerStyle =
    readerTheme === 'light'
      ? 'bg-white border-zinc-200 text-zinc-900'
      : readerTheme === 'sepia'
      ? 'bg-[#efe4c8] border-[#d8c8a8] text-[#3b2f2f]'
      : 'bg-zinc-900 border-zinc-800 text-zinc-100';

  const supportsFontResize =
    documentMeta.format === 'txt' ||
    documentMeta.format === 'md' ||
    documentMeta.format === 'epub';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col w-screen h-screen overflow-hidden bg-zinc-950">
      {/* Notification discrète de signet */}
      {bookmarkToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-zinc-900 text-zinc-100 border border-zinc-700 shadow-lg text-xs font-medium">
          {bookmarkToast}
        </div>
      )}

      {/* Bouton flottant lorsque la barre d'outils est masquée */}
      {toolbarCollapsed && (
        <div className="fixed top-3 right-6 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setToolbarCollapsed(false)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900/95 text-zinc-100 border border-zinc-700/80 shadow-lg text-xs font-medium hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Barre d’outils ({livePercentage}%)</span>
          </button>
        </div>
      )}

      {/* En-tête de lecture sobre */}
      {!toolbarCollapsed && (
        <header
          className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 lg:gap-4 px-3 sm:px-6 py-2.5 border-b shrink-0 transition-colors duration-200 ${headerStyle}`}
        >
          {/* Gauche : Retour + Titre + Favori */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full lg:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Bibliothèque</span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between lg:justify-start gap-2">
                <h1 className="text-sm font-semibold tracking-tight truncate max-w-full sm:max-w-md md:max-w-lg">
                  {documentMeta.title}
                </h1>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(documentMeta.id)}
                  className={`p-1 rounded transition-colors shrink-0 ${
                    documentMeta.isFavorite
                      ? 'text-amber-500'
                      : 'opacity-45 hover:opacity-100'
                  }`}
                  title={
                    documentMeta.isFavorite
                      ? 'Retirer des favoris'
                      : 'Ajouter aux favoris'
                  }
                >
                  <Star
                    className="w-4 h-4"
                    fill={documentMeta.isFavorite ? 'currentColor' : 'none'}
                  />
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] opacity-65 truncate">
                <span className="truncate max-w-[100px] sm:max-w-none">{documentMeta.category}</span>
                <span aria-hidden="true">·</span>
                <span className="uppercase font-mono shrink-0">{documentMeta.format}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{currentLoc.locationLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums shrink-0">{livePercentage}%</span>
              </div>
            </div>
          </div>

          {/* Droite : Signets, Notes, Police, Taille de police, Thème, Masquer, Verrouiller (glissable horizontalement sur mobile) */}
          <div className="w-full lg:w-auto overflow-x-auto no-scrollbar touch-pan-x flex items-center gap-2 py-0.5 shrink-0">
            {/* Bouton d'ajout rapide de signet */}
            <button
              type="button"
              onClick={() => handleAddBookmark()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-current/20 hover:border-current/40 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              title="Poser un signet sur la position actuelle"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Marquer</span>
            </button>

            {/* Tiroir Signets */}
            <button
              type="button"
              onClick={() =>
                setSidePanelTab((t) => (t === 'bookmarks' ? 'none' : 'bookmarks'))
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                sidePanelTab === 'bookmarks'
                  ? 'border-current/60 bg-current/15'
                  : 'border-current/20 hover:border-current/40'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Signets</span>
              <span className="font-mono tabular-nums opacity-75">
                ({bookmarks.length})
              </span>
            </button>

            {/* Tiroir Notes & Annotations */}
            <button
              type="button"
              onClick={() => setSidePanelTab((t) => (t === 'notes' ? 'none' : 'notes'))}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                sidePanelTab === 'notes'
                  ? 'border-current/60 bg-current/15'
                  : 'border-current/20 hover:border-current/40'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Notes</span>
              <span className="font-mono tabular-nums opacity-75">
                ({annotations.length})
              </span>
            </button>

            {/* Choix de la police et Taille de police */}
            {supportsFontResize && (
              <>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  aria-label="Choisir la police de lecture"
                  className="px-2.5 py-1.5 rounded-lg border border-current/20 bg-transparent text-xs font-medium focus:outline-none cursor-pointer shrink-0"
                >
                  {READER_FONT_OPTIONS.map((font) => (
                    <option
                      key={font.label}
                      value={font.value}
                      className="bg-zinc-900 text-zinc-100"
                    >
                      {font.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-current/20 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFontSize((s) => Math.max(12, s - 2))}
                    disabled={fontSize <= 12}
                    className="p-0.5 rounded hover:bg-current/10 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Réduire la taille de police"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 text-xs font-mono tabular-nums">
                    {fontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={() => setFontSize((s) => Math.min(34, s + 2))}
                    disabled={fontSize >= 34}
                    className="p-0.5 rounded hover:bg-current/10 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Augmenter la taille de police"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {/* Thème Sombre / Clair / Sépia */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-current/20 shrink-0">
              <button
                type="button"
                onClick={() => setReaderTheme('dark')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  readerTheme === 'dark'
                    ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title="Sombre"
              >
                <Moon className="w-3 h-3" />
                <span className="hidden md:inline">Sombre</span>
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme('light')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  readerTheme === 'light'
                    ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title="Clair"
              >
                <Sun className="w-3 h-3" />
                <span className="hidden md:inline">Clair</span>
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme('sepia')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  readerTheme === 'sepia'
                    ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title="Sépia"
              >
                <Sunset className="w-3 h-3" />
                <span className="hidden md:inline">Sépia</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setToolbarCollapsed(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-current/20 hover:border-current/40 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              title="Masquer la barre d'outils"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onLockNow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              title="Verrouiller la bibliothèque"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verrouiller</span>
            </button>
          </div>
        </header>
      )}

      {/* Ligne fine de progression */}
      <div className="w-full h-0.5 bg-zinc-800/50 shrink-0">
        <div
          className="h-full bg-zinc-400 transition-all duration-300"
          style={{ width: `${Math.max(1, livePercentage)}%` }}
        />
      </div>

      {/* Zone centrale : Lecteur + Panneau latéral Signets / Notes */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          {(documentMeta.format === 'txt' || documentMeta.format === 'md') && (
            <TextMarkdownReader
              buffer={decryptedBuffer}
              format={documentMeta.format}
              theme={readerTheme}
              fontSize={fontSize}
              fontFamily={fontFamily}
              initialProgress={documentMeta.progress}
              jumpTarget={jumpTarget}
              annotations={annotations}
              onProgressChange={handleProgressUpdate}
              onLocationSnapshot={handleTextLocationSnapshot}
              onQuickAnnotateSelection={handleQuickAnnotateSelection}
              onCreateHighlight={handleCreateHighlight}
              onSelectAnnotation={handleSelectAnnotation}
            />
          )}

          {documentMeta.format === 'pdf' && (
            <PdfVaultReader
              buffer={decryptedBuffer}
              theme={readerTheme}
              initialProgress={documentMeta.progress}
              jumpTarget={jumpTarget}
              onProgressChange={handleProgressUpdate}
              onLocationSnapshot={handlePdfLocationSnapshot}
            />
          )}

          {documentMeta.format === 'epub' && (
            <EpubVaultReader
              buffer={decryptedBuffer}
              theme={readerTheme}
              fontSize={fontSize}
              fontFamily={fontFamily}
              initialProgress={documentMeta.progress}
              jumpTarget={jumpTarget}
              annotations={annotations}
              onProgressChange={handleProgressUpdate}
              onLocationSnapshot={handleEpubLocationSnapshot}
              onQuickAnnotateSelection={handleQuickAnnotateSelection}
              onCreateHighlight={handleCreateHighlight}
              onSelectAnnotation={handleSelectAnnotation}
            />
          )}
        </main>

        {/* Panneau latéral dédié aux Signets et aux Notes */}
        {sidePanelTab !== 'none' && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-20 md:hidden"
              onClick={() => setSidePanelTab('none')}
              aria-hidden="true"
            />
            <aside
              className={`absolute inset-y-0 right-0 w-80 max-w-[88vw] sm:w-96 md:static border-l flex flex-col h-full shrink-0 z-30 shadow-2xl md:shadow-none ${drawerStyle}`}
            >
            {/* En-tête du tiroir */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-current/15">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSidePanelTab('bookmarks')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    sidePanelTab === 'bookmarks'
                      ? 'bg-current/15 font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  Signets ({bookmarks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanelTab('notes')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    sidePanelTab === 'notes'
                      ? 'bg-current/15 font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                >
                  Notes ({annotations.length})
                </button>
              </div>

              <div className="flex items-center gap-1">
                {(bookmarks.length > 0 || annotations.length > 0) && (
                  <button
                    type="button"
                    onClick={handleExportNotes}
                    className="p-1.5 rounded-md hover:bg-current/10 opacity-75 hover:opacity-100 transition-colors"
                    title="Exporter les signets et notes en Markdown (.md)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSidePanelTab('none')}
                  className="p-1.5 rounded-md hover:bg-current/10 opacity-75 hover:opacity-100 transition-colors"
                  title="Fermer le panneau"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {sidePanelTab === 'bookmarks' ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Ajout de signet avec libellé optionnel */}
                <form
                  onSubmit={handleAddBookmark}
                  className="p-4 border-b border-current/15 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>Position actuelle : {currentLoc.locationLabel}</span>
                    <span className="font-mono tabular-nums">{livePercentage}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bookmarkLabelInput}
                      onChange={(e) => setBookmarkLabelInput(e.target.value)}
                      placeholder="Libellé optionnel du signet..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-current/20 bg-transparent focus:outline-none focus:border-current/50"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Ajouter
                    </button>
                  </div>
                </form>

                {/* Liste des signets du livre */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {bookmarks.length === 0 ? (
                    <div className="py-12 text-center text-xs opacity-60 space-y-1">
                      <p>Aucun signet pour cet ouvrage.</p>
                      <p>Enregistrez une page ou un chapitre pour y revenir en un clic.</p>
                    </div>
                  ) : (
                    bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="group flex items-center justify-between gap-2 p-3 rounded-lg border border-current/15 hover:border-current/35 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleJumpToLocation(bm)}
                          className="flex-1 text-left min-w-0 cursor-pointer"
                        >
                          <p className="text-xs font-medium truncate">{bm.label}</p>
                          <div className="flex items-center gap-2 text-[11px] opacity-60 mt-0.5">
                            <span className="font-mono tabular-nums">{bm.percentage}%</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Intl.DateTimeFormat('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(bm.createdAt))}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBookmark(bm.id)}
                          className="p-1.5 rounded hover:bg-red-500/15 hover:text-red-400 opacity-50 group-hover:opacity-100 transition-opacity"
                          title="Supprimer ce signet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Onglet Notes & Surlignages */
              <div className="flex-1 flex flex-col min-h-0">
                <form
                  onSubmit={handleAddAnnotation}
                  className="p-4 border-b border-current/15 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>Emplacement : {currentLoc.locationLabel}</span>
                    <span className="font-mono tabular-nums">{livePercentage}%</span>
                  </div>

                  {noteQuoteInput && (
                    <div className="space-y-2">
                      <div className="p-2 rounded border border-current/15 bg-current/5 text-[11px] italic flex items-start justify-between gap-2">
                        <span className="line-clamp-3">« {noteQuoteInput} »</span>
                        <button
                          type="button"
                          onClick={() => setNoteQuoteInput('')}
                          className="opacity-60 hover:opacity-100 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="opacity-70">Couleur :</span>
                        <div className="flex items-center gap-1.5">
                          {HIGHLIGHT_COLOR_OPTIONS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setNoteColorInput(c.id)}
                              className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                                c.swatchClass
                              } ${
                                noteColorInput === c.id
                                  ? 'scale-115 ring-2 ring-current'
                                  : 'opacity-55 hover:opacity-100'
                              }`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={noteContentInput}
                    onChange={(e) => setNoteContentInput(e.target.value)}
                    placeholder={
                      noteQuoteInput
                        ? 'Ajouter un commentaire à ce passage surligné (optionnel)...'
                        : 'Rédiger une note associée à cet emplacement...'
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-current/20 bg-transparent focus:outline-none focus:border-current/50 resize-none"
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!noteContentInput.trim() && !noteQuoteInput.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 disabled:opacity-40 text-xs font-medium cursor-pointer"
                    >
                      {noteQuoteInput && !noteContentInput.trim()
                        ? 'Enregistrer le surlignage'
                        : 'Enregistrer la note'}
                    </button>
                  </div>
                </form>

                {/* Liste des notes et surlignages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {annotations.length === 0 ? (
                    <div className="py-12 text-center text-xs opacity-60 space-y-1">
                      <p>Aucune note ni surlignage enregistré.</p>
                      <p>
                        Sélectionnez du texte dans le livre pour le surligner et y ajouter un commentaire.
                      </p>
                    </div>
                  ) : (
                    annotations.map((note) => {
                      const isEditing = editingNoteId === note.id;
                      const colorMeta = HIGHLIGHT_COLOR_OPTIONS.find(
                        (c) => c.id === (note.highlightColor || 'yellow')
                      );
                      return (
                        <div
                          key={note.id}
                          className="p-3.5 rounded-lg border border-current/15 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => handleJumpToLocation(note)}
                              className="font-medium underline underline-offset-2 opacity-80 hover:opacity-100 text-left truncate cursor-pointer"
                              title="Aller à cet emplacement"
                            >
                              {note.locationLabel} ({note.percentage}%)
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditingNoteText(note.content || '');
                                  setEditingNoteColor(note.highlightColor || 'yellow');
                                }}
                                className="p-1 rounded hover:bg-current/10 opacity-65 hover:opacity-100 cursor-pointer"
                                title="Ajouter ou modifier le commentaire"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAnnotation(note.id)}
                                className="p-1 rounded hover:bg-red-500/15 hover:text-red-400 opacity-65 hover:opacity-100 cursor-pointer"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {note.quote && (
                            <blockquote
                              className={`p-2 rounded text-[11px] italic border-l-3 ${
                                colorMeta
                                  ? colorMeta.badgeClass
                                  : 'border-amber-500/60 bg-amber-400/15'
                              }`}
                            >
                              « {note.quote} »
                            </blockquote>
                          )}

                          {isEditing ? (
                            <div className="space-y-2 pt-1">
                              {note.quote && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="opacity-70">Couleur :</span>
                                  {HIGHLIGHT_COLOR_OPTIONS.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => setEditingNoteColor(c.id)}
                                      className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                                        c.swatchClass
                                      } ${
                                        editingNoteColor === c.id
                                          ? 'scale-115 ring-2 ring-current'
                                          : 'opacity-55 hover:opacity-100'
                                      }`}
                                      title={c.label}
                                    />
                                  ))}
                                </div>
                              )}
                              <textarea
                                rows={3}
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                placeholder="Votre commentaire ou note sur ce passage..."
                                autoFocus
                                className="w-full px-2.5 py-1.5 text-xs rounded border border-current/30 bg-transparent focus:outline-none resize-none"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditedAnnotation(note.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 text-xs font-medium cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Valider</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNoteId(null)}
                                  className="px-2 py-1 rounded border border-current/20 text-xs cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : note.content ? (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                              {note.content}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteText('');
                                setEditingNoteColor(note.highlightColor || 'yellow');
                              }}
                              className="text-[11px] opacity-60 hover:opacity-100 underline underline-offset-2 cursor-pointer"
                            >
                              + Ajouter un commentaire à ce surlignage
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
          </>
        )}
      </div>
    </div>
  );
};
