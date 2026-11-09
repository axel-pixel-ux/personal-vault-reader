import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ShaderFill } from './lib/custom-effect-runtime/index';
import {
  setup as setupLiquidMetal,
  render as renderLiquidMetal,
  manifest as manifestLiquidMetal,
} from './lib/custom-effects/CodeComponentId_c421a4d62d3ef0ba266d0523fef883b785f6ebbc_6310';
import { HUB_APPS, HubAppItem } from './appsCatalog';
import searchIconUrl from './assets/search.svg';
import bookOpenIconUrl from './assets/book-open.svg';
import arrowRightIconUrl from './assets/arrow-right.svg';
import cloudIconUrl from './assets/cloud.svg';
import clockIconUrl from './assets/clock.svg';
import etudesIconUrl from '../etudes/assets/svg-6.svg';

interface HomeHubProps {
  onOpenApp: (href: string) => void;
}

class ShaderErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Shader background fallback activated:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const LIQUID_METAL_SHADER = {
  setup: setupLiquidMetal,
  render: renderLiquidMetal,
  params: {
    bands: 1.7000000476837158,
    definition: 6,
    color2: { r: 0.8705882430076599, g: 0.8705882430076599, b: 0.8705882430076599, a: 1 },
    frequency: 0.9200000166893005,
    speed: 1.600000023841858,
    exposure: 1,
    saturation: 1,
    contrastAmt: 1.2000000476837158,
    amplitude: 0,
    color1: { r: 0.125490203499794, g: 0.125490203499794, b: 0.125490203499794, a: 1 },
    color3: { r: 0.3921568691730499, g: 0.3921568691730499, b: 0.3921568691730499, a: 1 },
    grain: 0.03999999910593033,
    color4: { r: 0.8078431487083435, g: 0.8078431487083435, b: 0.8078431487083435, a: 1 },
    featureScale: 0.5299999713897705,
    seed: 348,
  },
  manifest: manifestLiquidMetal,
};

const ICON_MAP: Record<HubAppItem['icon'], string> = {
  'book-open': bookOpenIconUrl,
  etudes: etudesIconUrl,
  cloud: cloudIconUrl,
  clock: clockIconUrl,
};

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const HomeHub: React.FC<HomeHubProps> = ({ onOpenApp }) => {
  const [query, setQuery] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Jour et mois en français avec fallback garanti sur tous les navigateurs mobiles
  const dateInfo = useMemo(() => {
    const now = new Date();
    const d = now.getDate();
    const dayNumber = d < 10 ? `0${d}` : `${d}`;
    const weekday = DAYS_FR[now.getDay()] || '';
    const monthName = MONTHS_FR[now.getMonth()] || '';
    return {
      weekday,
      dayNumber,
      monthName,
      fullLabel: `${weekday} ${d} ${monthName.toLowerCase()}`,
    };
  }, []);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HUB_APPS;
    return HUB_APPS.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.subtitle.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.details.toLowerCase().includes(q) ||
        app.badge.toLowerCase().includes(q) ||
        app.features.some((f) => f.toLowerCase().includes(q))
    );
  }, [query]);

  const handleCardAction = (app: HubAppItem) => {
    if (app.status === 'online') {
      onOpenApp(app.href);
    } else if (app.status === 'cloud') {
      setNotice('Le module Stockage cloud sera bientôt connecté à votre espace.');
    }
  };

  return (
    <div className="launchpad-root" data-node-id="1:81" data-name="Accueil">
      {/* Fond animé Liquid Metal du design Figma (avec protection ErrorBoundary + fallback CSS) */}
      <div className="launchpad-shader-bg" aria-hidden="true">
        <ShaderErrorBoundary>
          <ShaderFill className="launchpad-shader-canvas" shader={LIQUID_METAL_SHADER} />
        </ShaderErrorBoundary>
      </div>

      <main className="launchpad-content" data-node-id="5:96">
        {/* Barre de recherche tout en haut (Desktop & Téléphone) */}
        <div className="launchpad-search-wrap">
          <div
            className="launchpad-search"
            data-node-id="5:102"
            onClick={() => searchRef.current?.focus()}
          >
            <img
              src={searchIconUrl}
              alt=""
              className="launchpad-search-icon"
              data-node-id="5:192"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher une application"
              className="launchpad-search-input"
              data-node-id="5:104"
            />
            {query && (
              <button
                type="button"
                className="launchpad-search-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery('');
                }}
                aria-label="Effacer la recherche"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* En-tête : Titre "Accueil", sous-titre et affichage du jour et du mois */}
        <header className="launchpad-header" data-node-id="5:97">
          <div className="launchpad-title-block" data-node-id="5:98">
            <h1 className="launchpad-title" data-node-id="5:99">
              Accueil
            </h1>
            <p className="launchpad-subtitle" data-node-id="5:100">
              Lancez vos applications et accédez à vos services.
            </p>
          </div>

          <div
            className="launchpad-date-pill"
            data-node-id="5:101"
            aria-label={`Date du jour : ${dateInfo.fullLabel}`}
          >
            <span className="launchpad-date-daynum">{dateInfo.dayNumber}</span>
            <div className="launchpad-date-text">
              <span className="launchpad-date-weekday">{dateInfo.weekday}</span>
              <span className="launchpad-date-month">{dateInfo.monthName}</span>
            </div>
          </div>
        </header>

        {/* Grille (Desktop) / Pile verticale (Téléphone) des applications */}
        <section className="launchpad-grid" data-node-id="5:108" aria-label="Applications">
          {filteredApps.map((app) => {
            const isComingSoon = app.status === 'coming_soon';
            const isClickable = app.status === 'online' || app.status === 'cloud';

            return (
              <article
                key={app.id}
                className={`launchpad-card ${isComingSoon ? 'is-coming' : 'is-interactive'}`}
                data-node-id={
                  app.id === 'app-reader'
                    ? '5:110'
                    : app.id === 'app-cloud'
                    ? '5:124'
                    : '5:138'
                }
                onClick={() => isClickable && handleCardAction(app)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleCardAction(app);
                  }
                }}
              >
                <div className="launchpad-card-main">
                  {/* Ligne supérieure : icône & badge */}
                  <div className="launchpad-card-top">
                    <div className="launchpad-card-icon">
                      <img src={ICON_MAP[app.icon]} alt="" width={22} height={22} />
                    </div>
                    <div className="launchpad-card-badge">
                      <span>{app.badge}</span>
                    </div>
                  </div>

                  {/* Contenu : nom de l'appli, sous-titre et descriptions */}
                  <div className="launchpad-card-body">
                    <div className="launchpad-card-heading">
                      <h2 className="launchpad-card-title">{app.name}</h2>
                      <p className="launchpad-card-subtitle">{app.subtitle}</p>
                    </div>

                    <p className="launchpad-card-desc">{app.description}</p>
                    <p className="launchpad-card-details">{app.details}</p>

                    <div className="launchpad-card-tags">
                      {app.features.map((feat) => (
                        <span key={feat} className="launchpad-card-tag">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pied de carte : bouton d'action */}
                <div className="launchpad-card-footer">
                  {isComingSoon ? (
                    <>
                      <span className="launchpad-card-note">{app.footerNote}</span>
                      <span className="launchpad-btn-soon">{app.ctaLabel}</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="launchpad-btn-launch"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardAction(app);
                      }}
                    >
                      <span>{app.ctaLabel}</span>
                      <img src={arrowRightIconUrl} alt="" width={16} height={16} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {filteredApps.length === 0 && (
          <div className="launchpad-empty">
            <p>Aucune application ne correspond à « {query} ».</p>
            <button type="button" onClick={() => setQuery('')}>
              Réinitialiser la recherche
            </button>
          </div>
        )}
      </main>

      {notice && (
        <div className="launchpad-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
};
