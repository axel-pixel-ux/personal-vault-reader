export type DocumentFormat = 'txt' | 'md' | 'pdf' | 'epub';

export const DEFAULT_CATEGORIES = [
  'Essais',
  'Fiction',
  'Technique',
  'Articles',
] as const;

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface ReadingProgress {
  percentage: number;
  isRead?: boolean;
  page?: number;
  totalPages?: number;
  cfi?: string;
  chapterIndex?: number;
  chapterLabel?: string;
  scrollRatio?: number;
  updatedAt: number;
}

export interface VaultBookmark {
  id: string;
  label: string;
  createdAt: number;
  percentage: number;
  page?: number;
  cfi?: string;
  chapterIndex?: number;
  chapterLabel?: string;
  scrollRatio?: number;
}

/** Rectangle de surlignage PDF, normalisé (0..1) par rapport à la taille de la page. */
export interface PdfHighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VaultAnnotation {
  id: string;
  content: string;
  quote?: string;
  highlightColor?: HighlightColor;
  locationLabel: string;
  createdAt: number;
  updatedAt: number;
  percentage: number;
  page?: number;
  cfi?: string;
  chapterIndex?: number;
  scrollRatio?: number;
  rects?: PdfHighlightRect[];
}

export interface DocumentStudyData {
  bookmarks: VaultBookmark[];
  annotations: VaultAnnotation[];
}

export interface VaultDocumentMeta {
  id: string;
  title: string;
  author?: string;
  description: string;
  category: string;
  isFavorite: boolean;
  bookmarksCount: number;
  annotationsCount: number;
  originalName: string;
  format: DocumentFormat;
  size: number;
  cipherSize: number;
  ivHex: string;
  addedAt: number;
  lastOpenedAt: number | null;
  progress: ReadingProgress;
  driveFileId?: string;
  coverDataUrl?: string;
}

export interface VaultDocumentRecord extends VaultDocumentMeta {
  iv: Uint8Array;
  encryptedData: ArrayBuffer;
  annotationsIv?: Uint8Array;
  encryptedAnnotations?: ArrayBuffer;
}

export interface VaultAuthConfig {
  id: 'master_config';
  username: string;
  salt: Uint8Array;
  verifierSalt: Uint8Array;
  verifierHash: string;
  canaryIv: Uint8Array;
  canaryCipher: ArrayBuffer;
  iterations: number;
  createdAt: number;
  customCategories?: string[];
}

export type ReaderTheme = 'dark' | 'light' | 'sepia';

// Déclarations globales pour les bibliothèques chargées via CDN
declare global {
  interface Window {
    marked?: {
      parse: (markdown: string, options?: { async?: boolean; breaks?: boolean; gfm?: boolean }) => string;
    };
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      getDocument: (src: { data: Uint8Array | ArrayBuffer }) => {
        promise: Promise<PDFDocumentProxy>;
      };
      renderTextLayer?: (params: Record<string, unknown>) => {
        promise: Promise<void>;
        cancel: () => void;
      };
    };
    JSZip?: new () => JSZipInstance;
    ePub?: (data: ArrayBuffer, options?: Record<string, unknown>) => EpubBookInstance;
  }
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  destroy: () => Promise<void>;
}

export interface PDFPageProxy {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
}

export interface JSZipFileObj {
  name: string;
  dir: boolean;
  async: (type: 'string' | 'uint8array' | 'arraybuffer' | 'base64') => Promise<any>;
}

export interface JSZipInstance {
  file: {
    (name: string): JSZipFileObj | null;
    (name: string, data: string | Uint8Array | ArrayBuffer): JSZipInstance;
  };
  files: Record<string, JSZipFileObj>;
  loadAsync: (data: ArrayBuffer | Uint8Array) => Promise<JSZipInstance>;
  generateAsync: (options: { type: 'arraybuffer' | 'uint8array' | 'blob'; mimeType?: string }) => Promise<any>;
}

export interface EpubNavigationItem {
  id: string;
  href: string;
  label: string;
  subitems?: EpubNavigationItem[];
}

export interface EpubRendition {
  display: (target?: string | number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  themes: {
    fontSize: (size: string) => void;
    register: (name: string, styles: Record<string, unknown>) => void;
    select: (name: string) => void;
    override: (name: string, value: string, priority?: boolean) => void;
  };
  on: (event: string, callback: (...args: any[]) => void) => void;
  currentLocation: () => any;
  destroy: () => void;
}

export interface EpubBookInstance {
  ready: Promise<any>;
  loaded: {
    navigation: Promise<{ toc: EpubNavigationItem[] }>;
    metadata: Promise<{ title?: string; creator?: string; description?: string }>;
  };
  renderTo: (element: HTMLElement, options: {
    width?: string | number;
    height?: string | number;
    spread?: string;
    flow?: string;
    manager?: string;
    allowScriptedContent?: boolean;
  }) => EpubRendition;
  locations: {
    generate: (chars?: number) => Promise<string[]>;
    percentageFromCfi: (cfi: string) => number;
  };
  destroy: () => void;
}
