import { DocumentFormat } from '../types/vault';

export interface GeneratedSampleBook {
  title: string;
  author?: string;
  description: string;
  category: string;
  isFavorite?: boolean;
  originalName: string;
  format: DocumentFormat;
  buffer: ArrayBuffer;
}

function buildValidMultiPagePdfBuffer(): ArrayBuffer {
  const pagesContent = [
    [
      'BT /F1 20 Tf 56 750 Td (Principes de Typographie et Mise en Page) Tj ET',
      'BT /F1 11 Tf 56 722 Td (Cahier Technique — Edition Numerique — Page 1 / 3) Tj ET',
      '56 710 483 1 re f',
      'BT /F1 13 Tf 56 680 Td (1. Rythme Vertical et Confort de Lecture) Tj ET',
      'BT /F1 11 Tf 56 656 Td (La lisibilite d un texte long repose sur l equilibre entre la largeur de la) Tj ET',
      'BT /F1 11 Tf 56 638 Td (colonne (idealement comprise entre 60 et 75 caracteres) et la hauteur de) Tj ET',
      'BT /F1 11 Tf 56 620 Td (ligne. Un interlignage genereux permet a l oeil de passer d une ligne a) Tj ET',
      'BT /F1 11 Tf 56 602 Td (la suivante sans effort ni perte de repere visuel.) Tj ET',
      'BT /F1 13 Tf 56 562 Td (2. Hierarchie et Contraste des Surfaces) Tj ET',
      'BT /F1 11 Tf 56 538 Td (En lecture sur ecran, un contraste excessif (blanc pur sur noir absolu)) Tj ET',
      'BT /F1 11 Tf 56 520 Td (peut provoquer une fatigue oculaire rapide. Des nuances d anthracite, de) Tj ET',
      'BT /F1 11 Tf 56 502 Td (zinc ou de papier creme adoucissent la luminance tout en preservant la) Tj ET',
      'BT /F1 11 Tf 56 484 Td (nettete des glyphes.) Tj ET',
      'BT /F1 10 Tf 56 90 Td (Cahier Technique — Principes de Typographie — Page 1) Tj ET',
    ],
    [
      'BT /F1 18 Tf 56 750 Td (Grilles Modulaires et Marges) Tj ET',
      'BT /F1 11 Tf 56 722 Td (Cahier Technique — Edition Numerique — Page 2 / 3) Tj ET',
      '56 710 483 1 re f',
      'BT /F1 13 Tf 56 680 Td (3. Le Role du Blanc Typographique) Tj ET',
      'BT /F1 11 Tf 56 656 Td (Les marges ne sont pas un espace passif : elles encadrent le texte et) Tj ET',
      'BT /F1 11 Tf 56 638 Td (isolent le contenu des bordures de l interface. Elles offrent egalement) Tj ET',
      'BT /F1 11 Tf 56 620 Td (un espace naturel pour les signets et les annotations personnelles.) Tj ET',
      'BT /F1 13 Tf 56 580 Td (4. Polices Serif et Sans-Serif) Tj ET',
      'BT /F1 11 Tf 56 556 Td (Les caracteres a empattements (Serif) guident horizontalement le regard) Tj ET',
      'BT /F1 11 Tf 56 538 Td (dans les romans et les essais, tandis que les lineales geometriques) Tj ET',
      'BT /F1 11 Tf 56 520 Td (structurent efficacement les titres, les sommaires et la documentation) Tj ET',
      'BT /F1 11 Tf 56 502 Td (technique.) Tj ET',
      'BT /F1 10 Tf 56 90 Td (Cahier Technique — Principes de Typographie — Page 2) Tj ET',
    ],
    [
      'BT /F1 18 Tf 56 750 Td (Annotations, Signets et Reprise de Lecture) Tj ET',
      'BT /F1 11 Tf 56 722 Td (Cahier Technique — Edition Numerique — Page 3 / 3) Tj ET',
      '56 710 483 1 re f',
      'BT /F1 13 Tf 56 680 Td (5. Pratique de la Lecture Active) Tj ET',
      'BT /F1 11 Tf 56 656 Td (Poser un signet ou rediger une note en marge d une page permet de) Tj ET',
      'BT /F1 11 Tf 56 638 Td (transformer une simple consultation en veritable travail d appropriation.) Tj ET',
      'BT /F1 11 Tf 56 620 Td (Utilisez le panneau lateral Notes et Signets pour enregistrer vos) Tj ET',
      'BT /F1 11 Tf 56 602 Td (reperes sur cette page et y revenir en un clic.) Tj ET',
      'BT /F1 10 Tf 56 90 Td (Cahier Technique — Principes de Typographie — Page 3) Tj ET',
    ],
  ];

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  pagesContent.forEach((lines, idx) => {
    const pageObjNum = 4 + idx * 2;
    const streamObjNum = pageObjNum + 1;
    const streamData = lines.join('\n');
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${streamObjNum} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`
    );
  });

  let pdfText = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj;
  }

  const xrefStart = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfText += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfText).buffer as ArrayBuffer;
}

async function buildValidEpubBuffer(): Promise<ArrayBuffer> {
  if (!window.JSZip) {
    throw new Error('JSZip non disponible');
  }
  const zip = new window.JSZip();

  zip.file('mimetype', 'application/epub+zip');

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Éloge du Silence et de la Lecture Lente</dc:title>
    <dc:creator>Claire Valmont</dc:creator>
    <dc:language>fr</dc:language>
    <dc:description>&lt;div&gt;&lt;p&gt;Une réflexion littéraire sur le rythme de la lecture, la mémoire des livres et l&amp;rsquo;attention calme dans un monde saturé de sollicitations.&lt;/p&gt;&lt;/div&gt;</dc:description>
    <dc:identifier id="BookId">urn:uuid:9ab4908e-e1df-4570-a259-695dee7665a5</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
    <itemref idref="chap3"/>
  </spine>
</package>`
  );

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:9ab4908e-e1df-4570-a259-695dee7665a5"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>Éloge du Silence et de la Lecture Lente</text>
  </docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Chapitre I — Le Temps Retrouvé</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
    <navPoint id="navPoint-2" playOrder="2">
      <navLabel><text>Chapitre II — Les Marges du Livre</text></navLabel>
      <content src="chapter2.xhtml"/>
    </navPoint>
    <navPoint id="navPoint-3" playOrder="3">
      <navLabel><text>Chapitre III — Une Bibliothèque à Soi</text></navLabel>
      <content src="chapter3.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
  );

  zip.file(
    'OEBPS/chapter1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head>
  <title>Chapitre I — Le Temps Retrouvé</title>
</head>
<body>
  <h1>Chapitre I — Le Temps Retrouvé</h1>
  <p>Ouvrir un livre revient à suspendre le flux discontinu des heures pour entrer dans une durée continue. Là où l’information immédiate fragmente l’attention, la lecture au long cours restaure la patience de la pensée.</p>
  <blockquote>« Lire, c’est accorder à une voix étrangère le silence nécessaire pour qu’elle résonne en nous. »</blockquote>
  <p>Chaque lecteur construit peu à peu sa propre géographie intérieure à travers les œuvres qu’il choisit de conserver, de relire et d’annoter.</p>
</body>
</html>`
  );

  zip.file(
    'OEBPS/chapter2.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head>
  <title>Chapitre II — Les Marges du Livre</title>
</head>
<body>
  <h1>Chapitre II — Les Marges du Livre</h1>
  <p>Depuis les manuscrits médiévaux jusqu’aux éditions contemporaines, la marge a toujours été le lieu du dialogue entre l’auteur et le lecteur. Un signet glissé entre deux pages ou une note griffonnée au détour d’un paragraphe jalonnent le cheminement d’une réflexion.</p>
  <p>Grâce aux outils de signets et d’annotations intégrés à cette liseuse, vous pouvez associer vos remarques personnelles à chaque chapitre et les retrouver instantanément.</p>
</body>
</html>`
  );

  zip.file(
    'OEBPS/chapter3.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head>
  <title>Chapitre III — Une Bibliothèque à Soi</title>
</head>
<body>
  <h1>Chapitre III — Une Bibliothèque à Soi</h1>
  <p>Une bibliothèque personnelle ne se mesure pas au nombre de volumes qu’elle rassemble, mais à la cohérence des liens qui unissent ses ouvrages. Classer ses lectures par catégories, marquer ses textes favoris et reprendre un livre exactement à la ligne quittée la veille constituent les gestes simples d’un lecteur attentif.</p>
</body>
</html>`
  );

  return zip.generateAsync({
    type: 'arraybuffer',
    mimeType: 'application/epub+zip',
  });
}

export async function generateSampleBooks(): Promise<GeneratedSampleBook[]> {
  const encoder = new TextEncoder();

  const markdownSample = `# Carnets d'Esthétique et d'Architecture Éditoriale

L'art de concevoir un espace de lecture numérique repose sur l'effacement de l'outil au profit du texte.

---

## 1. La Sobriété de l'Interface

Une interface de lecture bien pensée adopte des tons neutres et feutrés, réduisant les distractions visuelles pour laisser toute sa place à la typographie et à la structure du propos.

> « La meilleure interface est celle qui sait se faire oublier dès la première phrase lue. »

---

## 2. Organisation des Ouvrages

Pour accompagner le travail intellectuel au quotidien, la bibliothèque s'articule autour de quatre axes complémentaires :

| Outil | Rôle dans la bibliothèque | Usage pendant la lecture |
| :--- | :--- | :--- |
| **Catégories** | Classement thématique (*Essais*, *Fiction*, *Technique*, *Articles*) | Filtrage rapide de la collection |
| **Favoris** | Accès direct aux ouvrages de référence | Marquage en un clic depuis l'en-tête |
| **Signets** | Repères de pages ou de chapitres clés | Saut instantané vers un passage |
| **Notes** | Annotations personnelles contextualisées | Édition, consultation et export |

---

## 3. Confort de Lecture

Vous pouvez ajuster la taille des caractères, choisir entre une police à empattements (*Serif*) ou géométrique (*Sans*), et basculer entre les thèmes **Sombre**, **Clair** et **Sépia**. Votre position de défilement est mémorisée automatiquement.`;

  const txtSample = `FRAGMENT D'HIVER — NOUVELLE
============================

La pluie fine battait doucement contre les hautes fenêtres de la bibliothèque municipale. Sur la table de chêne, une lampe à abat-jour d'opaline découpait un cercle de lumière tiède autour de quelques feuillets manuscrits.

Julien referma son carnet de notes et observa les rayonnages silencieux qui s'élevaient jusqu'à la galerie supérieure. Chaque volume semblait contenir une saison entière, patiemment pliée entre deux couvertures de toile sobre.

Plus loin, au détour d'un couloir bordé d'atlas anciens, l'horloge du vestibule sonna six heures. Il glissa un signet à la page entamée, rangea ses feuillets dans sa serviette et reprit sa marche sous les arcades humides du soir.`;

  const samples: GeneratedSampleBook[] = [
    {
      title: "Carnets d'Esthétique et d'Architecture Éditoriale",
      author: 'Atelier Typographique',
      description:
        "Réflexions sur la sobriété des interfaces de lecture numérique, l'organisation thématique d'une collection personnelle et la pratique des annotations.",
      category: 'Articles',
      isFavorite: true,
      originalName: 'carnets-esthetique-editoriale.md',
      format: 'md',
      buffer: encoder.encode(markdownSample).buffer as ArrayBuffer,
    },
    {
      title: 'Principes de Typographie et Mise en Page',
      author: 'Institut du Livre',
      description:
        'Synthèse technique en trois pages consacrée au rythme vertical, aux grilles modulaires, au choix des polices et au confort visuel sur écran.',
      category: 'Technique',
      isFavorite: false,
      originalName: 'principes-typographie-mise-en-page.pdf',
      format: 'pdf',
      buffer: buildValidMultiPagePdfBuffer(),
    },
    {
      title: "Fragment d'Hiver",
      author: 'Julien Moreau',
      description:
        "Récit court évoquant l'atmosphère feutrée d'une bibliothèque un soir de pluie, entre carnets manuscrits et atlas anciens.",
      category: 'Fiction',
      isFavorite: false,
      originalName: 'fragment-d-hiver.txt',
      format: 'txt',
      buffer: encoder.encode(txtSample).buffer as ArrayBuffer,
    },
  ];

  try {
    const epubBuffer = await buildValidEpubBuffer();
    samples.splice(1, 0, {
      title: 'Éloge du Silence et de la Lecture Lente',
      author: 'Claire Valmont',
      description:
        'Une réflexion littéraire sur le rythme de la lecture, la mémoire des livres et l’attention calme dans un monde saturé de sollicitations.',
      category: 'Essais',
      isFavorite: true,
      originalName: 'eloge-du-silence-lecture-lente.epub',
      format: 'epub',
      buffer: epubBuffer,
    });
  } catch {
    // Conserver les 3 autres ouvrages si JSZip n'est pas encore initialisé
  }

  return samples;
}
