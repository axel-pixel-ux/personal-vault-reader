import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut, X } from 'lucide-react';
import { apiFetch, logout } from './api';

interface DeviceSession {
  id: string;
  device_name: string;
  ip: string | null;
  last_used_at: string;
  current: boolean;
}

export const DevicesPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/auth/sessions');
      if (!r.ok) throw new Error();
      setSessions(await r.json());
      setError(null);
    } catch {
      setError('Impossible de charger les appareils.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (s: DeviceSession) => {
    await apiFetch(`/auth/sessions/${s.id}`, { method: 'DELETE' });
    if (s.current) return logout();
    void load();
  };

  const revokeOthers = async () => {
    await apiFetch('/auth/sessions?others=1', { method: 'DELETE' });
    void load();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Appareils connectés"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Appareils connectés</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-start gap-3 min-w-0">
                <Laptop className="w-4 h-4 mt-0.5 shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.device_name}
                    {s.current && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        cet appareil
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {s.ip ?? 'IP inconnue'} · actif {new Date(s.last_used_at).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
              <button onClick={() => revoke(s)}
                className="shrink-0 text-xs px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {s.current ? 'Se déconnecter' : "Révoquer l'accès"}
              </button>
            </li>
          ))}
        </ul>

        {sessions.length > 1 && (
          <button onClick={revokeOthers}
            className="w-full text-xs py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">
            Déconnecter tous les autres appareils
          </button>
        )}
      </div>
    </div>
  );
};

/** Boutons flottants (appareils + déconnexion) affichés au-dessus de l'application. */
export const AccountBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 text-xs text-zinc-700 dark:text-zinc-300 shadow-sm">
          <Laptop className="w-3.5 h-3.5" /> Appareils
        </button>
        <button onClick={() => void logout()} title="Se déconnecter du compte"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 text-xs text-zinc-700 dark:text-zinc-300 shadow-sm">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && <DevicesPanel onClose={() => setOpen(false)} />}
    </>
  );
};
