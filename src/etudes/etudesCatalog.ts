/**
 * Texte de présentation pour la section « À propos » du portail Études.
 * Aucun fichier, numéro ou liste de démonstration n'est pré-chargé :
 * seuls les fichiers déposés sur le site Études et « Ma liste de lecture » sont affichés.
 */

export const ETUDES_ABOUT_FULL_TEXT = {
  shortExcerpt:
    "Espace personnel dédié à vos études, articles de recherche et revues en versions multiples (VF, VO, annexes). Chiffrement de bout en bout AES-256-GCM relié à votre compte Folio, avec stockage strictement indépendant de votre bibliothèque Folio.",
  sections: [
    {
      title: 'Gestion multi-versions (VF, VO & fichiers liés)',
      body: "Chaque étude déposée dispose de sa propre page dédiée. Vous pouvez y consulter sa fiche complète, choisir la version à ouvrir dans la liseuse (par exemple Version Française VF ou Version Originale VO), et y rattacher à tout moment de nouveaux fichiers liés.",
    },
    {
      title: 'Listes de lecture personnalisées',
      body: "Organisez vos recherches à partir de « Ma liste de lecture » ou créez vos propres listes thématiques grâce au bouton « + ». Chaque liste peut être librement renommée, enrichie, modifiée ou supprimée.",
    },
    {
      title: 'Compte unifié & Stockage séparé',
      body: "Votre identifiant et votre clé de chiffrement AES-256-GCM sont partagés avec Folio pour vous éviter de créer deux comptes, mais vos études déposées ici restent strictement séparées des livres de votre bibliothèque Folio.",
    },
  ],
};
