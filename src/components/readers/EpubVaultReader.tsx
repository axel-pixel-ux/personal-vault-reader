import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Layers,
  List,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import {
  EpubNavigationItem,
  HighlightColor,
  JSZipInstance,
  ReaderTheme,
  ReadingProgress,
  VaultAnnotation,
} from '../../types/vault';
import {
  applyHighlightsToHtml,
  HIGHLIGHT_COLOR_OPTIONS,
} from '../../utils/highlightHtml';
import {
  normalizeXhtmlForHtmlParser,
  stripHtmlAndDecodeEntities,
} from '../../utils/metadataCleaner';

export interface EpubLocationSnapshot {
  percentage: number;
  cfi?: string;
  chapterIndex: number;
  chapterLabel: string;
  page?: number;
  scrollRatio?: number;
  locationLabel: string;
}

export interface EpubJumpTarget {
  timestamp: number;
  cfi?: string;
  chapterIndex?: number;
  page?: number;
  scrollRatio?: number;
}

interface EpubVaultReaderProps {
  buffer: ArrayBuffer;
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: string;
  initialProgress: ReadingProgress;
  jumpTarget: EpubJumpTarget | null;
  annotations?: VaultAnnotation[];
  onProgressChange: (progress: Partial<ReadingProgress>) => void;
  onLocationSnapshot?: (snapshot: EpubLocationSnapshot) => void;
  onQuickAnnotateSelection?: (selectedText: string, color?: HighlightColor) => void;
  onCreateHighlight?: (
    quote: string,
    color: HighlightColor,
    comment?: string
  ) => void;
  onSelectAnnotation?: (annotationId: string) => void;
}

interface ParsedSpineChapter {
  id: string;
  href: string;
  title: string;
  htmlContent: string;
  pages: string[];
  isFrontMatter?: boolean;
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
 * afin d'obtenir une liste plate de paragraphes, titres et figures lisibles pour la pagination.
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
      tag === 'image'
    ) {
      return;
    }

    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (src.startsWith('data:image/')) {
        const alt = (el.getAttribute('alt') || '').replace(/"/g, '&quot;');
        blocks.push(`<figure><img src="${src}" alt="${alt}" loading="lazy" /></figure>`);
      }
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
        cTag === 'img' ||
        cTag === 'figure' ||
        /^h[1-6]$/.test(cTag)
      );
    });

    if (CONTAINER_TAGS.has(tag) && hasBlockChildren) {
      Array.from(el.childNodes).forEach(walk);
      return;
    }

    const innerImg = el.querySelector('img[src^="data:image/"]');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text && !innerImg) return;

    if (innerImg && !text) {
      const src = innerImg.getAttribute('src') || '';
      const alt = (innerImg.getAttribute('alt') || '').replace(/"/g, '&quot;');
      blocks.push(`<figure><img src="${src}" alt="${alt}" loading="lazy" /></figure>`);
      return;
    }

    if (CONTAINER_TAGS.has(tag)) {
      blocks.push(`<p>${el.innerHTML}</p>`);
    } else {
      blocks.push(el.outerHTML);
    }
  }

  Array.from(root.childNodes).forEach(walk);
  return blocks;
}

function paginateHtmlBlocks(blocks: string[], targetChars = 1750): string[] {
  const pages: string[] = [];
  let currentBucket: string[] = [];
  let currentCharCount = 0;

  blocks.forEach((blockHtml) => {
    const isImageBlock = /<img\b/i.test(blockHtml);
    const blockLen = isImageBlock ? 450 : stripHtmlAndDecodeEntities(blockHtml).length;
    if (blockLen === 0 && !isImageBlock) return;

    if (currentCharCount > 0 && currentCharCount + blockLen > targetChars) {
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

  return pages;
}

/**
 * Nettoie le XHTML d'un chapitre ePub après normalisation des balises auto-fermantes XML,
 * intègre les illustrations proportionnées, structure les titres/sous-titres comme une édition
 * littéraire, et découpe le chapitre en pages équilibrées.
 */
async function cleanAndPaginateXhtml(
  rawXhtml: string,
  index: number,
  archive: JSZipInstance,
  chapterDir: string,
  tocTitleHint?: string
): Promise<{
  title: string;
  bodyHtml: string;
  blocks: string[];
  pages: string[];
  textLength: number;
  hasHeadingOrToc: boolean;
}> {
  const normalizedHtml = normalizeXhtmlForHtmlParser(rawXhtml);
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedHtml, 'text/html');

  // Convertir les <svg><image href="..."/></svg> de couverture/illustration en <img>
  doc.querySelectorAll('svg').forEach((svg) => {
    const imageEl = svg.querySelector('image');
    const href =
      imageEl?.getAttribute('xlink:href') ||
      imageEl?.getAttribute('href') ||
      '';
    if (href) {
      const img = doc.createElement('img');
      img.setAttribute('src', href);
      svg.replaceWith(img);
    } else {
      svg.remove();
    }
  });

  doc
    .querySelectorAll('head, script, iframe, object, embed, style, link, meta')
    .forEach((n) => n.remove());

  // Résoudre les images internes de l'archive ePub en Data URL
  const imgNodes = Array.from(doc.body?.querySelectorAll('img') || []);
  for (const img of imgNodes) {
    const rawSrc = img.getAttribute('src') || '';
    if (!rawSrc || rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
      img.remove();
      continue;
    }
    if (!rawSrc.startsWith('data:image/')) {
      const zipImg = findZipFile(archive, chapterDir, rawSrc);
      if (zipImg) {
        try {
          const b64 = await zipImg.async('base64');
          const ext = rawSrc.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
          const mime =
            ext === 'png'
              ? 'image/png'
              : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg';
          img.setAttribute('src', `data:${mime};base64,${b64}`);
        } catch {
          img.remove();
        }
      } else {
        img.remove();
      }
    }
  }

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
  let blocks = doc.body ? collectReadableBlocks(doc.body) : [];
  const plainText = stripHtmlAndDecodeEntities(blocks.join(' '));
  const firstBlockText = blocks.length > 0 ? stripHtmlAndDecodeEntities(blocks[0]) : '';

  const hasHeadingOrToc = Boolean(tocTitleHint || (headingText && headingText.length <= 120));

  const cleanTitle =
    tocTitleHint ||
    (headingText && headingText.length <= 120 ? headingText : '') ||
    (firstBlockText && firstBlockText.length <= 80 ? firstBlockText : '') ||
    `Page liminaire ${index + 1}`;

  // Si le chapitre possède un titre officiel dans la Table des matières mais aucun <h1>/<h2> en tête, on l'ajoute proprement
  if (tocTitleHint && !/^<h[1-4]\b/i.test(blocks[0] || '')) {
    const firstTxt = stripHtmlAndDecodeEntities(blocks[0] || '');
    if (firstTxt.toLowerCase() === tocTitleHint.trim().toLowerCase()) {
      blocks[0] = `<h1>${firstTxt}</h1>`;
    } else {
      blocks = [`<h1>${tocTitleHint}</h1>`, ...blocks];
    }
  }

  // Détecter un sous-titre de chapitre juste après un <h1> ou <h2> (ex: "Chapitre premier" suivi de "<p>Quelques notions sur l'Univers</p>")
  if (blocks.length >= 2 && /^<h[1-2]\b/i.test(blocks[0]) && /^<p>/i.test(blocks[1])) {
    const subCandidate = stripHtmlAndDecodeEntities(blocks[1]);
    if (
      subCandidate.length > 0 &&
      subCandidate.length <= 95 &&
      !/[.!?]$/.test(subCandidate)
    ) {
      blocks[1] = `<p class="epub-subtitle">${subCandidate}</p>`;
    }
  }

  // Si c'est une page liminaire courte (page de titre, copyright, dédicace), centrer élégamment les lignes
  if (!tocTitleHint && plainText.length > 0 && plainText.length <= 260) {
    blocks = blocks.map((b) =>
      b.startsWith('<p>') ? b.replace(/^<p>/, '<p class="epub-centered-line">') : b
    );
  }

  const pages = paginateHtmlBlocks(blocks);
  const fullBodyHtml = blocks.join('\n');
  const hasImage = blocks.some((b) => /<img\b/i.test(b));

  return {
    title: cleanTitle,
    bodyHtml: fullBodyHtml,
    blocks,
    pages,
    textLength: plainText.length + (hasImage ? 100 : 0),
    hasHeadingOrToc,
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
  annotations,
  onProgressChange,
  onLocationSnapshot,
  onQuickAnnotateSelection,
  onCreateHighlight,
  onSelectAnnotation,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastJumpTimestampRef = useRef<number>(0);

  const [toc, setToc] = useState<EpubNavigationItem[]>([]);
  const [spineChapters, setSpineChapters] = useState<ParsedSpineChapter[]>([]);

  const [viewMode, setViewMode] = useState<'paginated' | 'single-page'>('paginated');
  const [currentGlobalPage, setCurrentGlobalPage] = useState<number>(0);

  const [showTocDrawer, setShowTocDrawer] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [showInlineNoteBox, setShowInlineNoteBox] = useState<boolean>(false);
  const [inlineNoteText, setInlineNoteText] = useState<string>('');
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
    const rawItems: Array<{
      id: string;
      href: string;
      title: string;
      bodyHtml: string;
      blocks: string[];
      pages: string[];
      textLength: number;
      hasHeadingOrToc: boolean;
      hasTocHint: boolean;
    }> = [];

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
          const fullRelPath = `${baseDir}${relHref.split('#')[0]}`;
          const chapterDir = fullRelPath.includes('/')
            ? fullRelPath.substring(0, fullRelPath.lastIndexOf('/') + 1)
            : baseDir;

          const parsed = await cleanAndPaginateXhtml(
            rawXhtml,
            rawItems.length,
            archive,
            chapterDir,
            tocHint
          );

          if (parsed.textLength > 0 && parsed.pages.length > 0) {
            rawItems.push({
              id: idref,
              href: relHref,
              title: parsed.title,
              bodyHtml: parsed.bodyHtml,
              blocks: parsed.blocks,
              pages: parsed.pages,
              textLength: parsed.textLength,
              hasHeadingOrToc: parsed.hasHeadingOrToc,
              hasTocHint: Boolean(tocHint),
            });
          }
        }
      }
    }

    // Fallback si aucun spine OPF n'a retourné de chapitres
    if (rawItems.length === 0) {
      const htmlKeys = Object.keys(archive.files)
        .filter((k) => /\.(xhtml|html|htm)$/i.test(k) && !/(^|\/)(nav|toc)\./i.test(k))
        .sort();

      for (let i = 0; i < htmlKeys.length; i++) {
        const fileObj = archive.file(htmlKeys[i]);
        if (!fileObj) continue;
        const rawXhtml = await fileObj.async('string');
        const fileBasename = htmlKeys[i].split('/').pop() || '';
        const tocHint = tocTitleMap.get(fileBasename);
        const chapterDir = htmlKeys[i].includes('/')
          ? htmlKeys[i].substring(0, htmlKeys[i].lastIndexOf('/') + 1)
          : baseDir;

        const parsed = await cleanAndPaginateXhtml(
          rawXhtml,
          rawItems.length,
          archive,
          chapterDir,
          tocHint
        );

        if (parsed.textLength > 0 && parsed.pages.length > 0) {
          rawItems.push({
            id: `ch-${i}`,
            href: htmlKeys[i],
            title: parsed.title,
            bodyHtml: parsed.bodyHtml,
            blocks: parsed.blocks,
            pages: parsed.pages,
            textLength: parsed.textLength,
            hasHeadingOrToc: parsed.hasHeadingOrToc,
            hasTocHint: Boolean(tocHint),
          });
        }
      }
    }

    // Regrouper les pages liminaires courtes (couverture, faux-titre, copyright, page de titre)
    // situées avant le premier vrai chapitre afin d'éviter "Chapitre 1, 2, 3, 4" artificiels
    const chapters: ParsedSpineChapter[] = [];
    let frontMatterBlocks: string[] = [];
    let seenMainChapter = false;

    for (const item of rawItems) {
      const isShortPreliminary =
        !seenMainChapter && !item.hasTocHint && item.textLength <= 380;

      if (isShortPreliminary) {
        if (frontMatterBlocks.length > 0) {
          frontMatterBlocks.push('<hr />');
        }
        frontMatterBlocks.push(...item.blocks);
      } else {
        if (frontMatterBlocks.length > 0) {
          chapters.push({
            id: 'front-matter',
            href: rawItems[0]?.href || 'front-matter',
            title: 'Ouverture',
            htmlContent: frontMatterBlocks.join('\n'),
            pages: paginateHtmlBlocks(frontMatterBlocks),
            isFrontMatter: true,
          });
          frontMatterBlocks = [];
        }
        seenMainChapter = true;
        chapters.push({
          id: item.id,
          href: item.href,
          title: item.title,
          htmlContent: item.bodyHtml,
          pages: item.pages,
          isFrontMatter: false,
        });
      }
    }

    if (frontMatterBlocks.length > 0) {
      chapters.push({
        id: 'front-matter',
        href: rawItems[0]?.href || 'front-matter',
        title: 'Ouverture',
        htmlContent: frontMatterBlocks.join('\n'),
        pages: paginateHtmlBlocks(frontMatterBlocks),
        isFrontMatter: true,
      });
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
          page: clamped + 1,
          locationLabel: locationText,
        });
      }
    },
    [allBookPages, viewMode, onProgressChange, onLocationSnapshot]
  );

  // Synchronise le snapshot de position initiale dès que les pages sont prêtes
  useEffect(() => {
    if (allBookPages.length === 0 || !onLocationSnapshot) return;
    const activePage = allBookPages[currentGlobalPage] || allBookPages[0];
    if (!activePage) return;
    const pct = Math.round(((activePage.globalPageIndex + 1) / allBookPages.length) * 100);
    onLocationSnapshot({
      percentage: pct,
      chapterIndex: activePage.chapterIndex,
      chapterLabel: activePage.chapterTitle,
      page: activePage.globalPageIndex + 1,
      locationLabel: `${activePage.chapterTitle} (p. ${activePage.globalPageIndex + 1}/${allBookPages.length})`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBookPages.length]);

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

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const scrollToChapterInSinglePage = useCallback((chapterIdx: number, smooth = true) => {
    window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      const el = container?.querySelector(
        `#epub-full-chapter-${chapterIdx}`
      ) as HTMLElement | null;
      if (container && el) {
        container.scrollTo({
          top: Math.max(0, el.offsetTop - 24),
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!jumpTarget || allBookPages.length === 0) return;
    if (lastJumpTimestampRef.current === jumpTarget.timestamp) return;
    lastJumpTimestampRef.current = jumpTarget.timestamp;

    if (viewMode === 'single-page') {
      if (typeof jumpTarget.scrollRatio === 'number') {
        window.requestAnimationFrame(() => {
          const el = scrollContainerRef.current;
          if (!el) return;
          const maxScroll = el.scrollHeight - el.clientHeight;
          el.scrollTo({
            top: Math.max(0, maxScroll * jumpTarget.scrollRatio!),
            behavior: 'smooth',
          });
        });
        return;
      }
      if (typeof jumpTarget.chapterIndex === 'number') {
        const targetChapterIdx = Math.min(
          Math.max(0, jumpTarget.chapterIndex),
          Math.max(0, spineChapters.length - 1)
        );
        const firstPageForChapter = allBookPages.findIndex(
          (p) => p.chapterIndex === targetChapterIdx
        );
        if (firstPageForChapter >= 0) {
          setCurrentGlobalPage(firstPageForChapter);
        }
        scrollToChapterInSinglePage(targetChapterIdx, true);
      } else if (typeof jumpTarget.page === 'number' && jumpTarget.page >= 1) {
        const pageObj = allBookPages[Math.min(jumpTarget.page - 1, allBookPages.length - 1)];
        if (pageObj) {
          scrollToChapterInSinglePage(pageObj.chapterIndex, true);
        }
      }
      return;
    }

    // Mode paginé : priorité à la page exacte du signet si présente, sinon chapitre
    if (typeof jumpTarget.page === 'number' && jumpTarget.page >= 1) {
      goToGlobalPage(jumpTarget.page - 1);
      return;
    }

    if (typeof jumpTarget.chapterIndex === 'number') {
      const targetChapterIdx = Math.min(
        Math.max(0, jumpTarget.chapterIndex),
        Math.max(0, spineChapters.length - 1)
      );

      const firstPageForChapter = allBookPages.findIndex(
        (p) => p.chapterIndex === targetChapterIdx
      );

      if (firstPageForChapter >= 0) {
        goToGlobalPage(firstPageForChapter);
      }
    }
  }, [jumpTarget, allBookPages, spineChapters.length, viewMode, goToGlobalPage, scrollToChapterInSinglePage]);

  const handleTocClick = (chapterIdx: number) => {
    setShowTocDrawer(false);
    const pageIdx = allBookPages.findIndex((p) => p.chapterIndex === chapterIdx);

    if (viewMode === 'single-page') {
      if (pageIdx >= 0) {
        setCurrentGlobalPage(pageIdx);
      }
      scrollToChapterInSinglePage(chapterIdx, true);
      const ch = spineChapters[chapterIdx];
      if (ch) {
        const pct = Math.round(((chapterIdx + 1) / spineChapters.length) * 100);
        onProgressChange({
          chapterIndex: chapterIdx,
          chapterLabel: ch.title,
          percentage: pct,
        });
        if (onLocationSnapshot) {
          onLocationSnapshot({
            percentage: pct,
            chapterIndex: chapterIdx,
            chapterLabel: ch.title,
            page: pageIdx >= 0 ? pageIdx + 1 : undefined,
            locationLabel: `${ch.title} (${pct}%)`,
          });
        }
      }
    } else if (pageIdx >= 0) {
      goToGlobalPage(pageIdx);
    }
  };

  const handleSinglePageScroll = () => {
    if (viewMode !== 'single-page') return;
    const el = scrollContainerRef.current;
    if (!el || spineChapters.length === 0) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const ratio = maxScroll <= 0 ? 1 : Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    const pct = Math.round(ratio * 100);

    // Détection précise du chapitre réellement visible à l'écran via la position DOM
    let detectedChapterIdx = 0;
    const threshold = el.scrollTop + 140;
    for (let i = 0; i < spineChapters.length; i++) {
      const sectionEl = el.querySelector(`#epub-full-chapter-${i}`) as HTMLElement | null;
      if (sectionEl && sectionEl.offsetTop <= threshold) {
        detectedChapterIdx = i;
      } else if (sectionEl && sectionEl.offsetTop > threshold) {
        break;
      }
    }

    const firstPageIdx = allBookPages.findIndex((p) => p.chapterIndex === detectedChapterIdx);
    if (firstPageIdx >= 0 && firstPageIdx !== currentGlobalPage) {
      setCurrentGlobalPage(firstPageIdx);
    }

    const activeTitle =
      spineChapters[detectedChapterIdx]?.title || 'Livre complet';

    onProgressChange({
      percentage: pct,
      scrollRatio: Number(ratio.toFixed(4)),
      chapterIndex: detectedChapterIdx,
      chapterLabel: activeTitle,
    });

    if (onLocationSnapshot) {
      onLocationSnapshot({
        percentage: pct,
        chapterIndex: detectedChapterIdx,
        chapterLabel: activeTitle,
        page: firstPageIdx >= 0 ? firstPageIdx + 1 : undefined,
        scrollRatio: Number(ratio.toFixed(4)),
        locationLabel: `${activeTitle} (${pct}%)`,
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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewMode !== 'paginated' || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const sel = window.getSelection()?.toString().trim() || '';
    if (sel.length >= 3 && sel.length <= 500) {
      setSelectedQuote(sel);
      touchStartRef.current = null;
      return;
    }
    if (viewMode !== 'paginated' || !touchStartRef.current || e.changedTouches.length !== 1) {
      return;
    }
    if (sel.length > 0) {
      touchStartRef.current = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && currentGlobalPage < allBookPages.length - 1) {
        goToGlobalPage(currentGlobalPage + 1);
      } else if (dx > 0 && currentGlobalPage > 0) {
        goToGlobalPage(currentGlobalPage - 1);
      }
    }
  };

  const activePageObj = allBookPages[currentGlobalPage] || allBookPages[0];

  const highlightedPageHtml = useMemo(() => {
    if (!activePageObj) return '';
    return applyHighlightsToHtml(activePageObj.htmlContent, annotations);
  }, [activePageObj, annotations]);

  const themeSurface =
    theme === 'light'
      ? 'bg-[#dfe5dc] text-[#1f3128]'
      : theme === 'sepia'
      ? 'bg-[#d8ccb5] text-[#2f261b]'
      : 'bg-[#101713] text-[#e7ece8]';

  const pageCardSurface =
    theme === 'light'
      ? 'bg-[#fbfaf5] border-[#21392f]/15 text-[#1f3128] shadow-[0_24px_60px_rgba(14,24,19,0.12)]'
      : theme === 'sepia'
      ? 'bg-[#f2e8d3] border-[#493825]/18 text-[#2f261b] shadow-[0_24px_60px_rgba(14,24,19,0.12)]'
      : 'bg-[#19231e] border-[#e7ece8]/12 text-[#e7ece8] shadow-[0_24px_60px_rgba(0,0,0,0.35)]';

  const barSurface =
    theme === 'light'
      ? 'bg-[#f8f6f0]/90 border-[#21392f]/15 text-[#1f3128]'
      : theme === 'sepia'
      ? 'bg-[#f1e7d3]/90 border-[#493825]/18 text-[#2f261b]'
      : 'bg-[#121a16]/90 border-[#e7ece8]/12 text-[#e7ece8]';

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden transition-colors duration-200 ${themeSurface}`}>
      {/* Barre secondaire ePub (glissable horizontalement sur mobile) */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2 border-b text-xs shrink-0 ${barSurface}`}>
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
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
            <span className="inline-flex items-center gap-1.5 truncate opacity-85 min-w-0">
              <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate font-medium">
                {activePageObj.chapterTitle}
              </span>
            </span>
          )}
        </div>

        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar touch-pan-x flex items-center gap-2 py-0.5 shrink-0">
          {/* Bascule Par page (Flèches ←/→) vs Livre entier sur la même page */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-current/20 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('paginated')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'paginated'
                  ? 'bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Tourner les pages avec les flèches gauche et droite ou en glissant"
            >
              <Layers className="w-3 h-3" />
              <span>Par page (← / →)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const targetChapter = activePageObj?.chapterIndex ?? 0;
                setViewMode('single-page');
                scrollToChapterInSinglePage(targetChapter, false);
              }}
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
            <div className="flex items-center gap-1.5 shrink-0">
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

              <span className="font-mono tabular-nums px-1.5 opacity-80 whitespace-nowrap">
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

      {/* Zone de lecture */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden relative"
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {showTocDrawer && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-20 md:hidden"
              onClick={() => setShowTocDrawer(false)}
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
              <p className="text-xs font-semibold tracking-tight opacity-70 mb-3">
                Sommaire
              </p>
              <nav className="space-y-1">
                {toc.map((item, idx) => {
                  const isCurrent =
                    activePageObj && activePageObj.chapterIndex === idx;
                  const firstPageIdx = allBookPages.findIndex((p) => p.chapterIndex === idx);
                  const startPageNum = firstPageIdx >= 0 ? firstPageIdx + 1 : idx + 1;
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
                      <span className="font-mono text-[10px] opacity-55 shrink-0">
                        p. {startPageNum}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleSinglePageScroll}
          className="flex-1 h-full overflow-y-auto relative flex justify-center items-start px-2 sm:px-8 py-3 sm:py-10"
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
                className={`w-full max-w-[62ch] rounded-xl sm:rounded-2xl border px-5 sm:px-12 py-6 sm:py-12 transition-all ${pageCardSurface}`}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily,
                }}
              >
                {/* Titre courant sobre (style édition papier / liseuse) */}
                <div className="flex items-center justify-between gap-3 text-[11px] opacity-45 pb-3.5 mb-7 border-b border-current/10 font-sans tracking-wide">
                  <span className="truncate italic">{activePageObj.chapterTitle}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    p. {activePageObj.pageInChapter} / {activePageObj.totalPagesInChapter}
                  </span>
                </div>

                <article
                  onClick={handleContentClick}
                  className="vault-book-prose"
                  style={{
                    fontSize: `${fontSize}px`,
                    fontFamily,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: highlightedPageHtml,
                  }}
                />

                <div className="mt-8 sm:mt-10 pt-4 sm:pt-5 border-t border-current/10 flex items-center justify-between gap-2 text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => goToGlobalPage(currentGlobalPage - 1)}
                    disabled={currentGlobalPage <= 0}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline sm:inline">Page précédente</span>
                    <span className="sm:hidden">Préc.</span>
                  </button>

                  <span className="font-mono tabular-nums opacity-60 text-[11px] sm:text-xs text-center">
                    {currentGlobalPage + 1} / {allBookPages.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => goToGlobalPage(currentGlobalPage + 1)}
                    disabled={currentGlobalPage >= allBookPages.length - 1}
                    className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-current/20 hover:border-current/40 disabled:opacity-30 transition-colors cursor-pointer shrink-0"
                  >
                    <span className="hidden xs:inline sm:inline">Page suivante</span>
                    <span className="sm:hidden">Suiv.</span>
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
              className={`w-full max-w-[62ch] rounded-xl sm:rounded-2xl border px-5 sm:px-12 py-7 sm:py-12 ${pageCardSurface}`}
              style={{
                fontSize: `${fontSize}px`,
                fontFamily,
              }}
            >
              {spineChapters.map((chapter, idx) => (
                <section
                  key={chapter.id}
                  id={`epub-full-chapter-${idx}`}
                  className={idx > 0 ? 'mt-14 pt-8' : ''}
                >
                  {idx > 0 && (
                    <div
                      className="flex items-center justify-center gap-3 mb-10 opacity-30 select-none text-xs font-serif"
                      aria-hidden="true"
                    >
                      <span className="w-12 h-px bg-current" />
                      <span>✦</span>
                      <span className="w-12 h-px bg-current" />
                    </div>
                  )}
                  <article
                    onClick={handleContentClick}
                    className="vault-book-prose"
                    style={{
                      fontSize: `${fontSize}px`,
                      fontFamily,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: applyHighlightsToHtml(chapter.htmlContent, annotations),
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
