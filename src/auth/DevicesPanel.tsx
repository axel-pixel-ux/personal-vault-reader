import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut } from 'lucide-react';
import { FolioIcon } from '../components/FolioIcon';
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Appareils connectés" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-kicker">Compte & Sécurité</p>
            <h3>Appareils connectés</h3>
          </div>
          <button
            type="button"
            className="icon-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <FolioIcon name="close" size={18} />
          </button>
        </div>

        <p className="modal-copy">
          Gérez les sessions actives associées à votre compte Folio.
        </p>

        {error && <div className="auth-error-banner" style={{ marginBottom: '12px' }}>{error}</div>}

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'grid', gap: '10px' }}>
          {sessions.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--cream)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                <Laptop className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }} className="truncate">
                    {s.device_name}
                    {s.current && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          padding: '2px 7px',
                          borderRadius: '999px',
                          background: 'rgba(33, 75, 59, 0.14)',
                          color: 'var(--forest)',
                        }}
                      >
                        cet appareil
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: '2px' }}>
                    {s.ip ?? 'IP inconnue'} · actif {new Date(s.last_used_at).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => revoke(s)}
                className="secondary-button"
                style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem', flexShrink: 0 }}
              >
                {s.current ? 'Se déconnecter' : "Révoquer l'accès"}
              </button>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Fermer
          </button>
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={revokeOthers}
              className="primary-button"
              style={{ background: '#a94444' }}
            >
              Déconnecter les autres appareils
            </button>
          )}
        </div>
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '34px',
            padding: '0 12px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: '0.78rem',
            fontWeight: 500,
            boxShadow: '0 8px 20px rgba(21, 40, 32, 0.08)',
          }}
        >
          <Laptop className="w-3.5 h-3.5" /> Appareils
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          title="Se déconnecter du compte"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            boxShadow: '0 8px 20px rgba(21, 40, 32, 0.08)',
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && <DevicesPanel onClose={() => setOpen(false)} />}
    </>
  );
};
