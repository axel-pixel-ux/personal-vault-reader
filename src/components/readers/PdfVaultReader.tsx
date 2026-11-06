import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Contrast,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  HighlightColor,
  PDFDocumentProxy,
  PdfHighlightRect,
  ReaderTheme,
  ReadingProgress,
  VaultAnnotation,
} from '../../types/vault';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../utils/highlightHtml';

const PDF_HIGHLIGHT_BG: Record<HighlightColor, string> = {
  yellow: 'rgba(251, 191, 36, 0.5)',
  green: 'rgba(52, 211, 153, 0.45)',
  blue: 'rgba(56, 189, 248, 0.45)',
  pink: 'rgba(244, 114, 182, 0.45)',
};

interface PdfSelectionState {
  quote: string;
  rects: PdfHighlightRect[];
  x: number;
  top: number;
  bottom: number;
}

export interface PdfLocationSnapshot {
  percentage: number;
  page: number;
  totalPages: number;
  locationLabel: string;
}

export interface PdfJumpTarget {
  timestamp: number;
  page?: number;
}

interface PdfVaultReaderProps {
  buffer: ArrayBuffer;
  theme: ReaderTheme;
  initialProgress: ReadingProgress;
  jumpTarget: PdfJumpTarget | null;
  annotations?: VaultAnnotation[];
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: PdfLocationSnapshot) => void;
  onCreateHighlight?: (
    quote: string,
    color: HighlightColor,
    comment?: string,
    extra?: { page?: number; rects?: PdfHighlightRect[] }
  ) => void;
  onSelectAnnotation?: (annotationId: string) => void;
}

const PDF_WORKER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const PdfVaultReader: React.FC<PdfVaultReaderProps> = ({
  buffer,
  theme,
  initialProgress,
  jumpTarget,
  annotations,
  onProgressChange,
  onLocationSnapshot,
  onCreateHighlight,
  onSelectAnnotation,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastJumpTimestampRef = useRef<number>(0);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textTaskRef = useRef<{ cancel: () => void } | null>(null);
  const noteModeRef = useRef<boolean>(false);

  const [pdfSelection, setPdfSelection] = useState<PdfSelectionState | null>(null);
  const [noteMode, setNoteMode] = useState<boolean>(false);
  const [noteText, setNoteText] = useState<string>('');

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialProgress.page || 1);
  const [pageInput, setPageInput] = useState<string>(String(initialProgress.page || 1));
  // Zoom relatif à la taille ajustée à l'écran (1 = 100% proportionné à la fenêtre)
  const [scale, setScale] = useState<number>(1);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [invertPageInDark, setInvertPageInDark] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      setContainerSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    noteModeRef.current = noteMode;
  }, [noteMode]);

  // Détection de la sélection de texte dans la couche texte du PDF
  useEffect(() => {
    let timer: number | undefined;
    const onSelectionChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const layer = textLayerRef.current;
        const sel = window.getSelection();
        if (!layer || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
          if (!noteModeRef.current) setPdfSelection(null);
          return;
        }
        const range = sel.getRangeAt(0);
        if (!layer.contains(range.commonAncestorContainer)) return;

        const quote = sel.toString().replace(/\s+/g, ' ').trim();
        if (!quote) {
          if (!noteModeRef.current) setPdfSelection(null);
          return;
        }

        const box = layer.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        const raw = Array.from(range.getClientRects()).filter(
          (r) => r.width > 1 && r.height > 1
        );
        // Retire les rectangles entièrement contenus dans un autre (doublons de spans imbriqués)
        const kept = raw.filter(
          (r, i) =>
            !raw.some(
              (o, j) =>
                j !== i &&
                o.left <= r.left + 0.5 &&
                o.right >= r.right - 0.5 &&
                o.top <= r.top + 0.5 &&
                o.bottom >= r.bottom - 0.5 &&
                (o.width > r.width || o.height > r.height || j < i)
            )
        );
        const rects: PdfHighlightRect[] = kept.map((r) => ({
          x: (r.left - box.left) / box.width,
          y: (r.top - box.top) / box.height,
          w: r.width / box.width,
          h: r.height / box.height,
        }));
        if (rects.length === 0) return;

        const bounds = range.getBoundingClientRect();
        setPdfSelection({
          quote,
          rects,
          x: bounds.left + bounds.width / 2,
          top: bounds.top,
          bottom: bounds.bottom,
        });
      }, 200);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);

    async function loadPdf() {
      try {
        if (!window.pdfjsLib) {
          throw new Error('La bibliothèque PDF.js n’est pas disponible.');
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;

        const dataCopy = new Uint8Array(buffer.slice(0));
        const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
        const doc = await loadingTask.promise;

        if (!isMounted) {
          await doc.destroy();
          return;
        }

        pdfDocRef.current = doc;
        const total = doc.numPages;
        const startPage = Math.min(Math.max(1, initialProgress.page || 1), total);

        setNumPages(total);
        setCurrentPage(startPage);
        setPageInput(String(startPage));
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMsg(err?.message || 'Impossible d’ouvrir ce document PDF.');
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignorer
        }
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [buffer]);

  const renderPage = useCallback(
    async (pageNumber: number, zoomMultiplier: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = viewportContainerRef.current;
      if (!doc || !canvas || pageNumber < 1 || pageNumber > doc.numPages) return;

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignorer
          }
        }

        if (textTaskRef.current) {
          try {
            textTaskRef.current.cancel();
          } catch {
            // Ignorer
          }
          textTaskRef.current = null;
        }

        const page = await doc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });

        const padX = window.innerWidth < 640 ? 24 : 64;
        const padY = window.innerWidth < 640 ? 24 : 48;
        const availWidth = Math.max(240, (container?.clientWidth || window.innerWidth) - padX);
        const availHeight = Math.max(320, (container?.clientHeight || window.innerHeight - 120) - padY);

        // Échelle de base qui fait tenir la page entière (et ses images) de manière proportionnée
        const fitWidthScale = availWidth / Math.max(1, baseViewport.width);
        const fitHeightScale = availHeight / Math.max(1, baseViewport.height);
        const fitScale = Math.min(fitWidthScale, fitHeightScale);

        const effectiveScale = Math.max(0.2, fitScale * zoomMultiplier);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const viewport = page.getViewport({ scale: effectiveScale * dpr });
        const displayViewport = page.getViewport({ scale: effectiveScale });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(displayViewport.width)}px`;
        canvas.style.height = `${Math.floor(displayViewport.height)}px`;

        const task = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = task;
        await task.promise;

        // Couche texte sélectionnable (permet le surlignage)
        const layer = textLayerRef.current;
        const pdfjs = window.pdfjsLib;
        if (layer && pdfjs?.renderTextLayer) {
          try {
            layer.innerHTML = '';
            layer.style.width = `${Math.floor(displayViewport.width)}px`;
            layer.style.height = `${Math.floor(displayViewport.height)}px`;
            layer.style.setProperty('--scale-factor', String(effectiveScale));
            const textContent = await (page as any).getTextContent();
            const textTask = pdfjs.renderTextLayer({
              textContentSource: textContent,
              container: layer,
              viewport: displayViewport,
              textDivs: [],
            });
            textTaskRef.current = textTask;
            await textTask.promise;
          } catch (textErr: any) {
            if (textErr?.name !== 'RenderingCancelledException') {
              console.warn('Couche texte PDF indisponible:', textErr);
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Erreur de rendu PDF:', err);
        }
      }
    },
    []
  );

  const goToPage = useCallback(
    (targetPage: number) => {
      if (numPages < 1) return;
      const clamped = Math.min(Math.max(1, targetPage), numPages);
      setCurrentPage(clamped);
      setPageInput(String(clamped));
    },
    [numPages]
  );

  // Saut direct vers un signet ou une annotation
  useEffect(() => {
    if (jumpTarget && typeof jumpTarget.page === 'number' && numPages > 0) {
      if (lastJumpTimestampRef.current === jumpTarget.timestamp) return;
      lastJumpTimestampRef.current = jumpTarget.timestamp;
      goToPage(jumpTarget.page);
    }
  }, [jumpTarget, numPages, goToPage]);

  useEffect(() => {
    if (!loading && numPages > 0) {
      setPdfSelection(null);
      renderPage(currentPage, scale);
      const pct = Math.round((currentPage / numPages) * 100);
      onProgressChange({
        page: currentPage,
        totalPages: numPages,
        percentage: pct,
      });
      if (onLocationSnapshot) {
        onLocationSnapshot({
          percentage: pct,
          page: currentPage,
          totalPages: numPages,
          locationLabel: `Page ${currentPage} sur ${numPages}`,
        });
      }
    }
  }, [currentPage, scale, containerSize.width, containerSize.height, loading, numPages, renderPage]);

  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))));
  const handleZoomReset = () => setScale(1);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale > 1.05 || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (window.getSelection()?.toString()) return;
    if (scale > 1.05 || !touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && currentPage < numPages) {
        goToPage(currentPage + 1);
      } else if (dx > 0 && currentPage > 1) {
        goToPage(currentPage - 1);
      }
    }
  };

  const clearSelectionUi = () => {
    window.getSelection()?.removeAllRanges();
    setPdfSelection(null);
    setNoteMode(false);
    setNoteText('');
  };

  const applyHighlight = (color: HighlightColor, comment?: string) => {
    if (!pdfSelection || !onCreateHighlight) return;
    onCreateHighlight(pdfSelection.quote, color, comment, {
      page: currentPage,
      rects: pdfSelection.rects,
    });
    clearSelectionUi();
  };

  // Clic sur un passage déjà surligné : ouvre sa note
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectAnnotation || window.getSelection()?.toString()) return;
    const layer = textLayerRef.current;
    if (!layer) return;
    const box = layer.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    const hit = (annotations || []).find(
      (a) =>
        a.page === currentPage &&
        a.rects?.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
    );
    if (hit) onSelectAnnotation(hit.id);
  };

  const pageHighlights = (annotations || []).filter(
    (a) => a.page === currentPage && a.rects && a.rects.length > 0
  );

  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') {
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft') {
        goToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, goToPage]);

  const barTheme =
    theme === 'light'
      ? 'bg-[#f8f6f0]/90 border-[#21392f]/15 text-[#1f3128]'
      : theme === 'sepia'
      ? 'bg-[#f1e7d3]/90 border-[#493825]/18 text-[#2f261b]'
      : 'bg-[#121a16]/90 border-[#e7ece8]/12 text-[#e7ece8]';

  const viewportBg =
    theme === 'light'
      ? 'bg-[#dfe5dc]'
      : theme === 'sepia'
      ? 'bg-[#d8ccb5]'
      : 'bg-[#101713]';

  return (
    <div ref={wrapperRef} className={`flex flex-col h-full w-full overflow-hidden ${viewportBg}`}>
      {/* Barre de contrôles PDF (glissable horizontalement sur mobile) */}
      <div className={`w-full overflow-x-auto no-scrollbar touch-pan-x flex items-center justify-between gap-3 px-3 sm:px-6 py-2 border-b text-xs shrink-0 ${barTheme}`}>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Page précédente"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Précédente</span>
          </button>

          <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-1.5">
            <label htmlFor="pdf-page-jump" className="sr-only">
              Aller à la page
            </label>
            <input
              id="pdf-page-jump"
              type="number"
              min={1}
              max={Math.max(1, numPages)}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageJumpSubmit}
              className="w-14 px-2 py-1 text-center font-mono tabular-nums rounded-md border border-current/25 bg-transparent focus:outline-none focus:ring-1 focus:ring-current"
            />
            <span className="font-mono tabular-nums opacity-75">/ {numPages || 1}</span>
          </form>

          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Page suivante"
          >
            <span>Suivante</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.5 || loading}
            className="p-1.5 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-40 transition-colors"
            title="Zoom arrière (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono tabular-nums w-12 text-center font-medium">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 2.5 || loading}
            className="p-1.5 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-40 transition-colors"
            title="Zoom avant (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 transition-colors whitespace-nowrap shrink-0"
            title="Ajuster proportionnellement à la page"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Ajuster</span>
          </button>
        </div>

        {/* Mode nocturne & Plein écran */}
        <div className="flex items-center gap-2 shrink-0">
          {theme === 'dark' && (
            <button
              type="button"
              onClick={() => setInvertPageInDark((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                invertPageInDark
                  ? 'border-current/50 bg-current/15 font-medium'
                  : 'border-current/20 hover:border-current/40'
              }`}
            >
              <Contrast className="w-3.5 h-3.5" />
              <span>Mode nuit</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 transition-colors whitespace-nowrap shrink-0"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Réduire</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Plein écran</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Rendu du canvas PDF proportionné */}
      <div
        ref={viewportContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-auto flex justify-center items-center p-3 sm:p-6"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-xs opacity-70">
            <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
            <span>Ouverture du document...</span>
          </div>
        ) : errorMsg ? (
          <div className="max-w-md p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs">
            <p className="font-semibold mb-1">Lecture impossible</p>
            <p>{errorMsg}</p>
          </div>
        ) : (
          <div
            className="relative shadow-xl rounded-sm overflow-hidden border border-black/15 bg-white my-auto"
            onClick={handlePageClick}
          >
            <canvas
              ref={canvasRef}
              className={`block max-w-full h-auto transition-filter duration-200 ${
                theme === 'dark' && invertPageInDark ? 'invert hue-rotate-180 contrast-95' : ''
              }`}
            />
            <div className="pdf-highlight-layer" aria-hidden="true">
              {pageHighlights.map((a) =>
                (a.rects || []).map((r, i) => (
                  <div
                    key={`${a.id}-${i}`}
                    className="pdf-hl"
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: PDF_HIGHLIGHT_BG[a.highlightColor || 'yellow'],
                    }}
                  />
                ))
              )}
            </div>
            <div ref={textLayerRef} className="pdf-text-layer" />
          </div>
        )}
      </div>

      {/* Menu flottant de surlignage */}
      {pdfSelection && onCreateHighlight && (
        <div
          className="fixed z-[75] w-max max-w-[92vw] rounded-xl border border-white/15 bg-zinc-900/97 text-zinc-100 shadow-2xl p-2 flex flex-col gap-2"
          style={{
            left: Math.min(Math.max(pdfSelection.x, 130), window.innerWidth - 130),
            top: window.matchMedia('(pointer: coarse)').matches
              ? pdfSelection.bottom + 14
              : Math.max(8, pdfSelection.top - 56),
            transform: 'translateX(-50%)',
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={`Surligner en ${opt.label.toLowerCase()}`}
                aria-label={`Surligner en ${opt.label.toLowerCase()}`}
                onClick={() => applyHighlight(opt.id, noteMode ? noteText.trim() : undefined)}
                className={`w-8 h-8 rounded-full border-2 ${opt.swatchClass} active:scale-90 transition-transform`}
              />
            ))}
            <button
              type="button"
              onClick={() => setNoteMode((v) => !v)}
              className={`ml-1 px-2.5 h-8 rounded-lg border text-xs font-medium ${
                noteMode ? 'border-white/50 bg-white/15' : 'border-white/20 hover:border-white/40'
              }`}
            >
              + Note
            </button>
            <button
              type="button"
              onClick={clearSelectionUi}
              aria-label="Annuler"
              className="px-2 h-8 rounded-lg text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
          {noteMode && (
            <input
              type="text"
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyHighlight('yellow', noteText.trim());
                }
              }}
              placeholder="Votre note… puis choisissez une couleur"
              className="w-full min-w-[220px] h-9 rounded-lg bg-zinc-800 border border-white/15 px-3 text-xs text-zinc-100 outline-none focus:border-white/40"
            />
          )}
        </div>
      )}
    </div>
  );
};
