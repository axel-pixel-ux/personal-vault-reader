import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, BookOpen, List, MessageSquarePlus } from 'lucide-react';
import { DocumentFormat, ReaderTheme, ReadingProgress } from '../../types/vault';

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
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: TextLocationSnapshot) => void;
  onQuickAnnotateSelection?: (selectedText: string) => void;
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
  onProgressChange,
  onLocationSnapshot,
  onQuickAnnotateSelection,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
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
    if (sel.length >= 3 && sel.length <= 400) {
      setSelectedQuote(sel);
    } else {
      setSelectedQuote('');
    }
  };

  const scrollToHeading = (id: string, title: string) => {
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
      ? 'bg-stone-50 text-zinc-900'
      : theme === 'sepia'
      ? 'bg-[#f4ecd8] text-[#3b2f2f]'
      : 'bg-zinc-950 text-zinc-100';

  const subBarSurface =
    theme === 'light'
      ? 'bg-white/90 border-zinc-200 text-zinc-600'
      : theme === 'sepia'
      ? 'bg-[#efe4c8]/90 border-[#d8c8a8] text-[#4a3b3b]'
      : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400';

  const wordCount = useMemo(() => {
    const trimmed = rawText.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [rawText]);

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 220));

  return (
    <div className={`relative flex flex-col h-full w-full overflow-hidden transition-colors duration-200 ${themeSurface}`}>
      {/* Barre secondaire */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-2 border-b text-xs shrink-0 ${subBarSurface}`}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <BookOpen className="w-3.5 h-3.5 opacity-70" />
            <span>{format === 'md' ? 'Markdown' : 'Texte'}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{wordCount.toLocaleString('fr-FR')} mots</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">~{readingTimeMin} min</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedQuote && onQuickAnnotateSelection && (
            <button
              type="button"
              onClick={() => {
                onQuickAnnotateSelection(selectedQuote);
                setSelectedQuote('');
                window.getSelection()?.removeAllRanges();
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Annoter la sélection</span>
            </button>
          )}

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

      {/* Corps principal */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {format === 'md' && showOutline && headings.length > 0 && (
          <aside
            className={`w-64 border-r overflow-y-auto p-5 shrink-0 ${
              theme === 'light'
                ? 'bg-white border-zinc-200'
                : theme === 'sepia'
                ? 'bg-[#efe4c8] border-[#d8c8a8]'
                : 'bg-zinc-900/60 border-zinc-800'
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
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          onMouseUp={handleMouseUp}
          className="flex-1 overflow-y-auto px-6 sm:px-12 py-10 sm:py-14"
        >
          <article
            style={{
              fontSize: `${fontSize}px`,
              fontFamily,
            }}
            className="max-w-[60ch] mx-auto transition-all duration-150"
          >
            {format === 'md' ? (
              <div
                className="vault-prose"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily,
                }}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="space-y-5 leading-[1.8]">
                {paragraphs.map((para, index) => (
                  <p key={index} className="whitespace-pre-wrap break-words">
                    {para}
                  </p>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  );
};
