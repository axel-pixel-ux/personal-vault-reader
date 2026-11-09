/**
 * Catalogue des applications de la page d'accueil (Launchpad).
 * Pour ajouter une nouvelle application plus tard, ajoutez simplement une entrée dans `HUB_APPS`.
 */

export type HubAppStatus = 'online' | 'cloud' | 'coming_soon';

export interface HubAppItem {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  details: string;
  features: string[];
  badge: string;
  href: string;
  status: HubAppStatus;
  ctaLabel: string;
  footerNote?: string;
  icon: 'book-open' | 'etudes' | 'cloud' | 'clock';
}

export const HUB_APPS: HubAppItem[] = [
  {
    id: 'app-reader',
    name: 'Folio',
    subtitle: 'Reader • Bibliothèque & Liseuse chiffrée',
    description:
      'Ouvrez vos documents, articles et contenus favoris dans un environnement calme.',
    details:
      'Bibliothèque numérique zéro-connaissance avec chiffrement local AES-256-GCM, liseuse multi-formats (PDF, EPUB, Markdown, TXT), surlignages colorés, annotations et synchronisation Google Drive.',
    features: ['PDF & EPUB', 'Markdown & TXT', 'AES-256-GCM', 'Annotations', 'Google Drive'],
    badge: 'Lecture',
    href: '/reader',
    status: 'online',
    ctaLabel: 'Lancer',
    icon: 'book-open',
  },
  {
    id: 'app-etudes',
    name: 'Études',
    subtitle: 'Revue de culture contemporaine • S.E.R.',
    description:
      'Consultez les numéros, articles et dossiers de la revue Études et déposez vos propres études.',
    details:
      'Portail éditorial relié à votre compte Folio : 21 numéros complets, articles les plus consultés, listes thématiques, podcasts, import Drag & Drop chiffré en AES-256-GCM et liseuse Folio intégrée.',
    features: ['Revue Études', 'Compte unifié Folio', 'Liseuse intégrée', 'Drag & Drop', 'Listes & Notes'],
    badge: 'Revue',
    href: '/etudes',
    status: 'online',
    ctaLabel: 'Lancer',
    icon: 'etudes',
  },
  {
    id: 'app-cloud',
    name: 'Stockage cloud',
    subtitle: 'Coffre personnel • Fichiers & Sauvegardes',
    description:
      'Accédez à vos fichiers, dossiers et synchronisez vos contenus en toute sécurité.',
    details:
      'Espace de stockage privé pour centraliser vos documents importants, archives personnelles et sauvegardes chiffrées avec accès sécurisé depuis tous vos appareils.',
    features: ['Fichiers & Dossiers', 'Synchronisation', 'Chiffrement privé', 'Sauvegardes'],
    badge: 'Stockage',
    href: '#cloud',
    status: 'cloud',
    ctaLabel: 'Ouvrir',
    icon: 'cloud',
  },
  {
    id: 'app-coming',
    name: 'Applications à venir',
    subtitle: 'Prochains services & Outils auto-hébergés',
    description:
      'D’autres services seront ajoutés ici au fil des mises à jour.',
    details:
      'De nouvelles applications personnelles et outils productifs viendront enrichir ce portail central au fur et à mesure de leur déploiement.',
    features: ['Nouveaux modules', 'Accès unifié', 'Mises à jour continues'],
    badge: 'Bientôt',
    href: '#coming-soon',
    status: 'coming_soon',
    ctaLabel: 'À venir',
    footerNote: 'Prévu prochainement',
    icon: 'clock',
  },
];
