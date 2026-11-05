# Personal Vault Reader — Plan d'Architecture & d'Interface

Ce document présente l'architecture complète de **Personal Vault Reader**, une bibliothèque numérique personnelle sécurisée fonctionnant intégralement dans le navigateur selon un modèle Zéro-Knowledge (chiffrement local `AES-256-GCM` avec dérivation `PBKDF2`) et intégrant quatre moteurs de lecture dédiés (`.txt`, `.md`, `.pdf`, `.epub`).

### User Review & Critical Decisions

> [!IMPORTANT]
> Les choix suivants ont été confirmés et guident la structure de ce plan ainsi que l'application livrée :

- **Focus prioritaire retenu** : Mise en avant détaillée de l'interface utilisateur (ergonomie de la bibliothèque, design système éditorial) et du fonctionnement des 4 lecteurs intégrés (`Marked.js`, `PDF.js`, `ePub.js` + `JSZip`, et lecteur texte typographique).
- **Périmètre fonctionnel** : Conservation du périmètre complet tel qu'implémenté (authentification Zéro-Knowledge, stockage chiffré `IndexedDB`, gestion documentaire et liseuses multi-formats avec sauvegarde de progression).

---

### 1. Overview & Core Concept

- **Ce que fait l'application** : **Personal Vault Reader** permet à un utilisateur unique de téléverser, chiffrer localement, organiser et lire ses livres numériques et documents textuels (`.txt`, `.md`, `.pdf`, `.epub`) sans qu'aucune donnée en clair ni aucune clé ne quitte son navigateur.
- **Public cible & Contexte d'usage** : Lecteurs, chercheurs, auteurs et professionnels souhaitant consulter et conserver des ouvrages ou notes confidentielles dans un environnement de lecture épuré, hors-ligne et cryptographiquement isolé.
- **Valeur ajoutée principale** : Alliance entre une sécurité cryptographique rigoureuse (`Web Crypto API` native, purge mémoire instantanée) et un confort de lecture éditorial sur mesure (barre d'outils rétractable, thèmes Sombre/Clair/Sépia, typographie ajustable et reprise automatique de la progression).

---

### 2. User Experience & Visual Design

#### Parcours Utilisateur Clés (Key User Flows)

1. **Premier lancement (Initialisation du Coffre)** :
   - L'utilisateur définit son nom de propriétaire et une clé maîtresse (passphrase).
   - Une jauge d'entropie évalue en temps réel la robustesse cryptographique (en bits d'entropie).
   - Une option permet d'inclure dès la création **4 ouvrages de démonstration chiffrés** (`.md`, `.pdf` multi-pages, `.epub` multi-chapitres, `.txt`) afin de tester immédiatement chaque lecteur.
2. **Ouverture de session & Écran de verrouillage strict** :
   - Aux lancements suivants, rien n'est accessible tant que la passphrase n'a pas été validée via le hash `PBKDF2 -> SHA-256` et le déchiffrement d'un jeton canari `AES-256-GCM`.
   - En cas d'oubli définitif de la clé maîtresse, un flux de réinitialisation protégé par confirmation textuelle (`SUPPRIMER`) permet de purger `IndexedDB`.
3. **Gestion de la Bibliothèque & Téléversement Chiffré** :
   - **Zone Drag & Drop et sélecteur de fichiers** : Validation stricte des extensions `.txt`, `.md`, `.pdf`, `.epub`. Chaque fichier est converti en `ArrayBuffer`, chiffré à la volée avec un vecteur `IV` aléatoire de 96 bits, puis stocké dans `IndexedDB`.
   - **Organisation & Recherche** : Filtrage instantané par mot-clé, filtre segmenté par format (`Tous`, `PDF`, `ePub`, `Markdown`, `Texte`), tri multi-critères (date d'ajout, lecture récente, progression, titre, taille) et bascule entre vue **Grille** et vue **Liste tabulaire**.
   - **Actions par document** : Ouvrir/Reprendre la lecture, renommer le titre directement en ligne, exporter une copie déchiffrée ou supprimer avec confirmation.
4. **Expérience de Lecture Multi-Formats (Modale Plein Écran)** :
   - **Barre d'outils supérieure rétractable** : Permet de masquer tous les contrôles d'interface pour une immersion totale, avec une pilule discrète affichant le pourcentage de progression pour réafficher la barre.
   - **Lecteur Markdown & Texte (`.md`, `.txt`)** :
     - Formatage Markdown complet via `Marked.js` avec assainissement HTML sécurisé.
     - Extraction automatique des titres (`H1`, `H2`, `H3`) dans un **Sommaire latéral interactif**.
     - Sélecteur de famille typographique (*Serif Éditorial*, *Sans Géométrique*, *Monospace*), réglage du corps de police (`13px` à `28px`), compteur de mots et temps de lecture estimé.
   - **Lecteur PDF (`.pdf` via Mozilla `PDF.js`)** :
     - Rendu haute densité (adapté au `devicePixelRatio`) sur `<canvas>`.
     - Contrôles complets : boutons Page précédente / Page suivante, navigation au clavier (`Flèche Gauche` / `Flèche Droite`), champ de **saut de page direct**, contrôles de **zoom** (`-`, `+`, `Réinitialiser` de `50%` à `250%`), **filtre de contraste nocturne** en mode sombre et **mode plein écran** natif.
   - **Lecteur ePub (`.epub` via `ePub.js` & `JSZip`)** :
     - Tiroir de **Table des matières par chapitres**, navigation page/chapitre précédent et suivant, ajustement dynamique de la taille de police et bascule entre le **mode paginé (`ePub.js`)** et le **mode flux continu XHTML** pour garantir une compatibilité universelle.
5. **Verrouillage immédiat (Purge Mémoire)** :
   - Accessible à tout instant depuis l'en-tête principal ou directement depuis la liseuse, le bouton **Verrouiller** écrase les tampons binaires déchiffrés en mémoire vive, détruit la référence `CryptoKey` et reverrouille instantanément l'interface.

#### Identité Visuelle & Thème

- **Direction esthétique** : Minimalisme éditorial et précision cryptographique, inspiré des salles de lecture d'archives et des tableaux de bord de sécurité modernes.
- **Palette de couleurs (Règle 60-30-10)** :
  - *60% Canevas neutre* : Ardoise profonde en mode sombre par défaut (`bg-slate-950` / `#020617`), papier pierre clair en mode jour (`bg-slate-50` / `bg-stone-50`), et parchemin chaud en mode lecture Sépia (`#f4ecd8`).
  - *30% Surfaces structurelles* : Cartes et barres d'outils à élévation unique (`bg-slate-900/70`, bordures fines `border-slate-800/90` en sombre, `border-slate-200` en clair).
  - *10% Accentuation fonctionnelle* : Ambre doré (`bg-amber-500` / `text-amber-400`) réservé aux actions primaires, à l'indicateur de progression et aux états actifs ; Émeraude (`text-emerald-400`) pour les validations cryptographiques.
- **Hiérarchie typographique (Règle 2+1)** :
  - *Interface & Titres (Sans géométrique)* : `Plus Jakarta Sans` pour la structure, la navigation et les contrôles.
  - *Corps de lecture littéraire (Serif éditorial)* : `Source Serif 4` avec mesure optimale de `65ch`–`70ch` et interlignage `1.75`–`1.8`.
  - *Données techniques & Chiffres tabulaires (Monospace)* : `JetBrains Mono` (`tabular-nums`) pour les empreintes `IV`, les sels hexadécimaux, la pagination PDF et les pourcentages de progression.

---

### 3. Key Product Decisions & Trade-Offs

- **Décision 1 : Clé `CryptoKey` non-extractible exclusivement en mémoire vive**
  - *Approche choisie* : Dériver la clé `AES-256-GCM` avec l'attribut `extractable: false` et la conserver uniquement dans l'état mémoire React (`sessionKey`).
  - *Pourquoi* : Empêche tout script tiers ou inspection du stockage local d'exporter la clé brute, et garantit que le rechargement de la page ou le clic sur « Verrouiller » exige une nouvelle saisie de la passphrase.
  - *Alternative écartée* : Stocker la clé dérivée dans `sessionStorage` (exposerait la clé en clair pendant la session).
- **Décision 2 : Double validation à l'ouverture (Hash PBKDF2-SHA256 + Jeton Canari AES-GCM)**
  - *Approche choisie* : Vérifier d'abord un hash dérivé avec un sel distinct (`verifierSalt`), puis déchiffrer un bloc témoin authentifié (`canaryCipher`) avec la clé `AES-256-GCM`.
  - *Pourquoi* : Valide simultanément la phrase secrète et l'intégrité du tag d'authentification Galois/Counter Mode (128 bits) avant d'autoriser l'accès à la bibliothèque.
- **Décision 3 : Moteur ePub hybride (`ePub.js` + extracteur de chapitres `JSZip`)**
  - *Approche choisie* : Combiner le rendu paginé `ePub.js` avec une analyse directe du manifeste `OPF` et des chapitres `XHTML` via `JSZip`.
  - *Pourquoi* : Permet d'afficher instantanément la table des matières complète et d'offrir un mode de lecture en flux continu même sur les fichiers ePub à structure complexe ou dans des environnements iframe restreints.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Diagramme d'Architecture & Hiérarchie des Composants

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION (État & Session)                         │
│  • sessionKey (CryptoKey AES-256-GCM en RAM uniquement)                      │
│  • authConfig (Configuration PBKDF2 & sels chargés depuis IndexedDB)         │
│  • documents (Métadonnées & progressions de lecture)                         │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
     [Session Verrouillée]                          [Session Déverrouillée]
                │                                              │
                ▼                                              ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│   Écran d'Accès Zéro-Knowledge│              │   Tableau de Bord Bibliothèque│
│  • Initialisation 1er départ  │              │  • En-tête 3 zones + Verrou   │
│  • Jauge d'entropie Passphrase│              │  • Zone Drag & Drop (.txt/md/ │
│  • Écran de verrouillage      │              │    .pdf/.epub)                │
│  • Réinitialisation protégée  │              │  • Recherche, Filtres & Tri   │
└───────────────┬───────────────┘              │  • Vue Grille / Vue Liste     │
                │                              │  • Registre d'Audit Crypto    │
                │                              └───────────────┬───────────────┘
                │                                              │
                │                                   [Ouverture & Déchiffrement]
                │                                              │
                │                                              ▼
                │                              ┌───────────────────────────────┐
                │                              │  Modale de Lecture Plein Écran│
                │                              │  • Barre d'outils rétractable │
                │                              │  • Thèmes Sombre/Clair/Sépia  │
                │                              │  • Contrôle corps de police   │
                │                              └───┬───────┬───────┬───────┬───┘
                │                                  │       │       │       │
                │                         ┌────────┘       │       │       └────────┐
                │                         ▼                ▼       ▼                ▼
                │                    ┌─────────┐      ┌─────────┐ ┌─────────┐  ┌─────────┐
                │                    │ Lecteur │      │ Lecteur │ │ Lecteur │  │ Lecteur │
                │                    │   TXT   │      │Markdown │ │ PDF.js  │  │ ePub.js │
                │                    │Typo pure│      │Marked.js│ │Zoom/Saut│  │Chapitres│
                │                    └────┬────┘      └────┬────┘ └────┬────┘  └────┬────┘
                │                         └────────────────┴─────┬─────┴────────────┘
                │                                                │
                ▼                                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│           COUCHE CRYPTOGRAPHIQUE & PERSISTANCE LOCALE (Navigateur)           │
│  • Web Crypto API : PBKDF2 (150 000 itérations, SHA-256) + AES-256-GCM (IV)  │
│  • IndexedDB (PersonalVaultReaderDB) :                                       │
│      ├── store `vault_auth`      (username, salt, verifierSalt, verifierHash)│
│      └── store `vault_documents` (encryptedData, iv, title, format, progress)│
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Modèle de Données & Persistance (`IndexedDB`)

1. **Magasin `vault_auth` (Clé : `'master_config'`)** :
   - Stocke `username`, `salt` (`Uint8Array` 16 octets), `verifierSalt` (`Uint8Array` 16 octets), `verifierHash` (empreinte hexadécimale `SHA-256`), `canaryIv` (`Uint8Array` 12 octets), `canaryCipher` (`ArrayBuffer`) et `iterations` (`150000`).
2. **Magasin `vault_documents` (Clé : `id` UUID)** :
   - Stocke les métadonnées (`title`, `originalName`, `format`, `size`, `cipherSize`, `ivHex`, `addedAt`, `lastOpenedAt`), l'objet `progress` (`percentage`, `page`, `totalPages`, `cfi`, `chapterIndex`, `chapterLabel`, `scrollRatio`, `updatedAt`), ainsi que le vecteur `iv` (`Uint8Array` 12 octets) et le blob binaire chiffré `encryptedData` (`ArrayBuffer`).

#### Cartographie des Interactions & Transitions d'État

- **Validation et Chiffrement à l'Upload** : Lorsqu'un fichier est déposé, l'application vérifie son extension (`.txt`, `.md`, `.pdf`, `.epub`), génère un `IV` aléatoire de 12 octets via `crypto.getRandomValues`, chiffre l'`ArrayBuffer` avec la clé de session `AES-256-GCM`, persiste l'enregistrement dans `IndexedDB` et rafraîchit instantanément la grille.
- **Déchiffrement à la Volée & Lecture** : Cliquer sur un document récupère l'enregistrement chiffré depuis `IndexedDB`, exécute `crypto.subtle.decrypt` en mémoire vive et transmet le tampon déchiffré au lecteur spécialisé correspondant au format.
- **Synchronisation Continue de la Progression** : Chaque changement de page PDF, de chapitre ePub ou de défilement Markdown/Texte déclenche une sauvegarde temporisée (debounce `250ms`) dans `IndexedDB` et met à jour la barre de progression en temps réel.
- **Purge de Sécurité à la Fermeture / Déconnexion** : À la fermeture du lecteur ou au clic sur « Verrouiller le coffre », le tampon mémoire `ArrayBuffer` est explicitement rempli de zéros (`new Uint8Array(buffer).fill(0)`) avant d'être détaché, garantissant qu'aucun contenu déchiffré ne subsiste.
