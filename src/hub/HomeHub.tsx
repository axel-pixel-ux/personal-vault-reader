import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolioIcon } from '../components/FolioIcon';
import { HUB_APPS, HubAppItem } from './appsCatalog';

interface HomeHubProps {
  onOpenApp: (href: string) => void;
}

export const HomeHub: React.FC<HomeHubProps> = ({ onOpenApp }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('folio_hub_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [query, setQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'coming_soon'>('all');
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('folio_hub_theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignorer
    }
  }, [isDark]);

  useEffect(() => {
    let cancelled = false;
    fetch('/healthz')
      .then((r) => {
        if (!cancelled) setServerHealthy(r.ok);
      })
      .catch(() => {
        if (!cancelled) setServerHealthy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HUB_APPS.filter((app) => {
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.subtitle.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, statusFilter]);

  const onlineCount = useMemo(
    () => HUB_APPS.filter((a) => a.status === 'online').length,
    []
  );

  const handleCardAction = (app: HubAppItem) => {
    if (app.status !== 'online') return;
    onOpenApp(app.href);
  };

  return (
    <div className={`app-shell hub-shell ${isDark ? 'dark' : ''}`}>
      {/* Barre supérieure du Hub */}
      <header className="topbar hub-topbar">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            onOpenApp('/');
          }}
        >
          <span className="brand-mark">
            <FolioIcon name="sparkle" size={19} />
          </span>
          <span>
            Atelier <em style={{ fontWeight: 400, opacity: 0.75 }}>Hub</em>
          </span>
        </a>

        <div className="hub-status-pill" title="État du serveur Freebox Delta">
          <span
            className="hub-status-dot"
            style={{
              background:
                serverHealthy === null
                  ? '#a8a29e'
                  : serverHealthy
                  ? '#2e7d5b'
                  : '#c2410c',
            }}
          />
          <span>
            {serverHealthy === null
              ? 'Vérification du serveur…'
              : serverHealthy
              ? 'Freebox Delta • En ligne'
              : 'Serveur hors-ligne'}
          </span>
        </div>

        <div className="top-actions" style={{ justifySelf: 'end' }}>
          <button
            type="button"
            className="icon-button"
            onClick={() => setIsDark((d) => !d)}
            aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
          >
            <FolioIcon name={isDark ? 'sun' : 'moon'} size={17} />
          </button>
          <button
            type="button"
            className="upload-button"
            onClick={() => onOpenApp('/reader')}
          >
            <FolioIcon name="book" size={15} />
            <span>Ouvrir Folio</span>
          </button>
        </div>
      </header>

      {/* En-tête éditorial */}
      <main className="hub-main">
        <section className="hub-hero">
          <div className="hub-hero-meta">
            <span className="hub-date-badge">{formattedDate}</span>
            <span className="hub-Meta-sep">•</span>
            <span>
              {onlineCount} {onlineCount > 1 ? 'applications actives' : 'application active'} sur{' '}
              {HUB_APPS.length}
            </span>
          </div>

          <h1 className="hub-title">
            {greeting}. Choisissez votre <em>espace de travail.</em>
          </h1>
          <p className="hub-subtitle">
            Portail central de vos applications auto-hébergées sur votre Freebox Delta, accessibles
            en privé et chiffrées de bout en bout.
          </p>

          {/* Barre de recherche & filtres */}
          <div className="hub-controls">
            <div className="hub-search">
              <FolioIcon name="search" size={16} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une application ou un outil… (Touche /)"
                aria-label="Rechercher une application"
              />
              {query && (
                <button
                  type="button"
                  className="hub-search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Effacer la recherche"
                >
                  <FolioIcon name="close" size={14} />
                </button>
              )}
            </div>

            <div className="hub-filter-pills" role="tablist" aria-label="Filtrer les applications">
              <button
                type="button"
                className={statusFilter === 'all' ? 'active' : ''}
                onClick={() => setStatusFilter('all')}
              >
                Toutes ({HUB_APPS.length})
              </button>
              <button
                type="button"
                className={statusFilter === 'online' ? 'active' : ''}
                onClick={() => setStatusFilter('online')}
              >
                Actives ({onlineCount})
              </button>
              <button
                type="button"
                className={statusFilter === 'coming_soon' ? 'active' : ''}
                onClick={() => setStatusFilter('coming_soon')}
              >
                En préparation ({HUB_APPS.length - onlineCount})
              </button>
            </div>
          </div>
        </section>

        {/* Grille des applications */}
        <section className="hub-grid" aria-label="Applications disponibles">
          {filteredApps.map((app) => {
            const isOnline = app.status === 'online';
            return (
              <article
                key={app.id}
                className={`hub-card ${app.featured ? 'featured' : ''} ${
                  !isOnline ? 'disabled' : ''
                }`}
                onClick={() => handleCardAction(app)}
                role={isOnline ? 'button' : undefined}
                tabIndex={isOnline ? 0 : undefined}
                onKeyDown={(e) => {
                  if (isOnline && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleCardAction(app);
                  }
                }}
              >
                <div className="hub-card-top">
                  <div className="hub-card-icon-wrap">
                    <span className="hub-card-icon">
                      <FolioIcon name={app.icon} size={22} />
                    </span>
                    <span className="hub-card-number">{app.number}</span>
                  </div>

                  <span className={`hub-badge ${isOnline ? 'online' : 'soon'}`}>
                    <span className="hub-badge-dot" />
                    {app.badge}
                  </span>
                </div>

                <div className="hub-card-body">
                  <p className="hub-card-category">{app.category}</p>
                  <h2 className="hub-card-title">{app.name}</h2>
                  <p className="hub-card-subtitle">{app.subtitle}</p>
                  <p className="hub-card-desc">{app.description}</p>
                </div>

                <div className="hub-card-footer">
                  <div className="hub-tags">
                    {app.tags.map((tag) => (
                      <span key={tag} className="hub-tag">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {isOnline ? (
                    <a
                      href={app.href}
                      className="hub-card-cta"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenApp(app.href);
                      }}
                    >
                      <span>Accéder à {app.name}</span>
                      <FolioIcon name="chevron" size={15} />
                    </a>
                  ) : (
                    <span className="hub-card-cta muted">Bientôt disponible</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {filteredApps.length === 0 && (
          <div className="hub-empty">
            <p>Aucune application ne correspond à « {query} ».</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </main>

      <footer className="hub-footer">
        <div>
          <strong>Atelier Hub</strong> — Auto-hébergé sur Freebox Delta (ARM64) • Accès privé
          Tailscale &amp; HTTPS
        </div>
        <div>
          Pour ajouter une application : éditez{' '}
          <code>src/hub/appsCatalog.ts</code>
        </div>
      </footer>
    </div>
  );
};
