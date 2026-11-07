/**
 * Catalogue des applications du Hub personnel (Freebox Delta).
 * Pour ajouter une nouvelle application plus tard, ajoutez simplement une entrée dans `HUB_APPS`.
 */

export type HubAppStatus = 'online' | 'coming_soon';

export interface HubAppItem {
  id: string;
  number: string;
  name: string;
  subtitle: string;
  description: string;
  category: 'Lecture & Savoir' | 'Productivité' | 'Stockage & Médias' | 'Système';
  href: string;
  status: HubAppStatus;
  badge: string;
  tags: string[];
  icon: 'book' | 'file' | 'drive' | 'lock' | 'sparkle' | 'bookmark';
  featured?: boolean;
}

export const HUB_APPS: HubAppItem[] = [
  {
    id: 'folio-reader',
    number: '01',
    name: 'Folio',
    subtitle: 'Bibliothèque & Liseuse Chiffrée',
    description:
      'Bibliothèque numérique zéro-connaissance avec chiffrement local AES-256-GCM, liseuse multi-formats, surlignages colorés, annotations et synchronisation Google Drive.',
    category: 'Lecture & Savoir',
    href: '/reader',
    status: 'online',
    badge: 'Actif • AES-256-GCM',
    tags: ['PDF', 'EPUB', 'Markdown', 'Google Drive', 'Zéro-connaissance'],
    icon: 'book',
    featured: true,
  },
  {
    id: 'codex-notes',
    number: '02',
    name: 'Codex',
    subtitle: 'Carnet de Notes & Second Cerveau',
    description:
      'Espace d’écriture minimaliste en Markdown relié à vos lectures, fiches de synthèse et recherche plein texte chiffrée.',
    category: 'Productivité',
    href: '#coming-soon',
    status: 'coming_soon',
    badge: 'Prochainement',
    tags: ['Markdown', 'Fiches', 'Liens bidirectionnels'],
    icon: 'file',
  },
  {
    id: 'archive-drive',
    number: '03',
    name: 'Coffre Drive',
    subtitle: 'Stockage de Documents & Archives',
    description:
      'Dépôt personnel sécurisé sur la Freebox Delta pour vos documents administratifs, archives et sauvegardes chiffrées.',
    category: 'Stockage & Médias',
    href: '#coming-soon',
    status: 'coming_soon',
    badge: 'Prochainement',
    tags: ['Freebox VM', 'Chiffrement', 'Partage privé'],
    icon: 'drive',
  },
  {
    id: 'gazette-rss',
    number: '04',
    name: 'La Gazette',
    subtitle: 'Veille & Flux de Lecture',
    description:
      'Agrégateur d’articles, newsletters et flux RSS épuré, sans algorithme ni publicité, avec envoi en un clic vers Folio.',
    category: 'Lecture & Savoir',
    href: '#coming-soon',
    status: 'coming_soon',
    badge: 'Prochainement',
    tags: ['RSS', 'Articles', 'Mode lecture'],
    icon: 'bookmark',
  },
];
