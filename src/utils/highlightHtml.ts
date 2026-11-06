import { HighlightColor, VaultAnnotation } from '../types/vault';

export const HIGHLIGHT_COLOR_OPTIONS: Array<{
  id: HighlightColor;
  label: string;
  swatchClass: string;
  badgeClass: string;
}> = [
  {
    id: 'yellow',
    label: 'Jaune',
    swatchClass: 'bg-amber-400 border-amber-500',
    badgeClass: 'bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
  },
  {
    id: 'green',
    label: 'Vert',
    swatchClass: 'bg-emerald-400 border-emerald-500',
    badgeClass: 'bg-emerald-400/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  },
  {
    id: 'blue',
    label: 'Bleu',
    swatchClass: 'bg-sky-400 border-sky-500',
    badgeClass: 'bg-sky-400/20 text-sky-700 dark:text-sky-300 border-sky-500/40',
  },
  {
    id: 'pink',
    label: 'Rose',
    swatchClass: 'bg-pink-400 border-pink-500',
    badgeClass: 'bg-pink-400/20 text-pink-700 dark:text-pink-300 border-pink-500/40',
  },
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Injecte des balises <mark class="vault-highlight ..."> dans le HTML du livre
 * pour chaque annotation possédant une citation (quote), sans jamais altérer les attributs HTML.
 */
export function applyHighlightsToHtml(
  html: string,
  annotations?: VaultAnnotation[]
): string {
  if (!html || !annotations || annotations.length === 0) {
    return html;
  }

  const validAnnotations = annotations.filter(
    (a) => a.quote && a.quote.trim().length >= 3
  );
  if (validAnnotations.length === 0) {
    return html;
  }

  let result = html;

  for (const ann of validAnnotations) {
    const rawQuote = (ann.quote || '').trim();
    const words = rawQuote
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 50);

    if (words.length === 0) continue;

    // Vérification rapide : le premier mot significatif est-il présent dans le HTML ?
    const longestWord = words.reduce(
      (a, b) => (b.length > a.length ? b : a),
      words[0]
    );
    if (
      longestWord.length >= 4 &&
      !/[&<>]/.test(longestWord) &&
      !result.toLowerCase().includes(longestWord.toLowerCase())
    ) {
      continue;
    }

    const wordPatterns = words.map((w) =>
      escapeRegExp(w)
        .replace(/&/g, '(?:&amp;|&)')
        .replace(/['’]/g, "['’]")
    );

    const quotePattern = wordPatterns.join(
      '(?:\\s|&nbsp;|<\\/?(?:em|i|b|strong|span|u|s|sup|sub|small|code)\\b[^>]*>)+'
    );

    try {
      const regex = new RegExp(
        `(<mark\\b[^>]*>[\\s\\S]*?<\\/mark>|<[^>]+>)|(${quotePattern})`,
        'gi'
      );
      const color: HighlightColor = ann.highlightColor || 'yellow';
      const hasNote = Boolean(ann.content && ann.content.trim().length > 0);

      result = result.replace(
        regex,
        (fullMatch, skippedTagOrMark: string | undefined, matchedQuote: string | undefined) => {
          if (skippedTagOrMark) {
            return fullMatch;
          }
          if (matchedQuote) {
            return `<mark data-annotation-id="${ann.id}" data-has-note="${hasNote ? 'true' : 'false'}" class="vault-highlight vault-highlight-${color}" title="${hasNote ? 'Cliquez pour voir la note' : 'Texte surligné — cliquez pour ajouter ou modifier une note'}">${matchedQuote}</mark>`;
          }
          return fullMatch;
        }
      );
    } catch {
      // Ignorer si l'expression régulière échoue sur un extrait exotique
    }
  }

  return result;
}
