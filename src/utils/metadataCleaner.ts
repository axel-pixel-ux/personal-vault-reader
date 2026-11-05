import { DocumentFormat } from '../types/vault';

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Normalise une chaîne XHTML (ePub) en HTML5 valide avant passage dans DOMParser.
 * Corrige notamment les balises auto-fermantes XML (<title/>, <div/>, <a/>, <p/>, <script/>, <style/>)
 * qui absorbent tout le <body> lorsqu'elles sont analysées en mode 'text/html'.
 */
export function normalizeXhtmlForHtmlParser(rawXhtml: string): string {
  if (!rawXhtml) return '';
  return rawXhtml
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<head\b[^>]*\/>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<style\b[^>]*\/>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<([a-zA-Z0-9:_-]+)([^>]*?)\/>/g, (full, tagName, attrs) => {
      const lower = String(tagName).toLowerCase();
      if (VOID_HTML_TAGS.has(lower)) return full;
      return `<${tagName}${attrs}></${tagName}>`;
    });
}

/**
 * Élimine intégralement toutes les balises HTML/XML (y compris <head>, <meta>, <style>, <script>)
 * et décode les entités HTML (&eacute; -> é, &nbsp; -> espace, etc.).
 */
export function stripHtmlAndDecodeEntities(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';

  let cleaned = normalizeXhtmlForHtmlParser(input)
    .replace(/<(head|style|script|title|meta|link|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(meta|link|br|hr|img|input)[^>]*\/?>/gi, ' ');

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<!doctype html><body>${cleaned}</body>`, 'text/html');
    doc.querySelectorAll('head, style, script, meta, link, title, svg, noscript').forEach((el) => el.remove());
    cleaned = doc.body.textContent || '';
  } catch {
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  }

  if (/<[a-z!/][\s\S]*>/i.test(cleaned) || /&[a-z0-9#]+;/i.test(cleaned)) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<!doctype html><body>${cleaned}</body>`, 'text/html');
      doc.querySelectorAll('head, style, script, meta, link, title').forEach((el) => el.remove());
      cleaned = doc.body.textContent || '';
    } catch {
      cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    }
  }

  return cleaned
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nettoie une description et la tronque proprement entre 150 et 200 caractères avec ellipse "...".
 * Retourne "Aucune description" si aucun texte pertinent n'est trouvé.
 */
export function sanitizeDescription(
  rawDescription: string | null | undefined,
  fallbackExcerpt?: string | null,
  maxLength: number = 175
): string {
  let text = stripHtmlAndDecodeEntities(rawDescription);

  if (!text || text.length < 3) {
    text = stripHtmlAndDecodeEntities(fallbackExcerpt);
  }

  if (!text || text.length < 3 || /^aucune description$/i.test(text)) {
    return 'Aucune description';
  }

  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  const cutoff = lastSpace > 120 ? sliced.slice(0, lastSpace) : sliced;
  return `${cutoff.replace(/[.,;:!?\s]+$/, '')}...`;
}

function stripMarkdownSyntax(md: string): string {
  return md
    .replace(/^---[\s\S]*?---/m, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+_=]+\s*/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resizeImageBlobToDataUrl(
  blob: Blob,
  maxWidth: number = 240,
  maxHeight: number = 360
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || maxWidth;
        let h = img.naturalHeight || maxHeight;
        const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
        w = Math.max(1, Math.round(w * ratio));
        h = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(undefined);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch {
        URL.revokeObjectURL(url);
        resolve(undefined);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

export async function extractBookCoverDataUrl(
  format: DocumentFormat,
  buffer: ArrayBuffer
): Promise<string | undefined> {
  if (format === 'pdf' && window.pdfjsLib) {
    try {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const pdf = await window.pdfjsLib.getDocument({
        data: new Uint8Array(buffer.slice(0)),
      }).promise;
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(240 / Math.max(1, baseViewport.width), 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        await pdf.destroy();
        return undefined;
      }
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      await pdf.destroy();
      return dataUrl;
    } catch {
      return undefined;
    }
  }

  if (format === 'epub' && window.JSZip) {
    try {
      const zip = new window.JSZip();
      const archive = await zip.loadAsync(buffer.slice(0));

      let opfPath = '';
      const containerFile = archive.file('META-INF/container.xml');
      if (containerFile) {
        const containerXml = await containerFile.async('string');
        const match = containerXml.match(/full-path=["']([^"']+)["']/i);
        if (match?.[1]) opfPath = match[1];
      }
      if (!opfPath) {
        const foundOpf = Object.keys(archive.files).find((k) =>
          k.toLowerCase().endsWith('.opf')
        );
        if (foundOpf) opfPath = foundOpf;
      }

      let coverHref = '';
      const baseDir =
        opfPath && opfPath.includes('/')
          ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
          : '';

      if (opfPath && archive.file(opfPath)) {
        const opfXml = await archive.file(opfPath)!.async('string');
        const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
        const items = Array.from(opfDoc.getElementsByTagName('item'));
        const metas = Array.from(opfDoc.getElementsByTagName('meta'));

        const coverMeta = metas.find(
          (m) => m.getAttribute('name')?.toLowerCase() === 'cover'
        );
        const coverId = coverMeta?.getAttribute('content');
        if (coverId) {
          const item = items.find((it) => it.getAttribute('id') === coverId);
          if (item?.getAttribute('href')) coverHref = item.getAttribute('href')!;
        }

        if (!coverHref) {
          const propItem = items.find((it) =>
            (it.getAttribute('properties') || '').includes('cover-image')
          );
          if (propItem?.getAttribute('href')) coverHref = propItem.getAttribute('href')!;
        }

        if (!coverHref) {
          const imageItems = items.filter((it) =>
            (it.getAttribute('media-type') || '').startsWith('image/')
          );
          const byName =
            imageItems.find((it) =>
              /cover/i.test(
                `${it.getAttribute('id') || ''} ${it.getAttribute('href') || ''}`
              )
            ) || imageItems[0];
          if (byName?.getAttribute('href')) coverHref = byName.getAttribute('href')!;
        }
      }

      const cleanHref = coverHref.split('#')[0];
      let imgFile =
        (cleanHref &&
          (archive.file(`${baseDir}${cleanHref}`) || archive.file(cleanHref))) ||
        null;

      if (!imgFile) {
        const fallbackKey = Object.keys(archive.files).find((k) =>
          /\.(jpe?g|png|webp)$/i.test(k)
        );
        if (fallbackKey) imgFile = archive.file(fallbackKey);
      }

      if (imgFile) {
        const bytes = await imgFile.async('uint8array');
        const blob = new Blob([bytes as unknown as BlobPart]);
        return await resizeImageBlobToDataUrl(blob);
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function extractCleanDocumentMetadata(
  originalFilename: string,
  format: DocumentFormat,
  buffer: ArrayBuffer
): Promise<{
  title: string;
  author?: string;
  description: string;
  coverDataUrl?: string;
}> {
  const defaultTitle = originalFilename.replace(/\.[^/.]+$/, '').trim() || originalFilename;
  const coverDataUrl = await extractBookCoverDataUrl(format, buffer);

  if (format === 'epub' && window.JSZip) {
    try {
      const zip = new window.JSZip();
      const archive = await zip.loadAsync(buffer.slice(0));

      let opfPath = '';
      const containerFile = archive.file('META-INF/container.xml');
      if (containerFile) {
        const containerXml = await containerFile.async('string');
        const match = containerXml.match(/full-path=["']([^"']+)["']/i);
        if (match?.[1]) opfPath = match[1];
      }
      if (!opfPath) {
        const foundOpf = Object.keys(archive.files).find((k) => k.toLowerCase().endsWith('.opf'));
        if (foundOpf) opfPath = foundOpf;
      }

      let extractedTitle = '';
      let extractedAuthor = '';
      let extractedDesc = '';
      let firstChapterExcerpt = '';

      if (opfPath && archive.file(opfPath)) {
        const opfXml = await archive.file(opfPath)!.async('string');
        const parser = new DOMParser();
        const opfDoc = parser.parseFromString(opfXml, 'application/xml');

        const titleNode =
          opfDoc.getElementsByTagName('dc:title')[0] ||
          opfDoc.getElementsByTagName('title')[0];
        const creatorNode =
          opfDoc.getElementsByTagName('dc:creator')[0] ||
          opfDoc.getElementsByTagName('creator')[0];
        const descNode =
          opfDoc.getElementsByTagName('dc:description')[0] ||
          opfDoc.getElementsByTagName('description')[0];

        if (titleNode?.textContent) {
          extractedTitle = stripHtmlAndDecodeEntities(titleNode.textContent);
        }
        if (creatorNode?.textContent) {
          extractedAuthor = stripHtmlAndDecodeEntities(creatorNode.textContent);
        }
        if (descNode?.textContent) {
          extractedDesc = stripHtmlAndDecodeEntities(descNode.textContent);
        }

        if (!extractedDesc) {
          const baseDir = opfPath.includes('/')
            ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
            : '';
          const itemRefs = Array.from(opfDoc.getElementsByTagName('itemref'));
          const items = Array.from(opfDoc.getElementsByTagName('item'));

          for (const ref of itemRefs.slice(0, 5)) {
            const idref = ref.getAttribute('idref');
            const manifestItem = items.find((it) => it.getAttribute('id') === idref);
            const relHref = manifestItem?.getAttribute('href');
            if (!relHref) continue;

            const cleanRel = relHref.split('#')[0];
            const chFile =
              archive.file(`${baseDir}${cleanRel}`) || archive.file(cleanRel);
            if (chFile) {
              const rawXhtml = await chFile.async('string');
              const normalized = normalizeXhtmlForHtmlParser(rawXhtml);
              const htmlDoc = new DOMParser().parseFromString(normalized, 'text/html');
              htmlDoc
                .querySelectorAll('h1, h2, h3, nav, svg')
                .forEach((el) => el.remove());
              const candidateText = stripHtmlAndDecodeEntities(
                htmlDoc.body?.textContent || ''
              );
              if (candidateText.length > 40) {
                firstChapterExcerpt = candidateText;
                break;
              }
            }
          }
        }
      }

      return {
        title: extractedTitle || defaultTitle,
        author: extractedAuthor || undefined,
        description: sanitizeDescription(extractedDesc, firstChapterExcerpt),
        coverDataUrl,
      };
    } catch {
      return {
        title: defaultTitle,
        description: 'Aucune description',
        coverDataUrl,
      };
    }
  }

  if (format === 'md' || format === 'txt') {
    try {
      const slice = buffer.slice(0, 4096);
      const rawText = new TextDecoder('utf-8').decode(slice);
      const lines = rawText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !/^[=\-_#*]{3,}$/.test(l));

      let candidateTitle = defaultTitle;
      let bodyStartIdx = 0;

      if (format === 'md' && lines[0]?.startsWith('# ')) {
        candidateTitle = stripHtmlAndDecodeEntities(lines[0].replace(/^#+\s*/, ''));
        bodyStartIdx = 1;
      }

      const paragraphLines = lines
        .slice(bodyStartIdx)
        .filter((l) => !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('|'));
      const rawExcerpt = stripMarkdownSyntax(paragraphLines.slice(0, 4).join(' '));

      return {
        title: candidateTitle || defaultTitle,
        description: sanitizeDescription(rawExcerpt),
        coverDataUrl,
      };
    } catch {
      return {
        title: defaultTitle,
        description: 'Aucune description',
        coverDataUrl,
      };
    }
  }

  return {
    title: defaultTitle,
    description: 'Aucune description',
    coverDataUrl,
  };
}
