import { GoogleGenAI } from '@google/genai';
import { pool } from './db.ts';

export interface ThemeGroup {
  id: string;
  grandTheme: string;
  sousThemes: string[];
}

/**
 * Récupère la clé API Gemini configurée :
 * 1. Priorité à la variable d'environnement GEMINI_API_KEY
 * 2. Sinon, clé enregistrée par l'administrateur dans la table etudes_taxonomy
 */
export async function getEffectiveGeminiApiKey(): Promise<string | null> {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;

  try {
    const { rows } = await pool.query<{ gemini_api_key: string | null }>(
      `SELECT gemini_api_key FROM etudes_taxonomy WHERE id = 'current' LIMIT 1`,
    );
    const dbKey = rows[0]?.gemini_api_key?.trim();
    if (dbKey) return dbKey;
  } catch {
    // Si la table n'est pas encore créée
  }

  return null;
}

/**
 * Taxonomie par défaut de secours si aucune clé Gemini n'est configurée
 * ou si le service est temporairement indisponible.
 */
export const DEFAULT_THEME_TAXONOMY: Array<{ grandTheme: string; sousThemes: string[] }> = [
  {
    grandTheme: 'Philosophie & Éthique',
    sousThemes: ['philosophie', 'éthique', 'morale', 'métaphysique', 'bioéthique', 'justice', 'humanisme', 'pensée'],
  },
  {
    grandTheme: 'Sciences & Technologies',
    sousThemes: ['ia', 'intelligence artificielle', 'technologie', 'numérique', 'sciences', 'algorithmes', 'biologie', 'santé'],
  },
  {
    grandTheme: 'Société & Politique',
    sousThemes: ['démocratie', 'politique', 'société', 'sociologie', 'droit', 'éducation', 'citoyenneté', 'médias'],
  },
  {
    grandTheme: 'Économie & Écologie',
    sousThemes: ['économie', 'écologie', 'climat', 'travail', 'environnement', 'transition', 'mondialisation', 'finance'],
  },
  {
    grandTheme: 'Culture, Arts & Histoire',
    sousThemes: ['littérature', 'arts', 'histoire', 'cinéma', 'culture', 'poésie', 'théâtre', 'patrimoine'],
  },
  {
    grandTheme: 'Spiritualités & Religions',
    sousThemes: ['théologie', 'religion', 'spiritualité', 'christianisme', 'laïcité', 'foi', 'interreligieux'],
  },
  {
    grandTheme: 'Relations Internationales',
    sousThemes: ['géopolitique', 'europe', 'guerre', 'paix', 'international', 'diplomatie'],
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Nettoie une chaîne JSON renvoyée par le modèle (enlève d'éventuels ```json ... ```)
 */
function cleanJsonMarkdown(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return cleaned;
}

/**
 * Teste la validité d'une clé API Gemini avec un prompt ultra-léger
 */
export async function testGeminiApiKey(apiKey: string): Promise<boolean> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return false;

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Réponds uniquement par: OK',
    });
    return Boolean(response.text?.includes('OK'));
  } catch (err) {
    // Essai avec gemini-1.5-flash en repli
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: 'Réponds uniquement par: OK',
      });
      return Boolean(fallbackResponse.text?.includes('OK'));
    } catch {
      return false;
    }
  }
}

/**
 * Classe automatiquement l'ensemble des thèmes existants de la bibliothèque
 * en Grands Thèmes et Sous-thèmes grâce à Gemini.
 */
export async function classifyThemesWithGemini(
  themes: string[],
  customApiKey?: string,
): Promise<ThemeGroup[]> {
  const uniqueThemes = Array.from(
    new Set(themes.map((t) => t.trim()).filter(Boolean)),
  );

  if (uniqueThemes.length === 0) {
    return [];
  }

  const apiKey = customApiKey?.trim() || (await getEffectiveGeminiApiKey());

  if (!apiKey) {
    // Repli sur le dictionnaire interne
    return fallbackClassifyThemes(uniqueThemes);
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Tu es un documentaliste et éditeur en chef de la revue intellectuelle et culturelle "Revue Études".
Voici la liste brute de tous les thèmes et mots-clés d'articles actuellement présents sur le site :
${JSON.stringify(uniqueThemes)}

Ta mission :
1. Organise TOUS ces thèmes dans une structure hiérarchique claire et élégante à deux niveaux :
   - De 4 à 8 "Grands Thèmes" représentatifs (exemples classiques : "Philosophie & Éthique", "Sciences & Technologies", "Société & Politique", "Économie & Écologie", "Arts & Culture", "Spiritualités & Religions", "Relations Internationales").
   - Dans chaque Grand Thème, place sous le tableau "sousThemes" tous les thèmes fournis qui s'y rapportent le plus logiquement.
2. Assure-toi que chaque thème fourni est rattaché à au moins un Grand Thème. Tu peux capitaliser proprement les noms de sous-thèmes.
3. Retourne UNIQUEMENT un tableau JSON valide au format exact suivant, sans texte explicatif ni markdown :
[
  {
    "grandTheme": "Nom du Grand Thème",
    "sousThemes": ["Sous-thème 1", "Sous-thème 2"]
  }
]`;

  let responseText = '';
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });
    responseText = res.text ?? '';
  } catch (err) {
    console.warn('[Gemini] Erreur modèle principal, essai gemini-1.5-flash:', err);
    try {
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });
      responseText = fallbackRes.text ?? '';
    } catch (e2) {
      console.error('[Gemini] Échec complet appel Gemini, repli taxonomie:', e2);
      return fallbackClassifyThemes(uniqueThemes);
    }
  }

  try {
    const cleaned = cleanJsonMarkdown(responseText);
    const parsed = JSON.parse(cleaned) as Array<{ grandTheme: string; sousThemes: string[] }>;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((g) => g && typeof g.grandTheme === 'string' && Array.isArray(g.sousThemes))
        .map((g) => ({
          id: slugify(g.grandTheme) || `group-${Math.random().toString(36).slice(2, 7)}`,
          grandTheme: g.grandTheme.trim(),
          sousThemes: Array.from(new Set(g.sousThemes.map((s) => String(s).trim()).filter(Boolean))),
        }));
    }
  } catch (parseErr) {
    console.error('[Gemini] Erreur parsing JSON classification:', parseErr, responseText);
  }

  return fallbackClassifyThemes(uniqueThemes);
}

/**
 * Analyse une étude spécifique (titre, sous-titre, description)
 * et suggère un Grand Thème et des sous-thèmes grâce à Gemini.
 */
export async function classifyArticleWithGemini(
  article: {
    title: string;
    subtitle?: string;
    author?: string;
    description?: string;
  },
  existingGrandThemes: string[] = [],
  customApiKey?: string,
): Promise<{ grandTheme: string; sousThemes: string[] }> {
  const apiKey = customApiKey?.trim() || (await getEffectiveGeminiApiKey());

  if (!apiKey) {
    return {
      grandTheme: existingGrandThemes[0] || 'Philosophie & Éthique',
      sousThemes: ['Essai', 'Étude'],
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Tu es un documentaliste et éditeur en chef de la revue intellectuelle et culturelle "Revue Études".
Analyse les informations de l'article suivant :
Titre : ${article.title}
${article.subtitle ? `Sous-titre : ${article.subtitle}` : ''}
${article.author ? `Auteur : ${article.author}` : ''}
${article.description ? `Description / Résumé : ${article.description}` : ''}

${
  existingGrandThemes.length > 0
    ? `Voici la liste des Grands Thèmes déjà existants sur le site (choisis de préférence l'un d'entre eux s'il correspond bien) :\n${JSON.stringify(existingGrandThemes)}`
    : ''
}

Ta mission :
1. Choisis le "Grand Thème" le plus approprié pour cet article (ex: "Philosophie & Éthique", "Sciences & Technologies", "Société & Politique", etc.).
2. Propose entre 2 et 4 "sousThemes" précis, élégants et pertinents (mots-clés en français).

Retourne UNIQUEMENT un objet JSON valide au format exact suivant, sans texte explicatif ni markdown :
{
  "grandTheme": "Nom du Grand Thème",
  "sousThemes": ["Sous-thème 1", "Sous-thème 2", "Sous-thème 3"]
}`;

  let responseText = '';
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    responseText = res.text ?? '';
  } catch {
    const fallbackRes = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    responseText = fallbackRes.text ?? '';
  }

  try {
    const cleaned = cleanJsonMarkdown(responseText);
    const parsed = JSON.parse(cleaned) as { grandTheme?: string; sousThemes?: string[] };
    if (parsed && typeof parsed.grandTheme === 'string') {
      const sousThemes = Array.isArray(parsed.sousThemes)
        ? parsed.sousThemes.map((s) => String(s).trim()).filter(Boolean)
        : [];
      return {
        grandTheme: parsed.grandTheme.trim(),
        sousThemes,
      };
    }
  } catch (err) {
    console.error('[Gemini] Erreur analyse article JSON:', err, responseText);
  }

  return {
    grandTheme: existingGrandThemes[0] || 'Philosophie & Éthique',
    sousThemes: ['Étude'],
  };
}

/**
 * Fonction de classification intelligente de secours (règles et dictionnaire)
 */
function fallbackClassifyThemes(uniqueThemes: string[]): ThemeGroup[] {
  const groups: ThemeGroup[] = DEFAULT_THEME_TAXONOMY.map((def) => ({
    id: slugify(def.grandTheme),
    grandTheme: def.grandTheme,
    sousThemes: [],
  }));

  const unclassified: string[] = [];

  for (const theme of uniqueThemes) {
    const tLower = theme.toLowerCase().trim();
    let matched = false;

    for (let i = 0; i < DEFAULT_THEME_TAXONOMY.length; i++) {
      const def = DEFAULT_THEME_TAXONOMY[i];
      if (
        def.sousThemes.some(
          (k) => tLower.includes(k) || k.includes(tLower),
        )
      ) {
        groups[i].sousThemes.push(theme);
        matched = true;
        break;
      }
    }

    if (!matched) {
      unclassified.push(theme);
    }
  }

  // On retire les groupes vides
  const activeGroups = groups.filter((g) => g.sousThemes.length > 0);

  // Si des thèmes ne correspondent à rien, on les place dans "Autres thèmes"
  if (unclassified.length > 0) {
    activeGroups.push({
      id: 'autres-themes',
      grandTheme: 'Autres thèmes',
      sousThemes: unclassified,
    });
  }

  return activeGroups;
}
