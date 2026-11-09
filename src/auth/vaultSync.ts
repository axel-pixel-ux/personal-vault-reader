import { VaultAuthConfig } from '../types/vault';
import { deriveRawKeyBytes } from '../services/cryptoService';
import { apiFetch } from './api';

const toB64 = (u: Uint8Array | ArrayBuffer) => {
  const bytes = u instanceof Uint8Array ? u : new Uint8Array(u);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface RemoteVaultProfile {
  username: string;
  key: string;
  config: {
    username: string;
    salt: string;
    verifierSalt: string;
    verifierHash: string;
    canaryIv: string;
    canaryCipher: string;
    iterations: number;
    createdAt: number;
    customCategories?: string[];
  };
}

export function configFromRemote(p: RemoteVaultProfile): VaultAuthConfig {
  const c = p.config;
  return {
    id: 'master_config',
    username: c.username,
    salt: fromB64(c.salt),
    verifierSalt: fromB64(c.verifierSalt),
    verifierHash: c.verifierHash,
    canaryIv: fromB64(c.canaryIv),
    canaryCipher: fromB64(c.canaryCipher).buffer as ArrayBuffer,
    iterations: c.iterations,
    createdAt: c.createdAt,
    customCategories: c.customCategories,
  };
}

export async function fetchVaultProfile(): Promise<{
  userId: string;
  email?: string | null;
  profile: RemoteVaultProfile | null;
}> {
  const r = await apiFetch('/auth/vault');
  if (!r.ok) throw new Error('vault_fetch_failed');
  return r.json();
}

/** Enregistre le coffre sur le compte. Renvoie false si le compte en a déjà un. */
export async function pushVaultProfile(config: VaultAuthConfig, passphrase: string): Promise<boolean> {
  const raw = await deriveRawKeyBytes(passphrase, config.salt, config.iterations);
  const body: RemoteVaultProfile = {
    username: config.username,
    key: toB64(raw),
    config: {
      username: config.username,
      salt: toB64(config.salt),
      verifierSalt: toB64(config.verifierSalt),
      verifierHash: config.verifierHash,
      canaryIv: toB64(config.canaryIv),
      canaryCipher: toB64(config.canaryCipher),
      iterations: config.iterations,
      createdAt: config.createdAt,
      customCategories: config.customCategories,
    },
  };
  const r = await apiFetch('/auth/vault', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error('vault_push_failed');
  return true;
}

export async function deleteVaultProfile(): Promise<void> {
  await apiFetch('/auth/vault', { method: 'DELETE' });
}

export async function syncVaultCategories(
  customCategories: string[],
  deletedCategory?: string,
  fallbackCategory?: string
): Promise<void> {
  await apiFetch('/auth/vault/categories', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customCategories,
      deletedCategory,
      fallbackCategory,
    }),
  }).catch(() => {});
}
