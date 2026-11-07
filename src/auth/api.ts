type Listener = (authed: boolean) => void;

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let timer: number | undefined;
const listeners = new Set<Listener>();

export const onAuthChange = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function tokenExpiry(t: string): number {
  return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
}

function setToken(t: string | null) {
  accessToken = t;
  window.clearTimeout(timer);
  if (t) {
    // Silent refresh planifié 1 minute avant l'expiration
    const delay = Math.max(tokenExpiry(t) - Date.now() - 60_000, 5_000);
    timer = window.setTimeout(() => void refresh(), delay);
  }
  listeners.forEach((fn) => fn(!!t));
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

/**
 * Rafraîchit l'access token via le cookie refresh (HttpOnly).
 * - un seul appel simultané par onglet
 * - verrou inter-onglets via Web Locks (évite la course sur la rotation)
 */
export function refresh(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const run = async (): Promise<string | null> => {
        for (let i = 0; i < 3; i++) {
          const r = await post('/auth/refresh');
          if (r.ok) return (await r.json()).accessToken as string;
          if (r.status !== 409) return null; // 409 : un autre onglet vient de faire la rotation
          await new Promise((res) => setTimeout(res, 300));
        }
        return null;
      };
      const t = navigator.locks ? await navigator.locks.request('auth-refresh', run) : await run();
      setToken(t);
      return t;
    } catch {
      return null; // réseau indisponible : on ne déconnecte pas brutalement
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function credentialsCall(url: string, email: string, password: string) {
  const r = await post(url, { email, password });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? 'unknown_error');
  setToken(data.accessToken);
}

export const login = (email: string, password: string) => credentialsCall('/auth/login', email, password);
export const register = (email: string, password: string) => credentialsCall('/auth/register', email, password);

export async function logout() {
  await post('/auth/logout').catch(() => {});
  setToken(null);
}

export async function requestPasswordReset(email: string) {
  const r = await post('/auth/forgot-password', { email });
  if (r.status === 429) throw new Error('too_many_requests');
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error ?? 'unknown_error');
  }
}

export async function resetPassword(token: string, password: string) {
  const r = await post('/auth/reset-password', { token, password });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 429 ? 'too_many_requests' : data.error ?? 'unknown_error');
}

/** fetch authentifié : ajoute le Bearer et rejoue UNE fois après un 401 + refresh. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const go = (t: string | null) =>
    fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: { ...init.headers, ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    });
  let res = await go(accessToken);
  if (res.status === 401) {
    const t = await refresh();
    if (!t) throw new Error('session_expired');
    res = await go(t);
  }
  return res;
}

/** Au démarrage (nouvel onglet, navigateur rouvert) : restaure la session via le cookie. */
export const bootstrap = () => refresh();

// Retour sur l'onglet (sortie de veille, etc.) : rafraîchit si le token est (presque) expiré
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && accessToken && tokenExpiry(accessToken) - Date.now() < 60_000) {
    void refresh();
  }
});
