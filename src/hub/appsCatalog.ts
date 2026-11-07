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
    id: 'archive-drive',
    number: '02',
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
];
