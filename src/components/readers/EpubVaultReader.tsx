import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  List,
  MessageSquarePlus,
} from 'lucide-react';
import {
  EpubNavigationItem,
  JSZipInstance,
  ReaderTheme,
  ReadingProgress,
} from '../../types/vault';
import {
  normalizeXhtmlForHtmlParser,
  stripHtmlAndDecodeEntities,
} from '../../utils/metadataCleaner';

export interface EpubLocationSnapshot {
  percentage: number;
  cfi?: string;
  chapterIndex: number;
  chapterLabel: string;
  locationLabel: string;
}

export interface EpubJumpTarget {
  timestamp: number;
  cfi?: string;
  chapterIndex?: number;
}

interface EpubVaultReaderProps {
  buffer: ArrayBuffer;
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: string;
  initialProgress: ReadingProgress;
  jumpTarget: EpubJumpTarget | null;
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: EpubLocationSnapshot) => void;
  onQuickAnnotateSelection?: (selectedText: string) => void;
}

interface ParsedSpineChapter {
  id: string;
  href: string;
  title: string;
  htmlContent: string;
  pages: string[];
}

interface FlattenedBookPage {
  globalPageIndex: number;
  chapterIndex: number;
  chapterTitle: string;
  pageInChapter: number;
  totalPagesInChapter: number;
  htmlContent: string;
}

const CONTAINER_TAGS = new Set([
  'body',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'center',
]);

/**
 * Déplie récursivement les conteneurs <div> / <section> imbriqués (très fréquents dans Calibre)
 * afin d'obtenir une liste plate de paragraphes et titres lisibles pour la pagination.
 */
function collectReadableBlocks(root: HTMLElement): string[] {
  const blocks: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt.length > 0) {
        const escaped = txt
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        blocks.push(`<p>${escaped}</p>`);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (
      tag === 'script' ||
      tag === 'style' ||
      tag === 'head' ||
      tag === 'meta' ||
      tag === 'link' ||
      tag === 'svg' ||
      tag === 'img' ||
      tag === 'image'
    ) {
      return;
    }

    const hasBlockChildren = Array.from(el.children).some((child) => {
      const cTag = child.tagName.toLowerCase();
      return (
        CONTAINER_TAGS.has(cTag) ||
        cTag === 'p' ||
        cTag === 'blockquote' ||
        cTag === 'ul' ||
        cTag === 'ol' ||
        cTag === 'table' ||
        /^h[1-6]$/.test(cTag)
      );
    });

    if (CONTAINER_TAGS.has(tag) && hasBlockChildren) {
      Array.from(el.childNodes).forEach(walk);
      return;
    }

    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    if (CONTAINER_TAGS.has(tag)) {
      blocks.push(`<p>${el.innerHTML}</p>`);
    } else {
      blocks.push(el.outerHTML);
    }
  }

  Array.from(root.childNodes).forEach(walk);
  return blocks;
}

/**
 * Nettoie le XHTML d'un chapitre ePub après normalisation des balises auto-fermantes XML,
 * supprime les styles inline qui bloqueraient le changement de police/taille,
 * et découpe le chapitre en pages équilibrées.
 */
function cleanAndPaginateXhtml(
  rawXhtml: string,
  index: number,
  tocTitleHint?: string
): { title: string; bodyHtml: string; pages: string[]; textLength: number } {
  const normalizedHtml = normalizeXhtmlForHtmlParser(rawXhtml);
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedHtml, 'text/html');

  doc
    .querySelectorAll('head, script, iframe, object, embed, style, link, meta, svg, img, image')
    .forEach((n) => n.remove());

  doc.body?.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('face');
    el.removeAttribute('size');
    el.removeAttribute('color');
    el.removeAttribute('width');
    el.removeAttribute('height');
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  const headingNode = doc.body?.querySelector('h1, h2, h3, h4');
  const headingText = stripHtmlAndDecodeEntities(headingNode?.textContent);
  const cleanTitle =
    tocTitleHint ||
    (headingText && headingText.length <= 120 ? headingText : '') ||
    `Chapitre ${index + 1}`;

  const blocks = doc.body ? collectReadableBlocks(doc.body) : [];
  const plainText = stripHtmlAndDecodeEntities(blocks.join(' '));

  const pages: string[] = [];
  const TARGET_CHARS_PER_PAGE = 1600;
  let currentBucket: string[] = [];
  let currentCharCount = 0;

  blocks.forEach((blockHtml) => {
    const blockLen = stripHtmlAndDecodeEntities(blockHtml).length;
    if (blockLen === 0) return;

    if (currentCharCount > 0 && currentCharCount + blockLen > TARGET_CHARS_PER_PAGE) {
      pages.push(currentBucket.join('\n'));
      currentBucket = [blockHtml];
      currentCharCount = blockLen;
    } else {
      currentBucket.push(blockHtml);
      currentCharCount += blockLen;
    }
  });

  if (currentBucket.length > 0) {
    pages.push(currentBucket.join('\n'));
  }

  const fullBodyHtml = blocks.join('\n');

  return {
    title: cleanTitle,
    bodyHtml: fullBodyHtml,
    pages,
    textLength: plainText.length,
  };
}

/**
 * Résout un chemin relatif dans l'archive ZIP ePub de manière insensible à la casse et aux "./" ou "../".
 */
function findZipFile(archive: JSZipInstance, baseDir: string, relHref: string) {
  const cleanRel = relHref.split('#')[0].split('?')[0];
  const decodedRel = decodeURIComponent(cleanRel);

  const normalizePath = (p: string) => {
    const parts = p.split('/');
    const stack: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  };

  const candidates = [
    normalizePath(`${baseDir}${cleanRel}`),
    normalizePath(`${baseDir}${decodedRel}`),
    normalizePath(cleanRel),
    normalizePath(decodedRel),
  ];

  for (const candidate of candidates) {
    if (archive.file(candidate)) {
      return archive.file(candidate);
    }
  }

  const allKeys = Object.keys(archive.files);
  for (const candidate of candidates) {
    const lowerCandidate = candidate.toLowerCase();
    const matchedKey = allKeys.find(
      (k) =>
        k.toLowerCase() === lowerCandidate ||
        k.toLowerCase().endsWith(`/${lowerCandidate}`)
    );
    if (matchedKey && archive.file(matchedKey)) {
      return archive.file(matchedKey);
    }
  }

  return null;
}

/**
 * Extrait une table de correspondance href -> titre depuis toc.ncx ou nav.xhtml.
 */
async function extractTocTitleMap(
  archive: JSZipInstance,
  baseDir: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const allKeys = Object.keys(archive.files);

  // 1. Recherche d'un fichier .ncx
  const ncxKey = allKeys.find((k) => k.toLowerCase().endsWith('.ncx'));
  if (ncxKey && archive.file(ncxKey)) {
    try {
      const ncxXml = await archive.file(ncxKey)!.async('string');
      const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
      const navPoints = Array.from(ncxDoc.getElementsByTagName('navPoint'));
      navPoints.forEach((np) => {
        const textNode = np.getElementsByTagName('text')[0];
        const contentNode = np.getElementsByTagName('content')[0];
        const label = stripHtmlAndDecodeEntities(textNode?.textContent);
        const src = contentNode?.getAttribute('src');
        if (label && src) {
          const cleanSrc = decodeURIComponent(src.split('#')[0]).split('/').pop() || '';
          if (cleanSrc && !map.has(cleanSrc)) {
            map.set(cleanSrc, label);
          }
        }
      });
    } catch {
      // Ignorer
    }
  }

  // 2. Recherche d'un fichier nav.xhtml / toc.xhtml
  const navKey = allKeys.find((k) => /(^|\/)(nav|toc)\.(xhtml|html)$/i.test(k));
  if (navKey && archive.file(navKey)) {
    try {
      const navRaw = await archive.file(navKey)!.async('string');
      const navDoc = new DOMParser().parseFromString(
        normalizeXhtmlForHtmlParser(navRaw),
        'text/html'
      );
      navDoc.querySelectorAll('a[href]').forEach((a) => {
        const label = stripHtmlAndDecodeEntities(a.textContent);
        const href = a.getAttribute('href') || '';
        const cleanHref = decodeURIComponent(href.split('#')[0]).split('/').pop() || '';
        if (label && cleanHref && !map.has(cleanHref)) {
          map.set(cleanHref, label);
        }
      });
    } catch {
      // Ignorer
    }
  }

  void baseDir;
  return map;
}

export const EpubVaultReader: React.FC<EpubVaultReaderProps> = ({
  buffer,
  theme,
  fontSize,
  fontFamily,
  initialProgress,
  jumpTarget,
  onProgressChange,
  onLocationSnapshot,
  onQuickAnnotateSelection,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [toc, setToc] = useState<EpubNavigationItem[]>([]);
  const [spineChapters, setSpineChapters] = useState<ParsedSpineChapter[]>([]);

  const [viewMode, setViewMode] = useState<'paginated' | 'single-page'>('paginated');
  const [currentGlobalPage, setCurrentGlobalPage] = useState<number>(0);

  const [showTocDrawer, setShowTocDrawer] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const allBookPages = useMemo<FlattenedBookPage[]>(() => {
    const list: FlattenedBookPage[] = [];
    spineChapters.forEach((ch, chIdx) => {
      ch.pages.forEach((pageHtml, pIdx) => {
        list.push({
          globalPageIndex: list.length,
          chapterIndex: chIdx,
          chapterTitle: ch.title,
          pageInChapter: pIdx + 1,
          totalPagesInChapter: ch.pages.length,
          htmlContent: pageHtml,
        });
      });
    });
    return list;
  }, [spineChapters]);

  const extractSpineViaJsZip = useCallback(async (rawBuffer: ArrayBuffer) => {
    if (!window.JSZip) {
      throw new Error('La bibliothèque JSZip n’est pas chargée.');
    }
    const zip = new window.JSZip();
    const archive = await zip.loadAsync(rawBuffer.slice(0));

    let opfPath = '';
    const containerFile = archive.file('META-INF/container.xml');
    if (containerFile) {
      const containerXml = await containerFile.async('string');
      const match = containerXml.match(/full-path=["']([^"']+)["']/i);
      if (match?.[1]) {
        opfPath = match[1];
      }
    }

    if (!opfPath) {
      const opfKey = Object.keys(archive.files).find((k) =>
        k.toLowerCase().endsWith('.opf')
      );
      if (opfKey) opfPath = opfKey;
    }

    const baseDir = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';

    const tocTitleMap = await extractTocTitleMap(archive, baseDir);
    const chapters: ParsedSpineChapter[] = [];

    if (opfPath && archive.file(opfPath)) {
      const opfXml = await archive.file(opfPath)!.async('string');
      const parser = new DOMParser();
      const opfDoc = parser.parseFromString(opfXml, 'application/xml');

      const manifestMap = new Map<string, string>();
      const manifestItems = Array.from(opfDoc.getElementsByTagName('item'));
      manifestItems.forEach((item) => {
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        if (id && href) manifestMap.set(id, href);
      });

      const itemRefs = Array.from(opfDoc.getElementsByTagName('itemref'));
      for (let i = 0; i < itemRefs.length; i++) {
        const idref = itemRefs[i].getAttribute('idref');
        if (!idref) continue;
        const relHref = manifestMap.get(idref);
        if (!relHref) continue;

        const fileObj = findZipFile(archive, baseDir, relHref);
        if (fileObj) {
          const rawXhtml = await fileObj.async('string');
          const fileBasename =
            decodeURIComponent(relHref.split('#')[0]).split('/').pop() || '';
          const tocHint = tocTitleMap.get(fileBasename);

          const { title, bodyHtml, pages, textLength } = cleanAndPaginateXhtml(
            rawXhtml,
            chapters.length,
            tocHint
          );

          if (textLength > 0 && pages.length > 0) {
            chapters.push({
              id: idref,
              href: relHref,
              title,
              htmlContent: bodyHtml,
              pages,
            });
          }
        }
      }
    }

    // Fallback si aucun spine OPF n'a retourné de chapitres
    if (chapters.length === 0) {
      const htmlKeys = Object.keys(archive.files)
        .filter((k) => /\.(xhtml|html|htm)$/i.test(k) && !/(^|\/)(nav|toc)\./i.test(k))
        .sort();

      for (let i = 0; i < htmlKeys.length; i++) {
        const fileObj = archive.file(htmlKeys[i]);
        if (!fileObj) continue;
        const rawXhtml = await fileObj.async('string');
        const fileBasename = htmlKeys[i].split('/').pop() || '';
        const tocHint = tocTitleMap.get(fileBasename);

        const { title, bodyHtml, pages, textLength } = cleanAndPaginateXhtml(
          rawXhtml,
          chapters.length,
          tocHint
        );

        if (textLength > 0 && pages.length > 0) {
          chapters.push({
            id: `ch-${i}`,
            href: htmlKeys[i],
            title,
            htmlContent: bodyHtml,
            pages,
          });
        }
      }
    }

    return chapters;
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);

    async function loadEpubBook() {
      try {
        const extractedChapters = await extractSpineViaJsZip(buffer);
        if (!isMounted) return;

        if (extractedChapters.length === 0) {
          throw new Error('Aucun contenu textuel lisible détecté dans ce fichier ePub.');
        }

        setSpineChapters(extractedChapters);
        const builtToc: EpubNavigationItem[] = extractedChapters.map((ch, idx) => ({
          id: ch.id,
          href: ch.href,
          label: ch.title || `Chapitre ${idx + 1}`,
        }));
        setToc(builtToc);

        const totalPagesCount = extractedChapters.reduce(
          (sum, c) => sum + c.pages.length,
          0
        );

        let startGlobalPage = 0;
        if (
          typeof initialProgress.page === 'number' &&
          initialProgress.page >= 1 &&
          initialProgress.page <= totalPagesCount
        ) {
          startGlobalPage = initialProgress.page - 1;
        } else if (typeof initialProgress.chapterIndex === 'number') {
          let accumulated = 0;
          for (
            let i = 0;
            i < Math.min(initialProgress.chapterIndex, extractedChapters.length - 1);
            i++
          ) {
            accumulated += extractedChapters[i].pages.length;
          }
          startGlobalPage = accumulated;
        }

        setCurrentGlobalPage(startGlobalPage);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMsg(err?.message || 'Impossible de lire ce fichier ePub.');
        setLoading(false);
      }
    }

    loadEpubBook();

    return () => {
      isMounted = false;
    };
  }, [buffer, extractSpineViaJsZip]);

  const goToGlobalPage = useCallback(
    (targetPageIdx: number) => {
      if (allBookPages.length === 0) return;
      const clamped = Math.min(
        Math.max(0, targetPageIdx),
        allBookPages.length - 1
      );
      setCurrentGlobalPage(clamped);

      if (scrollContainerRef.current && viewMode === 'paginated') {
        scrollContainerRef.current.scrollTop = 0;
      }

      const activePage = allBookPages[clamped];
      if (!activePage) return;

      const pct = Math.round(((clamped + 1) / allBookPages.length) * 100);
      const locationText = `${activePage.chapterTitle} (p. ${clamped + 1}/${allBookPages.length})`;

      onProgressChange({
        chapterIndex: activePage.chapterIndex,
        chapterLabel: activePage.chapterTitle,
        page: clamped + 1,
        totalPages: allBookPages.length,
        percentage: pct,
      });

      if (onLocationSnapshot) {
        onLocationSnapshot({
          percentage: pct,
          chapterIndex: activePage.chapterIndex,
          chapterLabel: activePage.chapterTitle,
          locationLabel: locationText,
        });
      }
    },
    [allBookPages, viewMode, onProgressChange, onLocationSnapshot]
  );

  // Navigation clavier avec les flèches Gauche et Droite
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (viewMode === 'paginated') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goToGlobalPage(currentGlobalPage + 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goToGlobalPage(currentGlobalPage - 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, currentGlobalPage, goToGlobalPage]);

  useEffect(() => {
    if (!jumpTarget || allBookPages.length === 0) return;
    if (typeof jumpTarget.chapterIndex === 'number') {
      const targetChapterIdx = Math.min(
        Math.max(0, jumpTarget.chapterIndex),
        Math.max(0, spineChapters.length - 1)
      );

      if (viewMode === 'single-page') {
        const el = scrollContainerRef.current?.querySelector(
          `#epub-full-chapter-${targetChapterIdx}`
        );
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        const firstPageForChapter = allBookPages.findIndex(
          (p) => p.chapterIndex === targetChapterIdx
        );
        if (firstPageForChapter >= 0) {
          goToGlobalPage(firstPageForChapter);
        }
      }
    }
  }, [jumpTarget, allBookPages, spineChapters.length, viewMode, goToGlobalPage]);

  const handleTocClick = (chapterIdx: number) => {
    setShowTocDrawer(false);
    if (viewMode === 'single-page') {
      const el = scrollContainerRef.current?.querySelector(
        `#epub-full-chapter-${chapterIdx}`
      );
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const ch = spineChapters[chapterIdx];
      if (ch) {
        const pct = Math.round(((chapterIdx + 1) / spineChapters.length) * 100);
        onProgressChange({
          chapterIndex: chapterIdx,
          chapterLabel: ch.title,
          percentage: pct,
        });
      }
    } else {
      const pageIdx = allBookPages.findIndex((p) => p.chapterIndex === chapterIdx);
      if (pageIdx >= 0) {
        goToGlobalPage(pageIdx);
      }
    }
  };

  const handleSinglePageScroll = () => {
    if (viewMode !== 'single-page') return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const ratio = maxScroll <= 0 ? 1 : Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    const pct = Math.round(ratio * 100);
    const approxChapterIdx = Math.min(
      spineChapters.length - 1,
      Math.floor(ratio * spineChapters.length)
    );
    const activeTitle =
      spineChapters[approxChapterIdx]?.title || 'Livre complet';

    onProgressChange({
      percentage: pct,
      scrollRatio: Number(ratio.toFixed(4)),
      chapterIndex: approxChapterIdx,
      chapterLabel: activeTitle,
    });

    if (onLocationSnapshot) {
      onLocationSnapshot({
        percentage: pct,
        chapterIndex: approxChapterIdx,
        chapterLabel: activeTitle,
        locationLabel: `${activeTitle} (${pct}%)`,
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

  const activePageObj = allBookPages[currentGlobalPage] || allBookPages[0];

  const themeSurface =
    theme === 'light'
      ? 'bg-stone-100/80 text-zinc-900'
      : theme === 'sepia'
      ? 'bg-[#efe4c8] text-[#3b2f2f]'
      : 'bg-zinc-950 text-zinc-100';

  const pageCardSurface =
    theme === 'light'
      ? 'bg-white border-zinc-200/90 text-zinc-900 shadow-xs'
      : theme === 'sepia'
      ? 'bg-[#f7f0df] border-[#d8c8a8] text-[#322727] shadow-xs'
      : 'bg-zinc-900/80 border-zinc-800/90 text-zinc-100';

  const barSurface =
    theme === 'light'
      ? 'bg-white border-zinc-200 text-zinc-700'
      : theme === 'sepia'
      ? 'bg-[#e9dec0] border-[#d8c8a8] text-[#3b2f2f]'
      : 'bg-zinc-900 border-zinc-800/80 text-zinc-300';

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden transition-colors duration-200 ${themeSurface}`}>
      {/* Barre secondaire ePub */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-2 border-b text-xs shrink-0 ${barSurface}`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setShowTocDrawer((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showTocDrawer
                ? 'border-current/50 bg-current/15'
                : 'border-current/20 hover:border-current/40'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Chapitres ({toc.length})</span>
          </button>

          {activePageObj && (
            <span className="inline-flex items-center gap-1.5 truncate opacity-85">
              <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate font-medium">
                {activePageObj.chapterTitle}
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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

          {/* Bascule Par page (Flèches ←/→) vs Livre entier sur la même page */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-current/20">
            <button
              type="button"
              onClick={() => setViewMode('paginated')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'paginated'
                  ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Tourner les pages avec les flèches gauche et droite du clavier"
            >
              <Layers className="w-3 h-3" />
              <span>Par page (← / →)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('single-page')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'single-page'
                  ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Ouvrir tout le livre sur une seule et même page"
            >
              <FileText className="w-3 h-3" />
              <span>Livre entier (même page)</span>
            </button>
          </div>

          {viewMode === 'paginated' && allBookPages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToGlobalPage(currentGlobalPage - 1)}
                disabled={currentGlobalPage <= 0 || loading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Page précédente (Flèche gauche)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Précédente</span>
              </button>

              <span className="font-mono tabular-nums px-1.5 opacity-80">
                {currentGlobalPage + 1} / {allBookPages.length}
              </span>

              <button
                type="button"
                onClick={() => goToGlobalPage(currentGlobalPage + 1)}
                disabled={currentGlobalPage >= allBookPages.length - 1 || loading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-current/20 hover:border-current/40 disabled:opacity-35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Page suivante (Flèche droite)"
              >
                <span className="hidden sm:inline">Suivante</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Zone de lecture */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative" onMouseUp={handleMouseUp}>
        {showTocDrawer && (
          <aside
            className={`w-64 border-r overflow-y-auto p-5 shrink-0 z-20 ${
              theme === 'light'
                ? 'bg-white border-zinc-200'
                : theme === 'sepia'
                ? 'bg-[#efe4c8] border-[#d8c8a8]'
                : 'bg-zinc-900 border-zinc-800'
            }`}
          >
            <p className="text-xs font-semibold tracking-tight opacity-70 mb-3">
              Table des matières
            </p>
            <nav className="space-y-1">
              {toc.map((item, idx) => {
                const isCurrent =
                  activePageObj && activePageObj.chapterIndex === idx;
                return (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    onClick={() => handleTocClick(idx)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      isCurrent
                        ? 'bg-current/15 font-semibold'
                        : 'hover:bg-current/5 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span className="truncate">{item.label.trim()}</span>
                    <span className="font-mono text-[11px] opacity-60 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleSinglePageScroll}
          className="flex-1 h-full overflow-y-auto relative flex justify-center items-start px-4 sm:px-8 py-6 sm:py-10"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-xs opacity-70">
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
              <span>Ouverture du livre...</span>
            </div>
          ) : errorMsg ? (
            <div className="max-w-md mx-auto my-16 p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs">
              <p className="font-semibold mb-1">Lecture impossible</p>
              <p>{errorMsg}</p>
            </div>
          ) : viewMode === 'paginated' && activePageObj ? (
            <div className="w-full max-w-4xl flex items-center justify-center gap-3 sm:gap-6 my-auto">
              {/* Flèche latérale gauche */}
              <button
                type="button"
                onClick={() => goToGlobalPage(currentGlobalPage - 1)}
                disabled={currentGlobalPage <= 0}
                className="hidden md:flex w-11 h-24 rounded-xl border border-current/15 hover:border-current/35 items-center justify-center disabled:opacity-20 transition-all shrink-0 cursor-pointer"
                title="Page précédente (Flèche gauche ←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Feuillet de livre resserré */}
              <div
                className={`w-full max-w-[60ch] rounded-2xl border px-7 sm:px-12 py-8 sm:py-12 transition-all ${pageCardSurface}`}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily,
                }}
              >
                <div className="flex items-center justify-between text-[11px] opacity-55 pb-4 mb-6 border-b border-current/10 font-sans">
                  <span className="truncate max-w-xs">{activePageObj.chapterTitle}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    Chapitre {activePageObj.chapterIndex + 1} · p. {activePageObj.pageInChapter}/
                    {activePageObj.totalPagesInChapter}
                  </span>
                </div>

                <article
                  className="vault-prose"
                  style={{
                    fontSize: `${fontSize}px`,
                    fontFamily,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: activePageObj.htmlContent,
                  }}
                />

                <div className="mt-10 pt-5 border-t border-current/10 flex items-center justify-between text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => goToGlobalPage(currentGlobalPage - 1)}
                    disabled={currentGlobalPage <= 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Page précédente</span>
                  </button>

                  <span className="font-mono tabular-nums opacity-60">
                    Page {currentGlobalPage + 1} sur {allBookPages.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => goToGlobalPage(currentGlobalPage + 1)}
                    disabled={currentGlobalPage >= allBookPages.length - 1}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <span>Page suivante</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Flèche latérale droite */}
              <button
                type="button"
                onClick={() => goToGlobalPage(currentGlobalPage + 1)}
                disabled={currentGlobalPage >= allBookPages.length - 1}
                className="hidden md:flex w-11 h-24 rounded-xl border border-current/15 hover:border-current/35 items-center justify-center disabled:opacity-20 transition-all shrink-0 cursor-pointer"
                title="Page suivante (Flèche droite →)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div
              className={`w-full max-w-[60ch] rounded-2xl border px-7 sm:px-12 py-8 sm:py-12 ${pageCardSurface}`}
              style={{
                fontSize: `${fontSize}px`,
                fontFamily,
              }}
            >
              {spineChapters.map((chapter, idx) => (
                <section
                  key={chapter.id}
                  id={`epub-full-chapter-${idx}`}
                  className={idx > 0 ? 'mt-12 pt-10 border-t border-current/15' : ''}
                >
                  <div className="text-[11px] font-mono opacity-50 mb-3 font-sans">
                    {chapter.title} ({idx + 1} / {spineChapters.length})
                  </div>
                  <article
                    className="vault-prose"
                    style={{
                      fontSize: `${fontSize}px`,
                      fontFamily,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: chapter.htmlContent,
                    }}
                  />
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
