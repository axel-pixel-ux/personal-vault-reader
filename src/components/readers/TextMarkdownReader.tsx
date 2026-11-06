import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  BookOpen,
  Highlighter,
  List,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import {
  DocumentFormat,
  HighlightColor,
  ReaderTheme,
  ReadingProgress,
  VaultAnnotation,
} from '../../types/vault';
import {
  applyHighlightsToHtml,
  HIGHLIGHT_COLOR_OPTIONS,
} from '../../utils/highlightHtml';

export interface TextLocationSnapshot {
  percentage: number;
  locationLabel: string;
  scrollRatio: number;
  chapterLabel?: string;
}

export interface TextJumpTarget {
  timestamp: number;
  scrollRatio?: number;
}

interface TextMarkdownReaderProps {
  buffer: ArrayBuffer;
  format: DocumentFormat;
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: string;
  initialProgress: ReadingProgress;
  jumpTarget: TextJumpTarget | null;
  annotations?: VaultAnnotation[];
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: TextLocationSnapshot) => void;
  onQuickAnnotateSelection?: (selectedText: string, color?: HighlightColor) => void;
  onCreateHighlight?: (
    quote: string,
    color: HighlightColor,
    comment?: string
  ) => void;
  onSelectAnnotation?: (annotationId: string) => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

function sanitizeHtml(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const forbidden = doc.querySelectorAll('script, iframe, object, embed, form, meta, head, style');
  forbidden.forEach((el) => el.remove());

  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = attr.value.toLowerCase().trim();
      if (name.startsWith('on') || val.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}

export const TextMarkdownReader: React.FC<TextMarkdownReaderProps> = ({
  buffer,
  format,
  theme,
  fontSize,
  fontFamily,
  initialProgress,
  jumpTarget,
  annotations,
  onProgressChange,
  onLocationSnapshot,
  onQuickAnnotateSelection,
  onCreateHighlight,
  onSelectAnnotation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastJumpTimestampRef = useRef<number>(0);
  const [showOutline, setShowOutline] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [showInlineNoteBox, setShowInlineNoteBox] = useState<boolean>(false);
  const [inlineNoteText, setInlineNoteText] = useState<string>('');
  const hasRestoredScroll = useRef<boolean>(false);

  const rawText = useMemo(() => {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }, [buffer]);

  const { renderedHtml, headings } = useMemo(() => {
    if (format !== 'md') {
      return { renderedHtml: '', headings: [] as HeadingItem[] };
    }

    let html = '';
    if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(rawText, {
        async: false,
        breaks: true,
        gfm: true,
      });
    } else {
      html = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>');
      html = `<p>${html}</p>`;
    }

    const cleanHtml = sanitizeHtml(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');
    const extractedHeadings: HeadingItem[] = [];

    doc.querySelectorAll('h1, h2, h3').forEach((heading, idx) => {
      const id = `vault-heading-${idx}`;
      heading.setAttribute('id', id);
      extractedHeadings.push({
        id,
        text: heading.textContent || `Section ${idx + 1}`,
        level: Number(heading.tagName.replace('H', '')),
      });
    });

    return {
      renderedHtml: doc.body.innerHTML,
      headings: extractedHeadings,
    };
  }, [rawText, format]);

  const paragraphs = useMemo(() => {
    if (format !== 'txt') return [];
    return rawText.replace(/\r\n/g, '\n').split(/\n{2,}/);
  }, [rawText, format]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasRestoredScroll.current) return;

    const timer = window.setTimeout(() => {
      const ratio =
        typeof initialProgress.scrollRatio === 'number'
          ? initialProgress.scrollRatio
          : initialProgress.percentage > 0
          ? initialProgress.percentage / 100
          : 0;

      if (ratio > 0) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) {
          el.scrollTop = Math.round(ratio * maxScroll);
        }
      }
      hasRestoredScroll.current = true;
    }, 80);

    return () => window.clearTimeout(timer);
  }, [initialProgress.scrollRatio, initialProgress.percentage]);

  useEffect(() => {
    if (!jumpTarget || typeof jumpTarget.scrollRatio !== 'number') return;
    if (lastJumpTimestampRef.current === jumpTarget.timestamp) return;
    lastJumpTimestampRef.current = jumpTarget.timestamp;
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) {
      el.scrollTo({
        top: Math.round(jumpTarget.scrollRatio * maxScroll),
        behavior: 'smooth',
      });
    }
  }, [jumpTarget]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const ratio = maxScroll <= 0 ? 1 : Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    const percentage = Math.round(ratio * 100);
    const roundedRatio = Number(ratio.toFixed(4));

    onProgressChange({
      percentage,
      scrollRatio: roundedRatio,
    });

    if (onLocationSnapshot) {
      onLocationSnapshot({
        percentage,
        scrollRatio: roundedRatio,
        locationLabel: `Position ${percentage}%`,
      });
    }
  };

  const handleMouseUp = () => {
    const sel = window.getSelection()?.toString().trim() || '';
    if (sel.length >= 3 && sel.length <= 500) {
      setSelectedQuote(sel);
    }
  };

  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const markEl = target.closest('mark[data-annotation-id]') as HTMLElement | null;
    if (markEl) {
      const annId = markEl.getAttribute('data-annotation-id');
      if (annId && onSelectAnnotation) {
        onSelectAnnotation(annId);
      }
    }
  };

  const handleApplyHighlight = (color: HighlightColor, withNote = false) => {
    if (!selectedQuote) return;
    if (withNote) {
      setSelectedColor(color);
      setShowInlineNoteBox(true);
      return;
    }
    if (onCreateHighlight) {
      onCreateHighlight(selectedQuote, color);
    } else if (onQuickAnnotateSelection) {
      onQuickAnnotateSelection(selectedQuote, color);
    }
    setSelectedQuote('');
    setShowInlineNoteBox(false);
    setInlineNoteText('');
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveInlineNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuote) return;
    if (onCreateHighlight) {
      onCreateHighlight(selectedQuote, selectedColor, inlineNoteText.trim());
    } else if (onQuickAnnotateSelection) {
      onQuickAnnotateSelection(selectedQuote, selectedColor);
    }
    setSelectedQuote('');
    setShowInlineNoteBox(false);
    setInlineNoteText('');
    window.getSelection()?.removeAllRanges();
  };

  const scrollToHeading = (id: string, title: string) => {
    if (window.innerWidth < 768) {
      setShowOutline(false);
    }
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (onLocationSnapshot) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        const ratio =
          maxScroll <= 0 ? 0 : Math.min(1, Math.max(0, container.scrollTop / maxScroll));
        onLocationSnapshot({
          percentage: Math.round(ratio * 100),
          scrollRatio: Number(ratio.toFixed(4)),
          locationLabel: title,
          chapterLabel: title,
        });
      }
    }
  };

  const themeSurface =
    theme === 'light'
      ? 'bg-[#dfe5dc] text-[#1f3128]'
      : theme === 'sepia'
      ? 'bg-[#d8ccb5] text-[#2f261b]'
      : 'bg-[#101713] text-[#e7ece8]';

  const subBarSurface =
    theme === 'light'
      ? 'bg-[#f8f6f0]/90 border-[#21392f]/15 text-[#1f3128]'
      : theme === 'sepia'
      ? 'bg-[#f1e7d3]/90 border-[#493825]/18 text-[#2f261b]'
      : 'bg-[#121a16]/90 border-[#e7ece8]/12 text-[#e7ece8]';

  const wordCount = useMemo(() => {
    const trimmed = rawText.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [rawText]);

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 220));

  return (
    <div className={`relative flex flex-col h-full w-full overflow-hidden transition-colors duration-200 ${themeSurface}`}>
      {/* Barre secondaire */}
      <div className={`w-full overflow-x-auto no-scrollbar touch-pan-x flex items-center justify-between gap-3 px-3 sm:px-6 py-2 border-b text-xs shrink-0 ${subBarSurface}`}>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <BookOpen className="w-3.5 h-3.5 opacity-70" />
            <span>{format === 'md' ? 'Markdown' : 'Texte'}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{wordCount.toLocaleString('fr-FR')} mots</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">~{readingTimeMin} min</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {format === 'md' && headings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOutline((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                showOutline
                  ? 'border-current/50 bg-current/10'
                  : 'border-current/20 hover:border-current/40'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Plan ({headings.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Barre contextuelle de surlignage et commentaire dès qu'un texte est sélectionné */}
      {selectedQuote && (
        <div
          className={`px-3 sm:px-6 py-2.5 border-b text-xs shrink-0 transition-all ${
            theme === 'light'
              ? 'bg-amber-50/90 border-amber-200 text-zinc-900'
              : theme === 'sepia'
              ? 'bg-[#e5d6b1] border-[#cbb88d] text-[#322727]'
              : 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
          }`}
        >
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Highlighter className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="italic truncate opacity-85">
                  « {selectedQuote} »
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="text-[11px] opacity-70 mr-0.5 hidden sm:inline">
                  Surligner :
                </span>
                {HIGHLIGHT_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleApplyHighlight(c.id, false)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-current/20 hover:border-current/50 bg-current/5 text-[11px] font-medium transition-all cursor-pointer"
                    title={`Surligner en ${c.label.toLowerCase()}`}
                  >
                    <span
                      className={`w-3 h-3 rounded-full border ${c.swatchClass}`}
                    />
                    <span className="hidden xs:inline">{c.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setShowInlineNoteBox((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    showInlineNoteBox
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>+ Commentaire</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuote('');
                    setShowInlineNoteBox(false);
                    setInlineNoteText('');
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {showInlineNoteBox && (
              <form
                onSubmit={handleSaveInlineNote}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1.5 border-t border-current/10"
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] opacity-75">Couleur :</span>
                  {HIGHLIGHT_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedColor(c.id)}
                      className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                        c.swatchClass
                      } ${
                        selectedColor === c.id
                          ? 'scale-115 ring-2 ring-current'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>

                <input
                  type="text"
                  value={inlineNoteText}
                  onChange={(e) => setInlineNoteText(e.target.value)}
                  placeholder="Écrivez votre commentaire ou note sur ce passage..."
                  autoFocus
                  className="flex-1 px-3 py-1.5 rounded-md border border-current/20 bg-transparent text-xs focus:outline-none focus:border-current/50"
                />

                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold cursor-pointer shrink-0"
                >
                  Enregistrer surlignage & note
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Corps principal */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {format === 'md' && showOutline && headings.length > 0 && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-20 md:hidden"
              onClick={() => setShowOutline(false)}
              aria-hidden="true"
            />
            <aside
              className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] md:static md:w-64 border-r overflow-y-auto p-5 shrink-0 z-30 shadow-2xl md:shadow-none ${
                theme === 'light'
                  ? 'bg-white border-zinc-200'
                  : theme === 'sepia'
                  ? 'bg-[#efe4c8] border-[#d8c8a8]'
                  : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-4 text-xs font-semibold tracking-tight opacity-70">
                <AlignLeft className="w-3.5 h-3.5" />
                <span>Sommaire</span>
              </div>
              <nav className="space-y-1">
                {headings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => scrollToHeading(h.id, h.text)}
                    className={`block w-full text-left text-xs py-1.5 px-2.5 rounded-md transition-colors hover:bg-current/10 truncate ${
                      h.level === 1
                        ? 'font-semibold'
                        : h.level === 2
                        ? 'pl-5 opacity-90'
                        : 'pl-8 opacity-75'
                    }`}
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            </aside>
          </>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          onMouseUp={handleMouseUp}
          className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 sm:py-10"
        >
          <article
            onClick={handleContentClick}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily,
            }}
            className={`max-w-[62ch] mx-auto rounded-xl sm:rounded-2xl border px-5 sm:px-12 py-7 sm:py-12 transition-all duration-150 ${
              theme === 'light'
                ? 'bg-[#fbfaf5] border-[#21392f]/15 text-[#1f3128] shadow-[0_24px_60px_rgba(14,24,19,0.12)]'
                : theme === 'sepia'
                ? 'bg-[#f2e8d3] border-[#493825]/18 text-[#2f261b] shadow-[0_24px_60px_rgba(14,24,19,0.12)]'
                : 'bg-[#19231e] border-[#e7ece8]/12 text-[#e7ece8] shadow-[0_24px_60px_rgba(0,0,0,0.35)]'
            }`}
          >
            {format === 'md' ? (
              <div
                className="vault-prose"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily,
                }}
                dangerouslySetInnerHTML={{
                  __html: applyHighlightsToHtml(renderedHtml, annotations),
                }}
              />
            ) : (
              <div className="space-y-5 leading-[1.8]">
                {paragraphs.map((para, index) => {
                  const escaped = para
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                  return (
                    <p
                      key={index}
                      className="whitespace-pre-wrap break-words"
                      dangerouslySetInnerHTML={{
                        __html: applyHighlightsToHtml(escaped, annotations),
                      }}
                    />
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  );
};
