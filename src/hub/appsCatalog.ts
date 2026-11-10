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
    subtitle: 'Reader • Bibliothèque & Liseuse',
    description:
      'Ouvrez vos documents, articles et contenus favoris dans un environnement calme.',
    details:
      'Bibliothèque numérique avec liseuse multi-formats (PDF, EPUB, Markdown, TXT), surlignages colorés, annotations et synchronisation Google Drive.',
    features: ['PDF & EPUB', 'Markdown & TXT', 'Notes & Surlignages', 'Annotations', 'Google Drive'],
    badge: 'Lecture',
    href: '/reader',
    status: 'online',
    ctaLabel: 'Lancer',
    icon: 'book-open',
  },
  {
    id: 'app-etudes',
    name: 'Études',
    subtitle: 'Revue de culture contemporaine • Espace d’études',
    description:
      'Déposez vos études et articles en versions multiples (VF, VO) et organisez vos listes de lecture.',
    details:
      'Portail relié à votre compte Folio avec stockage séparé : fiches d’études multi-versions (VF, VO, fichiers liés), listes personnalisables, import Drag & Drop et liseuse intégrée.',
    features: ['Versions VF & VO', 'Fichiers liés', 'Listes sur mesure', 'Drag & Drop', 'Liseuse intégrée'],
    badge: 'Revue',
    href: '/etudes',
    status: 'online',
    ctaLabel: 'Lancer',
    icon: 'etudes',
  },
  {
    id: 'app-cloud',
    name: 'Stockage cloud',
    subtitle: 'Espace personnel • Fichiers & Sauvegardes',
    description:
      'Accédez à vos fichiers, dossiers et synchronisez vos contenus en toute simplicité.',
    details:
      'Espace de stockage pour centraliser vos documents importants, archives personnelles et sauvegardes avec accès depuis tous vos appareils.',
    features: ['Fichiers & Dossiers', 'Synchronisation', 'Documents', 'Sauvegardes'],
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
