/**
 * Service cryptographique reposant sur Web Crypto API (window.crypto.subtle).
 * - Dérivation de clé : PBKDF2-HMAC-SHA256 (150 000 itérations)
 * - Chiffrement : AES-256-GCM avec vecteur d'initialisation (IV) de 96 bits (12 octets) unique
 */

import { DocumentStudyData } from '../types/vault';

export const PBKDF2_ITERATIONS = 150_000;
const CANARY_PLAINTEXT = 'PERSONAL_VAULT_READER_ZERO_KNOWLEDGE_VERIFIED_V1';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function generateRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return array;
}

async function importPassphraseKeyMaterial(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(passphrase);
  return window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
}

export async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const keyMaterial = await importPassphraseKeyMaterial(passphrase);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveVerifierHash(
  passphrase: string,
  verifierSalt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const keyMaterial = await importPassphraseKeyMaterial(passphrase);
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: verifierSalt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const sha256Digest = await window.crypto.subtle.digest('SHA-256', derivedBits);
  return bytesToHex(new Uint8Array(sha256Digest));
}

export async function encryptBuffer(
  plainBuffer: ArrayBuffer,
  aesKey: CryptoKey
): Promise<{ iv: Uint8Array; encryptedData: ArrayBuffer; ivHex: string }> {
  const iv = generateRandomBytes(12);
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    aesKey,
    plainBuffer
  );
  return {
    iv,
    encryptedData,
    ivHex: bytesToHex(iv),
  };
}

export async function decryptBuffer(
  encryptedData: ArrayBuffer,
  iv: Uint8Array,
  aesKey: CryptoKey
): Promise<ArrayBuffer> {
  return window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    aesKey,
    encryptedData
  );
}

/**
 * Chiffre les signets et annotations (DocumentStudyData) en AES-256-GCM.
 */
export async function encryptStudyData(
  studyData: DocumentStudyData,
  aesKey: CryptoKey
): Promise<{ annotationsIv: Uint8Array; encryptedAnnotations: ArrayBuffer }> {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(studyData));
  const { iv, encryptedData } = await encryptBuffer(
    jsonBytes.buffer as ArrayBuffer,
    aesKey
  );
  return {
    annotationsIv: iv,
    encryptedAnnotations: encryptedData,
  };
}

/**
 * Déchiffre les signets et annotations associés à un document.
 */
export async function decryptStudyData(
  encryptedAnnotations?: ArrayBuffer,
  annotationsIv?: Uint8Array,
  aesKey?: CryptoKey
): Promise<DocumentStudyData> {
  if (!encryptedAnnotations || !annotationsIv || !aesKey) {
    return { bookmarks: [], annotations: [] };
  }
  try {
    const plainBuffer = await decryptBuffer(encryptedAnnotations, annotationsIv, aesKey);
    const jsonText = new TextDecoder('utf-8').decode(plainBuffer);
    const parsed = JSON.parse(jsonText);
    return {
      bookmarks: Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [],
      annotations: Array.isArray(parsed?.annotations) ? parsed.annotations : [],
    };
  } catch {
    return { bookmarks: [], annotations: [] };
  }
}

export async function createInitialAuthMaterial(passphrase: string): Promise<{
  aesKey: CryptoKey;
  salt: Uint8Array;
  verifierSalt: Uint8Array;
  verifierHash: string;
  canaryIv: Uint8Array;
  canaryCipher: ArrayBuffer;
  iterations: number;
}> {
  const salt = generateRandomBytes(16);
  const verifierSalt = generateRandomBytes(16);
  const iterations = PBKDF2_ITERATIONS;

  const aesKey = await deriveAesGcmKey(passphrase, salt, iterations);
  const verifierHash = await deriveVerifierHash(passphrase, verifierSalt, iterations);

  const encoder = new TextEncoder();
  const canaryBytes = encoder.encode(CANARY_PLAINTEXT);
  const { iv: canaryIv, encryptedData: canaryCipher } = await encryptBuffer(
    canaryBytes.buffer as ArrayBuffer,
    aesKey
  );

  return {
    aesKey,
    salt,
    verifierSalt,
    verifierHash,
    canaryIv,
    canaryCipher,
    iterations,
  };
}

export async function verifyAndUnlockVault(
  passphrase: string,
  config: {
    salt: Uint8Array;
    verifierSalt: Uint8Array;
    verifierHash: string;
    canaryIv: Uint8Array;
    canaryCipher: ArrayBuffer;
    iterations: number;
  }
): Promise<CryptoKey | null> {
  try {
    const candidateHash = await deriveVerifierHash(
      passphrase,
      config.verifierSalt,
      config.iterations
    );

    if (candidateHash !== config.verifierHash) {
      return null;
    }

    const aesKey = await deriveAesGcmKey(passphrase, config.salt, config.iterations);
    const decryptedCanaryBuffer = await decryptBuffer(
      config.canaryCipher,
      config.canaryIv,
      aesKey
    );
    const decoder = new TextDecoder();
    const canaryText = decoder.decode(decryptedCanaryBuffer);

    if (canaryText !== CANARY_PLAINTEXT) {
      return null;
    }

    return aesKey;
  } catch {
    return null;
  }
}

/**
 * Octets bruts de la clé AES dérivée de la clé d'accès (mêmes paramètres PBKDF2 que
 * deriveAesGcmKey). Sert à transmettre la clé aux autres appareils du même compte.
 */
export async function deriveRawKeyBytes(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  const keyMaterial = await importPassphraseKeyMaterial(passphrase);
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function importAesKeyFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'raw',
    raw as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}
