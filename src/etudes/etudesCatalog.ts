/**
 * Catalogue éditorial complet de la revue « Études — Revue de culture contemporaine »
 * Reproduit fidèlement les données du design Figma (svlydaZ169BAsHSgqHY869, node 1:5)
 * et génère le contenu intégral lisible et annotable dans la liseuse Folio (VaultReaderModal).
 */

import thumb0 from './assets/thumb-0.png';
import thumb1 from './assets/thumb-1.png';
import thumb2 from './assets/thumb-2.png';
import thumb3 from './assets/thumb-3.png';
import thumb4 from './assets/thumb-4.png';
import thumb5 from './assets/thumb-5.png';
import thumb6 from './assets/thumb-6.png';
import thumb7 from './assets/thumb-7.png';
import thumb8 from './assets/thumb-8.png';
import thumb9 from './assets/thumb-9.png';
import thumb10 from './assets/thumb-10.png';
import thumb11 from './assets/thumb-11.png';
import thumb12 from './assets/thumb-12.png';
import thumb13 from './assets/thumb-13.png';
import thumb14 from './assets/thumb-14.png';
import thumb15 from './assets/thumb-15.png';
import thumb16 from './assets/thumb-16.png';
import thumb17 from './assets/thumb-17.png';
import thumb18 from './assets/thumb-18.png';
import thumb19 from './assets/thumb-19.png';
import thumb20 from './assets/thumb-20.png';

export interface EtudeIssue {
  id: string;
  issueRef: string;
  title: string;
  year: number;
  monthLabel: string;
  issueNumber: string;
  coverUrl: string;
  coverWidth: number;
  coverHeight: number;
  featured?: boolean;
  authors: string[];
  summary: string;
  themes: string[];
  markdownContent: string;
}

export interface EtudeConsultedArticle {
  id: string;
  categoryLabel: string;
  title: string;
  subtitle?: string;
  authors: string[];
  issueCitation: string;
  issueRef: string;
  pages: string;
  year: number;
  summary: string;
  markdownContent: string;
}

export interface EtudeListEntry {
  id: string;
  badge: string;
  title: string;
  author: string;
  itemsCountLabel: string;
  description: string;
  itemIds: string[];
}

export interface EtudeMediaItem {
  id: string;
  kind: 'Podcast' | 'Vidéo' | 'Entretien';
  title: string;
  speaker: string;
  duration: string;
  dateLabel: string;
  issueRef: string;
  summary: string;
  markdownTranscript: string;
}

function buildIssueMarkdown(params: {
  issueRef: string;
  title: string;
  authors: string[];
  summary: string;
  themes: string[];
}): string {
  const { issueRef, title, authors, summary, themes } = params;
  return `# ${title}

**Revue Études — ${issueRef}**  
*Revue de culture contemporaine • S.E.R. (Société d'Édition de Revues)*  
**Contributeurs principaux :** ${authors.join(', ')}  
**Thématiques :** ${themes.join(' · ')}

---

## Éditorial & Présentation du dossier

${summary}

Fondée en 1856, la revue *Études* propose chaque mois un discernement approfondi sur les mutations contemporaines : géopolitique, philosophie politique, sciences, écologie, spiritualité, esthétique et transformations sociales. Ce numéro (${issueRef}) croise les regards de chercheurs, de praticiens et de philosophes pour éclairer les enjeux de long terme derrière l'actualité immédiate.

> « Comprendre notre temps exige de tenir ensemble la rigueur de l'enquête empirique et l'exigence d'une réflexion éthique ouverte au dialogue. »

---

## I. État des lieux et dynamiques historiques

L'analyse de **${title.toLowerCase()}** impose d'abord un retour sur la généalogie des institutions et des représentations qui structurent le débat contemporain. Depuis une vingtaine d'années, les cadres d'analyse classiques se trouvent bousculés par trois phénomènes simultanés :

1. **L'accélération des interdépendances techniques et énergétiques**, qui redéfinit la souveraineté des États et la temporalité de la décision publique.
2. **La recomposition des équilibres internationaux**, marquée par le retour des logiques de puissance et la fragilisation du multilatéralisme.
3. **La demande démocratique de transparence et de délibération**, face à des choix collectifs dont les conséquences engagent plusieurs générations.

Les contributions réunies dans cette première partie mettent en lumière les tensions entre expertise scientifique, acceptabilité sociale et responsabilité politique. Elles montrent comment les controverses actuelles révèlent des conceptions divergentes du bien commun et du rapport au temps long.

---

## II. Enjeux éthiques, politiques et sociaux

Dans un second mouvement, ce dossier interroge les critères d'un jugement juste face aux dilemmes pratiques auxquels sont confrontés les acteurs de terrain. Qu'il s'agisse des institutions publiques, des collectifs citoyens ou des instances internationales, la tentation est souvent grande de réduire des questions complexes à une alternative binaire entre technocratisme et repli identitaire.

### 1. La médiation démocratique à l'épreuve

Comment organiser une délibération éclairée lorsque les savoirs mobilisés sont hautement spécialisés et que la défiance envers les institutions s'accroît ? Les auteurs soulignent l'importance des corps intermédiaires, des lieux d'enseignement et des espaces éditoriaux capables de traduire les résultats de la recherche en questions politiques partagées.

### 2. Justice intergénérationnelle et solidarités

Un fil conducteur traverse l'ensemble des articles de ce numéro : le souci de ne pas dissocier l'efficacité immédiate de la justice envers les plus vulnérables et envers les générations futures. Cette attention éthique invite à repenser nos modèles de développement, nos architectures de sécurité et nos pratiques éducatives.

---

## III. Perspectives européennes et internationales

La troisième section élargit la focale aux scènes européenne et mondiale. Les comparaisons internationales présentées par **${authors.join(' et ')}** permettent de dépasser le seul prisme hexagonal :

- **L'échelle européenne** apparaît comme un espace indispensable de régulation, d'investissement et de coopération scientifique, à condition de consolider sa légitimité démocratique.
- **Le dialogue Nord-Sud et les fractures géopolitiques** rappellent qu'aucune réponse durable ne peut être construite dans l'isolement ou le déni des asymétries historiques.
- **Les ressources culturelles et spirituelles** offrent des repères précieux pour traverser les crises sans céder au fatalisme.

---

## IV. Chroniques, Culture & Recensions

En complément du dossier central, ce numéro d'*Études* rassemble ses rubriques habituelles :

- **Carnet de théâtre et de cinéma** : lectures critiques des créations contemporaines qui interrogent la mémoire, l'exil et les métamorphoses du lien social.
- **Arts visuels et littérature** : parcours à travers les œuvres récentes et les grandes expositions de la saison.
- **Notes de lecture** : recensions détaillées d'une trentaine d'essais en philosophie, histoire, théologie, sociologie et sciences politiques.

---

*Vous pouvez surligner des passages, ajouter des notes d'étude chiffrées et poser des signets dans ce numéro grâce aux outils de la liseuse Folio.*
`;
}

export const ETUDES_LATEST_ISSUE: EtudeIssue = {
  id: 'etudes-issue-4342',
  issueRef: '2026/11 N° 4342',
  title: 'La gestion des déchets nucléaires',
  year: 2026,
  monthLabel: 'Novembre 2026',
  issueNumber: '4342',
  coverUrl: thumb0,
  coverWidth: 197,
  coverHeight: 300,
  featured: true,
  authors: ['François Euvé', 'Julie Gauthier', 'Yannick Barthe', 'Sophie Bretesché'],
  summary:
    "Avec Cigéo et le renouveau du programme électronucléaire français, la gestion à très long terme des déchets radioactifs de haute activité pose une question inédite : comment décider aujourd'hui pour des échelles de temps qui dépassent l'histoire des civilisations ?",
  themes: ['Écologie & Énergie', 'Sciences & Technique', 'Éthique du temps long', 'Démocratie technique'],
  markdownContent: buildIssueMarkdown({
    issueRef: '2026/11 N° 4342',
    title: 'La gestion des déchets nucléaires',
    authors: ['François Euvé', 'Julie Gauthier', 'Yannick Barthe', 'Sophie Bretesché'],
    summary:
      "Le projet d'enfouissement géologique profond (Cigéo) à Bure et la relance de nouveaux réacteurs placent la question des déchets nucléaires au cœur du débat démocratique et éthique. Ce dossier croise physique nucléaire, sociologie des sciences et philosophie de la responsabilité intergénérationnelle.",
    themes: ['Énergie nucléaire', 'Cigéo', 'Temps long', 'Éthique environnementale'],
  }),
};

export const ETUDES_RECENT_ISSUES: EtudeIssue[] = [
  {
    id: 'etudes-issue-4341',
    issueRef: '2026/10 N° 4341',
    title: 'Le Liban au péril de la guerre',
    year: 2026,
    monthLabel: 'Octobre 2026',
    issueNumber: '4341',
    coverUrl: thumb1,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Karim Émile Bitar', 'Carla Eddé', 'Ziad Majed'],
    summary:
      "Entre effondrement économique, paralysie institutionnelle et embrasement régional, comment la société libanaise résiste-t-elle et quelles voies de souveraineté demeurent ouvertes ?",
    themes: ['Proche-Orient', 'Géopolitique', 'Liban', 'Société civile'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/10 N° 4341',
      title: 'Le Liban au péril de la guerre',
      authors: ['Karim Émile Bitar', 'Carla Eddé', 'Ziad Majed'],
      summary:
        "Analyse approfondie de la crise multidimensionnelle que traverse le Liban face aux conflits régionaux, à la crise bancaire et aux défis de la reconstruction politique.",
      themes: ['Proche-Orient', 'Géopolitique', 'Liban'],
    }),
  },
  {
    id: 'etudes-issue-4340',
    issueRef: '2026/9 N° 4340',
    title: 'Les nouveaux visages de la censure',
    year: 2026,
    monthLabel: 'Septembre 2026',
    issueNumber: '4340',
    coverUrl: thumb2,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Nathalie Heinich', 'Jean-Marie Schaeffer', 'Marc Crépon'],
    summary:
      "Des algorithmes de modération aux pressions idéologiques et politiques sur la création artistique et l'édition, enquête sur les métamorphoses contemporaines de la censure.",
    themes: ['Liberté d’expression', 'Culture', 'Numérique', 'Démocratie'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/9 N° 4340',
      title: 'Les nouveaux visages de la censure',
      authors: ['Nathalie Heinich', 'Jean-Marie Schaeffer', 'Marc Crépon'],
      summary:
        "Des plateformes numériques aux universités et au monde de l'édition, comment distinguer la régulation légitime de la parole publique et les nouvelles formes d'intimidation intellectuelle ?",
      themes: ['Liberté d’expression', 'Culture', 'Numérique'],
    }),
  },
  {
    id: 'etudes-issue-4339',
    issueRef: '2026/7 N° 4339',
    title: 'La mer, nouvel espace stratégique',
    year: 2026,
    monthLabel: 'Juillet-Août 2026',
    issueNumber: '4339',
    coverUrl: thumb3,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Cyrille Coutansais', 'Camille Morel', 'Hervé Baudu'],
    summary:
      "Câbles sous-marins, routes commerciales, grands fonds et militarisation des détroits : les océans sont devenus le théâtre majeur des rivalités de puissance au XXIe siècle.",
    themes: ['Géopolitique maritime', 'Océans', 'Câbles sous-marins', 'Droit de la mer'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/7 N° 4339',
      title: 'La mer, nouvel espace stratégique',
      authors: ['Cyrille Coutansais', 'Camille Morel', 'Hervé Baudu'],
      summary:
        "De l'Indo-Pacifique à l'Arctique en passant par la mer Rouge, la maritimisation du monde place les océans au cœur des enjeux écologiques et militaires.",
      themes: ['Géopolitique maritime', 'Océans', 'Souveraineté'],
    }),
  },
  {
    id: 'etudes-issue-4338',
    issueRef: '2026/6 N° 4338',
    title: "L'Inde de Modi",
    year: 2026,
    monthLabel: 'Juin 2026',
    issueNumber: '4338',
    coverUrl: thumb4,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Christophe Jaffrelot', 'Stéphanie Tawa Lama-Rewal', 'Jean-Luc Racine'],
    summary:
      "Puissance démographique et technologique incontournable, l'Inde conjugue ambition internationale dans le « Sud global » et nationalisme hindou (Hindutva) à l'intérieur.",
    themes: ['Asie', 'Inde', 'Démocratie', 'Géopolitique'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/6 N° 4338',
      title: "L'Inde de Modi",
      authors: ['Christophe Jaffrelot', 'Stéphanie Tawa Lama-Rewal', 'Jean-Luc Racine'],
      summary:
        "Décryptage des transformations politiques, économiques et religieuses de l'Union indienne après plus d'une décennie de pouvoir nationaliste hindou.",
      themes: ['Inde', 'Asie', 'Nationalisme', 'Économie émergente'],
    }),
  },
  {
    id: 'etudes-issue-4337',
    issueRef: '2026/5 N° 4337',
    title: "L'agriculture en crise",
    year: 2026,
    monthLabel: 'Mai 2026',
    issueNumber: '4337',
    coverUrl: thumb5,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Bertrand Hervieu', 'François Purseigle', 'Marc Dufumier'],
    summary:
      "Revenu paysan, transition agroécologique, souveraineté alimentaire et renouvellement des générations : comprendre les fractures profondes du monde agricole européen.",
    themes: ['Agriculture', 'Écologie', 'Territoires', 'Europe'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/5 N° 4337',
      title: "L'agriculture en crise",
      authors: ['Bertrand Hervieu', 'François Purseigle', 'Marc Dufumier'],
      summary:
        "Les mobilisations agricoles témoignent d'un malaise structurel entre injonctions contradictoires, concurrence internationale et dérèglement climatique.",
      themes: ['Agriculture', 'Agroécologie', 'Souveraineté alimentaire'],
    }),
  },
  {
    id: 'etudes-issue-4336',
    issueRef: '2026/4 N° 4336',
    title: 'Quelles réponses face aux violences sexuelles ?',
    year: 2026,
    monthLabel: 'Avril 2026',
    issueNumber: '4336',
    coverUrl: thumb6,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Antoine Garapon', 'Véronique Margron', 'Irène Théry'],
    summary:
      "Justice restaurative, écoute des victimes, transformations du droit pénal et responsabilité des institutions : quelles réponses collectives à la hauteur des révélations ?",
    themes: ['Justice', 'Société', 'Justice restaurative', 'Éthique'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/4 N° 4336',
      title: 'Quelles réponses face aux violences sexuelles ?',
      authors: ['Antoine Garapon', 'Véronique Margron', 'Irène Théry'],
      summary:
        "Retour sur les avancées de la justice restaurative, le travail des commissions indépendantes et les mutations du consentement dans le droit contemporain.",
      themes: ['Justice', 'Droit', 'Justice restaurative'],
    }),
  },
  {
    id: 'etudes-issue-4335',
    issueRef: '2026/3 N° 4335',
    title: "L'Europe face à Trump",
    year: 2026,
    monthLabel: 'Mars 2026',
    issueNumber: '4335',
    coverUrl: thumb7,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Laurence Nardon', 'Pierre Vimont', 'Sylvie Kauffmann'],
    summary:
      "Défense européenne, guerre commerciale, OTAN et soutien à l'Ukraine : comment l'Union européenne peut-elle affirmer son autonomie stratégique face au tournant américain ?",
    themes: ['Europe', 'États-Unis', 'Défense', 'Relations transatlantiques'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/3 N° 4335',
      title: "L'Europe face à Trump",
      authors: ['Laurence Nardon', 'Pierre Vimont', 'Sylvie Kauffmann'],
      summary:
        "La remise en cause du lien transatlantique oblige les capitales européennes à repenser en urgence leur architecture de sécurité et leur modèle économique.",
      themes: ['Europe', 'États-Unis', 'Autonomie stratégique'],
    }),
  },
  {
    id: 'etudes-issue-4334',
    issueRef: '2026/2 N° 4334',
    title: 'La laïcité, 120 ans après',
    year: 2026,
    monthLabel: 'Février 2026',
    issueNumber: '4334',
    coverUrl: thumb8,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Jean Baubérot', 'Philippe Portier', 'Valentine Zuber'],
    summary:
      "Un siècle et demi après les grands débats républicains et 120 ans après la loi de 1905, comment préserver la laïcité comme cadre de liberté et de paix civile ?",
    themes: ['Laïcité', 'République', 'Histoire', 'Religions'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/2 N° 4334',
      title: 'La laïcité, 120 ans après',
      authors: ['Jean Baubérot', 'Philippe Portier', 'Valentine Zuber'],
      summary:
        "Histoire et actualité de la loi de 1905 : entre fidélité à l'esprit libéral des fondateurs et défis de la pluralité religieuse contemporaine.",
      themes: ['Laïcité', 'Droit', 'Histoire politique'],
    }),
  },
  {
    id: 'etudes-issue-4333',
    issueRef: '2026/1 N° 4333',
    title: 'Faut-il avoir peur de la chute démographique ?',
    year: 2026,
    monthLabel: 'Janvier 2026',
    issueNumber: '4333',
    coverUrl: thumb9,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Gilles Pison', 'Hervé Le Bras', 'Cécile Détang-Dessendre'],
    summary:
      "Baisse de la fécondité, vieillissement accéléré en Europe et en Asie orientale, transitions africaines : ce que disent réellement les projections démographiques.",
    themes: ['Démographie', 'Société', 'Économie', 'Générations'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2026/1 N° 4333',
      title: 'Faut-il avoir peur de la chute démographique ?',
      authors: ['Gilles Pison', 'Hervé Le Bras', 'Cécile Détang-Dessendre'],
      summary:
        "Au-delà des discours alarmistes sur le « réarmement démographique », une lecture rigoureuse des transformations familiales et générationnelles.",
      themes: ['Démographie', 'Population', 'Protection sociale'],
    }),
  },
  {
    id: 'etudes-issue-2025-12',
    issueRef: '2025/12 Décembre',
    title: "L'avenir de la Nouvelle-Calédonie",
    year: 2025,
    monthLabel: 'Décembre 2025',
    issueNumber: '4332',
    coverUrl: thumb10,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Alban Bensa', 'Isabelle Merle', 'Jean-Marc Regnault'],
    summary:
      "Après l'épuisement du processus de Nouméa et les graves crises de 2024, quelles voies pour renouer le fil du dialogue et construire un destin commun sur le Caillou ?",
    themes: ['Outre-mer', 'Nouvelle-Calédonie', 'Politique', 'Décolonisation'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/12 Décembre',
      title: "L'avenir de la Nouvelle-Calédonie",
      authors: ['Alban Bensa', 'Isabelle Merle', 'Jean-Marc Regnault'],
      summary:
        "Comprendre les racines historiques, sociales et institutionnelles de la crise calédonienne et les conditions d'un nouvel accord durable.",
      themes: ['Nouvelle-Calédonie', 'Pacifique', 'Institutions'],
    }),
  },
  {
    id: 'etudes-issue-2025-11',
    issueRef: '2025/11 Novembre',
    title: 'La médecine face à la fin de vie',
    year: 2025,
    monthLabel: 'Novembre 2025',
    issueNumber: '4331',
    coverUrl: thumb11,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Régis Aubry', 'Claire Fourcade', 'Éric Fourneret'],
    summary:
      "Soins palliatifs, évolution législative, accompagnement de la vulnérabilité et discernement clinique : la parole des soignants et des éthiciens.",
    themes: ['Bioéthique', 'Médecine', 'Fin de vie', 'Soins palliatifs'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/11 Novembre',
      title: 'La médecine face à la fin de vie',
      authors: ['Régis Aubry', 'Claire Fourcade', 'Éric Fourneret'],
      summary:
        "Quelles conséquences éthiques et relationnelles pour le soin et la fraternité lorsque la loi redéfinit les frontières de l'accompagnement en fin de vie ?",
      themes: ['Bioéthique', 'Soin', 'Fin de vie'],
    }),
  },
  {
    id: 'etudes-issue-2025-10',
    issueRef: '2025/10 Octobre',
    title: 'Les fracturations de la société française',
    year: 2025,
    monthLabel: 'Octobre 2025',
    issueNumber: '4330',
    coverUrl: thumb12,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Jérôme Fourquet', 'Camille Peugny', 'Nicolas Duvoux'],
    summary:
      "Archipélisation électorale, polarisation territoriale, déclassement ressenti et crise de la représentation : radiographie de la société française contemporaine.",
    themes: ['Sociologie', 'France', 'Politique', 'Cohésion sociale'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/10 Octobre',
      title: 'Les fracturations de la société française',
      authors: ['Jérôme Fourquet', 'Camille Peugny', 'Nicolas Duvoux'],
      summary:
        "Enquête sur les lignes de faille géographiques, générationnelles et culturelles qui traversent la France et mettent à l'épreuve le pacte républicain.",
      themes: ['Sociologie', 'France', 'Inégalités'],
    }),
  },
  {
    id: 'etudes-issue-2025-9',
    issueRef: '2025/9 Septembre',
    title: 'Le retour du religieux en politique',
    year: 2025,
    monthLabel: 'Septembre 2025',
    issueNumber: '4329',
    coverUrl: thumb13,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Olivier Roy', 'Denis Pelletier', 'Kathy Rousselet'],
    summary:
      "Des États-Unis à la Russie, de l'Inde au Moyen-Orient, comment les référentiels religieux sont mobilisés par les projets nationalistes et identitaires.",
    themes: ['Religions', 'Politique', 'Sécularisation', 'Relations internationales'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/9 Septembre',
      title: 'Le retour du religieux en politique',
      authors: ['Olivier Roy', 'Denis Pelletier', 'Kathy Rousselet'],
      summary:
        "Loin d'un simple retour de la foi traditionnelle, l'instrumentalisation identitaire du religieux redessine les clivages politiques mondiaux.",
      themes: ['Religions', 'Politique', 'Identité'],
    }),
  },
  {
    id: 'etudes-issue-2025-7',
    issueRef: '2025/7 Juillet-Août',
    title: 'Habiter la Terre autrement',
    year: 2025,
    monthLabel: 'Juillet-Août 2025',
    issueNumber: '4328',
    coverUrl: thumb14,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Philippe Descola', 'Baptiste Morizot', 'Corine Pelluchon'],
    summary:
      "Renouer nos liens avec le vivant : philosophie de l'écologie, architecture frugale, droit des milieux naturels et spiritualité de la création.",
    themes: ['Écologie', 'Philosophie', 'Vivant', 'Architecture'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/7 Juillet-Août',
      title: 'Habiter la Terre autrement',
      authors: ['Philippe Descola', 'Baptiste Morizot', 'Corine Pelluchon'],
      summary:
        "Dépasser le dualisme entre nature et culture pour inventer de nouvelles manières d'habiter et de partager les milieux terrestres.",
      themes: ['Écologie', 'Philosophie', 'Anthropologie'],
    }),
  },
  {
    id: 'etudes-issue-2025-6',
    issueRef: '2025/6 Juin',
    title: "L'école à l'épreuve des inégalités",
    year: 2025,
    monthLabel: 'Juin 2025',
    issueNumber: '4327',
    coverUrl: thumb15,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['François Dubet', 'Marie Duru-Bellat', 'Pierre Merle'],
    summary:
      "Mixité sociale, crise du recrutement enseignant, groupes de niveau et promesse méritocratique : comment redonner sens à l'institution scolaire ?",
    themes: ['Éducation', 'École', 'Inégalités', 'Pédagogie'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/6 Juin',
      title: "L'école à l'épreuve des inégalités",
      authors: ['François Dubet', 'Marie Duru-Bellat', 'Pierre Merle'],
      summary:
        "Pourquoi le système scolaire français peine-t-il autant à réduire les écarts sociaux et quelles réformes pédagogiques peuvent inverser la tendance ?",
      themes: ['Éducation', 'Sociologie', 'École'],
    }),
  },
  {
    id: 'etudes-issue-2025-5',
    issueRef: '2025/5 Mai',
    title: "La Chine face au ralentissement",
    year: 2025,
    monthLabel: 'Mai 2025',
    issueNumber: '4326',
    coverUrl: thumb16,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Jean-Pierre Cabestan', 'Alice Ekman', 'Mary-Françoise Renard'],
    summary:
      "Crise immobilière, chômage des jeunes, vieillissement démographique et primauté du contrôle idéologique : où va la Chine de Xi Jinping ?",
    themes: ['Chine', 'Économie', 'Géopolitique', 'Asie'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/5 Mai',
      title: 'La Chine face au ralentissement',
      authors: ['Jean-Pierre Cabestan', 'Alice Ekman', 'Mary-Françoise Renard'],
      summary:
        "Analyse des vulnérabilités économiques internes de la puissance chinoise et de leurs répercussions sur sa posture diplomatique et militaire.",
      themes: ['Chine', 'Économie internationale', 'Géopolitique'],
    }),
  },
  {
    id: 'etudes-issue-2025-4',
    issueRef: '2025/4 Avril',
    title: 'Quel travail demain ?',
    year: 2025,
    monthLabel: 'Avril 2025',
    issueNumber: '4325',
    coverUrl: thumb17,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Dominique Méda', 'Thomas Coutrot', 'Bruno Palier'],
    summary:
      "Quête de sens, intelligence artificielle générative, télétravail et reconnaissance des métiers du lien : les grandes métamorphoses du travail.",
    themes: ['Travail', 'Économie', 'Intelligence artificielle', 'Société'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/4 Avril',
      title: 'Quel travail demain ?',
      authors: ['Dominique Méda', 'Thomas Coutrot', 'Bruno Palier'],
      summary:
        "Comment l'automatisation cognitive et les aspirations écologiques transforment-elles le rapport au travail et le dialogue social ?",
      themes: ['Travail', 'IA', 'Sociologie du travail'],
    }),
  },
  {
    id: 'etudes-issue-2025-3',
    issueRef: '2025/3 Mars',
    title: 'Ukraine : trois ans de guerre',
    year: 2025,
    monthLabel: 'Mars 2025',
    issueNumber: '4324',
    coverUrl: thumb18,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Anna Colin Lebedev', 'Tatiana Kastouéva-Jean', 'Michel Eltchaninoff'],
    summary:
      "Résilience de la société ukrainienne, économie de guerre russe et recomposition de la sécurité du continent européen après trois années de conflit de haute intensité.",
    themes: ['Ukraine', 'Russie', 'Europe', 'Guerre'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/3 Mars',
      title: 'Ukraine : trois ans de guerre',
      authors: ['Anna Colin Lebedev', 'Tatiana Kastouéva-Jean', 'Michel Eltchaninoff'],
      summary:
        "Bilan humain, militaire et politique de trois années d'agression russe contre l'Ukraine et perspectives pour la sécurité européenne.",
      themes: ['Ukraine', 'Russie', 'Sécurité européenne'],
    }),
  },
  {
    id: 'etudes-issue-2025-2',
    issueRef: '2025/2 Février',
    title: "L'intelligence artificielle et nous",
    year: 2025,
    monthLabel: 'Février 2025',
    issueNumber: '4323',
    coverUrl: thumb19,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Laurence Devillers', 'Jean-Gabriel Ganascia', 'Éric Sadin'],
    summary:
      "Grands modèles de langage, souveraineté numérique, création culturelle et anthropologie du langage : que fait l'IA générative à notre condition humaine ?",
    themes: ['Intelligence artificielle', 'Philosophie', 'Numérique', 'Éthique'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/2 Février',
      title: "L'intelligence artificielle et nous",
      authors: ['Laurence Devillers', 'Jean-Gabriel Ganascia', 'Éric Sadin'],
      summary:
        "Entre promesses scientifiques et risques d'uniformisation cognitive, un discernement philosophique et technique sur l'IA générative.",
      themes: ['IA', 'Éthique du numérique', 'Philosophie'],
    }),
  },
  {
    id: 'etudes-issue-2025-1',
    issueRef: '2025/1 Janvier',
    title: 'La crise du logement',
    year: 2025,
    monthLabel: 'Janvier 2025',
    issueNumber: '4322',
    coverUrl: thumb20,
    coverWidth: 206,
    coverHeight: 300,
    authors: ['Christophe Robert', 'Jean-Claude Driant', 'Pierre Madec'],
    summary:
      "Cherté du foncier, rénovation thermique, blocage du parcours résidentiel et hausse du sans-abrisme : pourquoi le logement est devenu la première fracture sociale.",
    themes: ['Logement', 'Ville', 'Politiques sociales', 'Économie'],
    markdownContent: buildIssueMarkdown({
      issueRef: '2025/1 Janvier',
      title: 'La crise du logement',
      authors: ['Christophe Robert', 'Jean-Claude Driant', 'Pierre Madec'],
      summary:
        "Analyse économique et sociale d'une crise systémique qui touche aussi bien les ménages précaires que les étudiants et les classes moyennes.",
      themes: ['Logement', 'Urbanisme', 'Justice sociale'],
    }),
  },
];

export const ETUDES_ALL_ISSUES: EtudeIssue[] = [
  ETUDES_LATEST_ISSUE,
  ...ETUDES_RECENT_ISSUES,
];

export const ETUDES_MOST_CONSULTED_ARTICLES: EtudeConsultedArticle[] = [
  {
    id: 'etudes-art-populisme',
    categoryLabel: 'Article de revue',
    title: 'Qu’est-ce que le populisme ?',
    subtitle: 'Définir enfin la menace',
    authors: ['Jan-Werner Müller'],
    issueCitation: 'Dans Études 2017/4 (Avril), pages 7 à 18',
    issueRef: '2017/4 (Avril)',
    pages: 'pages 7 à 18',
    year: 2017,
    summary:
      "Le populisme n'est pas seulement une critique des élites : il se caractérise par la prétention morale au monopole de la représentation du « vrai peuple », niant ainsi le pluralisme démocratique.",
    markdownContent: `# Qu’est-ce que le populisme ?
## Définir enfin la menace

**Auteur :** Jan-Werner Müller  
**Publication :** *Dans Études 2017/4 (Avril), pages 7 à 18*

---

## Introduction : au-delà du flou conceptuel

Le terme « populisme » est aujourd'hui employé à tout propos, souvent pour disqualifier des adversaires politiques aux programmes économiques ou sociaux pourtant très différents. Mais existe-t-il un noyau conceptuel précis qui permette d'identifier rigoureusement les mouvements populistes, qu'ils soient au pouvoir ou dans l'opposition ?

Dans cet essai fondamental, **Jan-Werner Müller**, professeur de théorie politique à l'université de Princeton, propose une définition exigeante : la critique des élites est une condition nécessaire, mais nullement suffisante, pour qualifier un acteur de populiste. Tout citoyen dans une démocratie libre critique légitimement les élites.

---

## I. L'anti-pluralisme comme critère décisif

Ce qui distingue véritablement les populistes, c'est une **revendication morale de monopole** : ils affirment que *eux seuls* représentent le peuple authentique.

> « Les populistes ne disent pas seulement : "Nous sommes les 99 %". Ils affirment : "Nous sommes les 100 % du peuple véritable", ce qui implique que leurs concurrents politiques sont illégitimes et que les citoyens qui ne les soutiennent pas ne font pas vraiment partie du peuple. »

Dès lors, le populisme s'oppose frontalement au **pluralisme démocratique**, qui repose sur la reconnaissance que le peuple n'est jamais un corps homogène doté d'une volonté unique, mais une pluralité de citoyens aux intérêts et aux convictions légitimement divers.

---

## II. Comment gouvernent les populistes ?

Contrairement à une idée reçue selon laquelle les partis populistes s'effondreraient nécessairement à l'épreuve du pouvoir, l'expérience contemporaine montre qu'ils gouvernent selon trois techniques caractéristiques :

1. **La colonisation de l'État** : la fonction publique, les autorités indépendantes et la justice sont subordonnées au pouvoir exécutif au nom de la « volonté directe du peuple ».
2. **Le clientélisme de masse** : les ressources publiques sont distribuées de manière discriminatoire aux soutiens du régime, assimilés au « peuple méritant ».
3. **La répression graduelle de la société civile** : toute contestation émanant d'ONG, de médias indépendants ou d'universités est dénoncée comme une ingérence étrangère ou une trahison des élites.

---

## III. Comment débattre avec les populistes sans les renforcer ?

Jan-Werner Müller met en garde contre deux erreurs symétriques des démocrates libéraux :

- **L'exclusion morale hautaine**, qui conforte le récit populiste d'une élite méprisante confisquant le débat.
- **L'imitation des thèmes et du langage populistes**, qui légitime leur cadrage anti-pluraliste.

Répondre au défi populiste suppose au contraire de prendre au sérieux les problèmes réels d'inégalités et de représentation qu'ils pointent, tout en réaffirmant avec fermeté les règles du pluralisme constitutionnel.
`,
  },
  {
    id: 'etudes-art-ia-enjeux',
    categoryLabel: 'Article de revue',
    title: "L'intelligence artificielle : enjeux et limites",
    subtitle: undefined,
    authors: ['Jean-Gabriel Ganascia'],
    issueCitation: 'Dans Études 2023/5 (Mai), pages 41 à 52',
    issueRef: '2023/5 (Mai)',
    pages: 'pages 41 à 52',
    year: 2023,
    summary:
      "Entre fantasmes transhumanistes et mutations bien réelles du traitement du langage et des connaissances, comment distinguer les capacités statistiques des machines de l'intelligence humaine ?",
    markdownContent: `# L'intelligence artificielle : enjeux et limites

**Auteur :** Jean-Gabriel Ganascia  
**Publication :** *Dans Études 2023/5 (Mai), pages 41 à 52*

---

## I. Genèse d'une discipline scientifique

Inventée lors de la conférence de Dartmouth en 1956 par John McCarthy, Marvin Minsky, Claude Shannon et Nathaniel Rochester, l'**intelligence artificielle (IA)** repose sur la conjecture selon laquelle chaque aspect de l'apprentissage ou toute autre caractéristique de l'intelligence peut être décrit avec une précision suffisante pour qu'une machine puisse le simuler.

Pourtant, comme le rappelle **Jean-Gabriel Ganascia**, informaticien et philosophe, simuler un comportement cognitif à l'aide d'un modèle mathématique ne signifie pas reproduire la conscience, l'intentionnalité ou le jugement moral humains.

---

## II. L'essor de l'apprentissage profond et des modèles génératifs

La révolution actuelle des grands modèles de langage (LLM) repose sur la convergence de trois facteurs :
1. L'accumulation de masses considérables de données numériques.
2. La puissance de calcul des processeurs graphiques massivement parallèles.
3. Les architectures neuronales à mécanismes d'attention (*Transformers*).

Ces systèmes excellent dans la prédiction probabiliste de séquences linguistiques ou visuelles, mais ils demeurent dépourvus de rapport référentiel au monde réel et au vrai : d'où le phénomène structurel des « hallucinations ».

---

## III. Enjeux éthiques et épistémologiques

Les véritables risques de l'intelligence artificielle ne résident pas dans une hypothétique prise de pouvoir par des machines autonomes, mais dans :
- **La délégation aveugle de la décision** (justice prédictive, crédit social, sélection algorithmique).
- **L'appauvrissement de l'espace informationnel** par la génération industrielle de faux contenus et la polarisation.
- **L'hégémonie industrielle** d'un petit nombre d'acteurs technologiques.

L'enjeu majeur pour nos sociétés démocratiques est donc de cultiver l'esprit critique, l'explicabilité des algorithmes et la responsabilité humaine finale.
`,
  },
  {
    id: 'etudes-art-familles',
    categoryLabel: 'Article de revue',
    title: 'Les transformations de la famille contemporaine',
    subtitle: undefined,
    authors: ['Irène Théry'],
    issueCitation: 'Dans Études 2021/10 (Octobre), pages 31 à 42',
    issueRef: '2021/10 (Octobre)',
    pages: 'pages 31 à 42',
    year: 2021,
    summary:
      "Démariage, recompositions familiales, égalité des sexes et nouvelles filiations : comment le droit et les mœurs redéfinissent les liens d'alliance et de parenté.",
    markdownContent: `# Les transformations de la famille contemporaine

**Auteure :** Irène Théry  
**Publication :** *Dans Études 2021/10 (Octobre), pages 31 à 42*

---

## I. Du modèle institutionnel au couple relationnel

Depuis les années 1970, la famille occidentale a connu une mutation anthropologique et juridique sans précédent. Jadis fondée sur une hiérarchie statutaire entre les sexes et sur l'indissolubilité du mariage, elle s'est réorganisée autour de deux principes directeurs : **l'égalité entre les partenaires** et **l'inconditionnalité de la responsabilité parentale envers l'enfant**.

**Irène Théry**, sociologue du droit et de la parenté, montre que ces transformations ne traduisent pas une « crise de la famille », mais une recomposition exigeante des solidarités privées.

---

## II. Pluralité des trajectoires et constance de la filiation

Familles recomposées, monoparentales, homoparentales ou issues de l'assistance médicale à la procréation : la diversité des configurations familiales contemporaines met en lumière la distinction entre engendrement biologique et parenté instituée.

Le défi contemporain du droit civil est d'assurer à chaque enfant la sécurité de sa filiation et l'accès au récit de ses origines, dans le respect de l'égale dignité des personnes.
`,
  },
  {
    id: 'etudes-art-biodiversite',
    categoryLabel: 'Article de revue',
    title: 'La crise de la biodiversité : un défi spirituel et politique',
    subtitle: undefined,
    authors: ['Cécile Renouard', 'François Euvé'],
    issueCitation: 'Dans Études 2022/9 (Septembre), pages 19 à 30',
    issueRef: '2022/9 (Septembre)',
    pages: 'pages 19 à 30',
    year: 2022,
    summary:
      "Souvent éclipsé par le seul indicateur carbone, l'effondrement du tissu vivant appelle une refonte de nos indicateurs économiques et une conversion de notre regard sur la nature.",
    markdownContent: `# La crise de la biodiversité : un défi spirituel et politique

**Auteurs :** Cécile Renouard, François Euvé  
**Publication :** *Dans Études 2022/9 (Septembre), pages 19 à 30*

---

## I. Le vivant au-delà de la comptabilité carbone

La crise écologique ne se résume pas au réchauffement climatique mesuré en tonnes d'équivalent CO₂. L'érosion rapide de la biodiversité — disparition des insectes pollinisateurs, artificialisation des sols, dégradation des écosystèmes marins et forestiers — menace directement l'habitabilité de la Terre.

**Cécile Renouard** et **François Euvé** soulignent qu'une approche purement techniciste du climat peut parfois aggraver les pressions sur les milieux naturels si elle ne s'accompagne pas d'une sobriété structurelle.

---

## II. Pour une économie relationnelle et une éthique des communs

Intégrer la valeur intrinsèque des milieux vivants dans les choix économiques suppose de considérer les écosystèmes comme des **biens communs** et de reconnaître notre interdépendance constitutive avec l'ensemble des êtres vivants.
`,
  },
  {
    id: 'etudes-art-travail-sens',
    categoryLabel: 'Article de revue',
    title: 'Retrouver le sens du travail',
    subtitle: 'Entre intensification et quête d’utilité sociale',
    authors: ['Dominique Méda', 'Thomas Coutrot'],
    issueCitation: 'Dans Études 2023/1 (Janvier), pages 55 à 66',
    issueRef: '2023/1 (Janvier)',
    pages: 'pages 55 à 66',
    year: 2023,
    summary:
      "Pourquoi tant de salariés expriment-ils un sentiment d'empêchement dans leur métier ? Analyse des conditions d'un travail émancipateur et écologiquement soutenable.",
    markdownContent: `# Retrouver le sens du travail
## Entre intensification et quête d’utilité sociale

**Auteurs :** Dominique Méda, Thomas Coutrot  
**Publication :** *Dans Études 2023/1 (Janvier), pages 55 à 66*

---

## I. Le paradoxe français du rapport au travail

Les enquêtes sociologiques européennes révèlent un paradoxe constant : la France est l'un des pays où l'importance accordée au travail dans l'identité personnelle est la plus élevée, mais aussi celui où le souhait de voir le travail occuper moins de place est le plus fort.

Ce paradoxe s'explique par la diffusion d'un management par les chiffres qui éloigne les professionnels des règles de l'art de leur métier, qu'il s'agisse de l'hôpital, de l'école ou de l'industrie.

---

## II. Les trois dimensions du sens au travail

Selon **Dominique Méda** et **Thomas Coutrot**, le sens du travail repose sur trois piliers indissociables :
1. **L'utilité sociale et écologique** de ce qui est produit.
2. **La cohérence éthique** entre les prescriptions de l'organisation et la conscience professionnelle.
3. **La capacité de développement** et d'apprentissage collectif au sein du collectif de travail.
`,
  },
  {
    id: 'etudes-art-geopolitique-europe',
    categoryLabel: 'Article de revue',
    title: "L'Union européenne à l'heure de la géopolitique",
    subtitle: undefined,
    authors: ['Sylvain Kahn', 'Pierre Vimont'],
    issueCitation: 'Dans Études 2024/3 (Mars), pages 7 à 19',
    issueRef: '2024/3 (Mars)',
    pages: 'pages 7 à 19',
    year: 2024,
    summary:
      "Longtemps construite sur le doux commerce et la norme juridique, l'Union européenne apprend dans l'urgence le langage de la puissance, de la défense et de l'élargissement.",
    markdownContent: `# L'Union européenne à l'heure de la géopolitique

**Auteurs :** Sylvain Kahn, Pierre Vimont  
**Publication :** *Dans Études 2024/3 (Mars), pages 7 à 19*

---

## I. La fin de l'innocence géopolitique européenne

Construite après 1945 comme un projet de paix par le droit et par l'intégration économique, l'Union européenne a longtemps pensé que l'interdépendance commerciale suffirait à pacifier son voisinage. Le retour de la guerre de haute intensité sur le continent européen et la rivalité systémique sino-américaine ont mis fin à cette illusion.

---

## II. Souveraineté industrielle, défense et élargissement

Pour devenir un acteur géopolitique à part entière, l'Europe doit relever simultanément trois défis :
- Bâtir une **base industrielle et technologique de défense** crédible.
- Sécuriser ses chaînes d'approvisionnement énergétiques et numériques.
- Réformer sa gouvernance institutionnelle pour préparer l'intégration de nouveaux États membres à l'Est et dans les Balkans.
`,
  },
];

export const ETUDES_PUBLIC_LISTS: EtudeListEntry[] = [
  {
    id: 'etudes-list-us-foreign',
    badge: 'Liste publique',
    title: 'Politique américaine et politique étrangère',
    author: 'Études',
    itemsCountLabel: '24 éléments',
    description:
      "Sélection éditoriale de la rédaction d'Études consacrée aux mutations de la démocratie américaine, au lien transatlantique et aux recompositions de la politique étrangère des États-Unis.",
    itemIds: [
      'etudes-issue-4335',
      'etudes-art-populisme',
      'etudes-art-geopolitique-europe',
      'etudes-issue-4341',
      'etudes-issue-4339',
      'etudes-issue-2025-3',
    ],
  },
  {
    id: 'etudes-list-ecologie-sciences',
    badge: 'Liste publique',
    title: 'Écologie, sciences et éthique du futur',
    author: 'Études',
    itemsCountLabel: '16 éléments',
    description:
      "Dossiers et articles de référence sur la transition énergétique, la gestion des déchets nucléaires, la biodiversité et la gouvernance démocratique des choix scientifiques.",
    itemIds: [
      'etudes-issue-4342',
      'etudes-art-biodiversite',
      'etudes-issue-4337',
      'etudes-issue-2025-7',
      'etudes-art-ia-enjeux',
    ],
  },
];

export const ETUDES_MEDIA_ITEMS: EtudeMediaItem[] = [
  {
    id: 'etudes-media-1',
    kind: 'Podcast',
    title: 'Déchets nucléaires : décider pour cent mille ans',
    speaker: 'François Euvé & Yannick Barthe',
    duration: '38 min',
    dateLabel: 'Novembre 2026',
    issueRef: '2026/11 N° 4342',
    summary:
      "Entretien autour du dossier du numéro 4342 : comment la mémoire d'un site d'enfouissement géologique profond peut-elle être transmise aux générations futures ?",
    markdownTranscript: `# Podcast Études — Déchets nucléaires : décider pour cent mille ans

**Intervenants :** François Euvé (rédacteur en chef d'*Études*, physicien et théologien) & Yannick Barthe (sociologue au CNRS)  
**Durée :** 38 min • **Numéro associé :** *Études* 2026/11 (N° 4342)

---

## Transcription intégrale de l'entretien

**François Euvé :** Le projet Cigéo à Bure prévoit d'enfouir à 500 mètres de profondeur les déchets radioactifs les plus dangereux issus du parc électronucléaire français. Nous parlons ici d'échelles de temps de plusieurs dizaines, voire centaines de milliers d'années. Comment la sociologie politique aborde-t-elle un tel objet ?

**Yannick Barthe :** Ce qui rend le dossier des déchets nucléaires unique, c'est qu'il met en tension la temporalité courte de la décision politique et industrielle avec une temporalité quasi géologique. C'est pourquoi la notion de *réversibilité* a joué un rôle central : elle reconnaît notre propre faillibilité et laisse aux générations suivantes la possibilité de récupérer les colis ou de modifier le dispositif si de nouvelles connaissances scientifiques apparaissent.

**François Euvé :** C'est aussi une leçon d'humilité technique et démocratique : accepter que la technique ne clôt jamais définitivement la question politique.
`,
  },
  {
    id: 'etudes-media-2',
    kind: 'Entretien',
    title: 'Le Liban et les recompositions du Proche-Orient',
    speaker: 'Karim Émile Bitar',
    duration: '32 min',
    dateLabel: 'Octobre 2026',
    issueRef: '2026/10 N° 4341',
    summary:
      "Analyse géopolitique des lignes de fracture au Levant et de la résilience de la société civile libanaise.",
    markdownTranscript: `# Entretien Études — Le Liban et les recompositions du Proche-Orient

**Intervenant :** Karim Émile Bitar (professeur de relations internationales à l'Université Saint-Joseph de Beyrouth)  
**Durée :** 32 min • **Numéro associé :** *Études* 2026/10 (N° 4341)

---

## Transcription intégrale

**Rédaction d'Études :** Malgré l'accumulation des crises depuis 2019, la société civile, les universités et le tissu culturel libanais continuent de faire preuve d'une vitalité remarquable. Sur quelles ressources s'appuie cette résilience ?

**Karim Émile Bitar :** Il faut distinguer la résilience admirable des citoyens — qui suppléent aux défaillances de l'État dans l'éducation, la santé et l'entraide — de l'instrumentalisation de ce mot par une classe politique qui s'en sert parfois pour différer les réformes structurelles indispensables à la refondation d'un État de droit.
`,
  },
  {
    id: 'etudes-media-3',
    kind: 'Vidéo',
    title: 'L’Europe peut-elle bâtir son autonomie stratégique ?',
    speaker: 'Laurence Nardon & Pierre Vimont',
    duration: '44 min',
    dateLabel: 'Mars 2026',
    issueRef: '2026/3 N° 4335',
    summary:
      "Table ronde enregistrée à Paris sur l'avenir de la défense européenne et des relations transatlantiques.",
    markdownTranscript: `# Vidéo Études — L’Europe peut-elle bâtir son autonomie stratégique ?

**Intervenants :** Laurence Nardon (IFRI) & Pierre Vimont (ambassadeur de France, Carnegie Europe)  
**Durée :** 44 min • **Numéro associé :** *Études* 2026/3 (N° 4335)

---

## Synthèse et verbatim de la table ronde

Les intervenants reviennent sur les étapes clés de la politique étrangère et de sécurité commune de l'Union européenne et analysent les conditions politiques, budgétaires et industrielles d'une véritable souveraineté européenne.
`,
  },
];

export const ETUDES_ABOUT_FULL_TEXT = {
  shortExcerpt:
    "Fondée en 1856, Études est une revue mensuelle généraliste de culture contemporaine publiée par la Société d'Édition de Revues (S.E.R.). Animée par des jésuites et un réseau d'universitaires, de chercheurs et d'acteurs de la vie publique, elle éclaire les grands débats internationaux, politiques, sociaux, scientifiques, artistiques et spirituels.",
  editorialTeam: [
    { role: 'Rédacteur en chef', name: 'François Euvé' },
    { role: 'Rédactrice en chef adjointe', name: 'Camille de Villeneuve' },
    { role: 'Éditeur', name: 'S.E.R. (Société d’Édition de Revues), Paris' },
    { role: 'Périodicité', name: '11 numéros par an (mensuel, numéro double en juillet-août)' },
    { role: 'ISSN', name: '0014-1941 • En ligne : 2102-5800' },
  ],
  sections: [
    {
      title: 'Une revue de discernement depuis 1856',
      body: "Créée en 1856 sous le titre d'Études de théologie, de philosophie et d'histoire, la revue Études s'est affirmée au fil des décennies comme l'une des grandes revues intellectuelles françaises. Ouverte au pluralisme des approches, elle conjugue rigueur universitaire, accessibilité d'écriture et attention aux questions éthiques et spirituelles.",
    },
    {
      title: 'Organisation des numéros',
      body: "Chaque livraison mensuelle s'articule autour de grandes rubriques : International, Politique & Société, Essais, Religions & Spiritualités, Figures libres, suivies d'un riche cahier Culture (cinéma, théâtre, expositions, musique, télévision) et d'une trentaine de recensions d'ouvrages.",
    },
    {
      title: 'Espace d’étude personnel & Intégration Folio',
      body: "Sur ce portail relié à votre compte Folio, vous pouvez consulter l'intégralité des numéros et articles dans la liseuse sécurisée, surligner des passages en quatre couleurs, enregistrer vos notes d'étude chiffrées en AES-256-GCM et déposer vos propres fichiers ou études (PDF, EPUB, Markdown, TXT) par simple glisser-déposer.",
    },
  ],
};
