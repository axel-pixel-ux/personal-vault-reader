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
import { PDFDocumentProxy, ReaderTheme, ReadingProgress } from '../../types/vault';

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
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: PdfLocationSnapshot) => void;
}

const PDF_WORKER_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const PdfVaultReader: React.FC<PdfVaultReaderProps> = ({
  buffer,
  theme,
  initialProgress,
  jumpTarget,
  onProgressChange,
  onLocationSnapshot,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialProgress.page || 1);
  const [pageInput, setPageInput] = useState<string>(String(initialProgress.page || 1));
  const [scale, setScale] = useState<number>(1.25);
  const [invertPageInDark, setInvertPageInDark] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    async (pageNumber: number, currentScale: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas || pageNumber < 1 || pageNumber > doc.numPages) return;

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignorer
          }
        }

        const page = await doc.getPage(pageNumber);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: currentScale * dpr });
        const displayViewport = page.getViewport({ scale: currentScale });

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
      goToPage(jumpTarget.page);
    }
  }, [jumpTarget, numPages, goToPage]);

  useEffect(() => {
    if (!loading && numPages > 0) {
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
  }, [currentPage, scale, loading, numPages, renderPage]);

  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, Number((s - 0.2).toFixed(2))));
  const handleZoomReset = () => setScale(1.25);

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
      ? 'bg-white border-zinc-200 text-zinc-700'
      : theme === 'sepia'
      ? 'bg-[#efe4c8] border-[#d8c8a8] text-[#3b2f2f]'
      : 'bg-zinc-900 border-zinc-800/80 text-zinc-300';

  const viewportBg =
    theme === 'light'
      ? 'bg-zinc-100'
      : theme === 'sepia'
      ? 'bg-[#e5d8b8]'
      : 'bg-zinc-950';

  return (
    <div ref={wrapperRef} className={`flex flex-col h-full w-full overflow-hidden ${viewportBg}`}>
      {/* Barre de contrôles PDF */}
      <div className={`flex flex-wrap items-center justify-between gap-4 px-6 py-2 border-b text-xs shrink-0 ${barTheme}`}>
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
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
            title="Ajuster le zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>125%</span>
          </button>
        </div>

        {/* Mode nocturne & Plein écran */}
        <div className="flex items-center gap-2">
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

      {/* Rendu du canvas PDF */}
      <div className="flex-1 overflow-auto flex justify-center items-start p-6 sm:p-10">
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
          <div className="shadow-xl rounded-xs overflow-hidden border border-black/15 bg-white">
            <canvas
              ref={canvasRef}
              className={`block transition-filter duration-200 ${
                theme === 'dark' && invertPageInDark ? 'invert hue-rotate-180 contrast-95' : ''
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
