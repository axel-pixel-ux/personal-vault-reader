import React, { useEffect } from 'react';
import svg10Url from './assets/svg-10.svg';

export interface EtudesSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Thème
  isDark: boolean;
  onToggleTheme: () => void;
  // Affichage des thèmes
  themesViewMode: 'grands-themes' | 'tags';
  onSetThemesViewMode: (mode: 'grands-themes' | 'tags') => void;
  // Tri des articles
  sortBy: 'recent' | 'title' | 'author';
  onSetSortBy: (sort: 'recent' | 'title' | 'author') => void;
  // Filtre par genre
  selectedGenreFilter: string | null;
  onSetGenreFilter: (genre: string | null) => void;
  availableGenres: string[];
  // Filtre par auteur
  selectedAuthorFilter: string | null;
  onSetAuthorFilter: (author: string | null) => void;
  availableAuthors: string[];
  // Réinitialisation des filtres
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  // IA Gemini
  hasGeminiKey: boolean;
  canManageDocuments: boolean;
  onOpenGeminiKeyModal: () => void;
  onClassifyAllThemes?: () => void;
  isClassifyingThemes?: boolean;
  // Compte & Appareils
  accountLabel: string;
  accountEmail: string | null;
  isLockedOrNoSession: boolean;
  onOpenDevicesModal: () => void;
  onLockSession?: () => void;
  // Mentions Légales & CGU
  onOpenLegalModal: (tab: 'mentions' | 'cgu') => void;
  // Statistiques
  totalArticlesCount: number;
  totalListsCount: number;
}

export const EtudesSettingsModal: React.FC<EtudesSettingsModalProps> = ({
  isOpen,
  onClose,
  isDark,
  onToggleTheme,
  themesViewMode,
  onSetThemesViewMode,
  sortBy,
  onSetSortBy,
  selectedGenreFilter,
  onSetGenreFilter,
  availableGenres,
  selectedAuthorFilter,
  onSetAuthorFilter,
  availableAuthors,
  hasActiveFilters,
  onResetFilters,
  hasGeminiKey,
  canManageDocuments,
  onOpenGeminiKeyModal,
  onClassifyAllThemes,
  isClassifyingThemes,
  accountLabel,
  accountEmail,
  isLockedOrNoSession,
  onOpenDevicesModal,
  onLockSession,
  onOpenLegalModal,
  totalArticlesCount,
  totalListsCount,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="etudes-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Paramètres de l'application Études"
      onClick={onClose}
    >
      <div
        className="etudes-modal-card etudes-settings-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Entête */}
        <div className="etudes-settings-header">
          <div>
            <p className="etudes-settings-kicker">PRÉFÉRENCES</p>
            <h3 className="etudes-settings-title">
              <img
                src={svg10Url}
                alt=""
                width={22}
                height={22}
                className="etudes-icon-invert"
                style={{ verticalAlign: 'middle', marginRight: 8 }}
              />
              Paramètres
            </h3>
          </div>
          <button
            type="button"
            className="etudes-icon-btn"
            aria-label="Fermer les paramètres"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* ================= SECTION 1 : THÈME & AFFICHAGE ================= */}
        <div className="etudes-settings-section">
          <h4 className="etudes-settings-section-title">
            <span>🎨</span> Thème & Affichage
          </h4>

          {/* Thème clair / sombre */}
          <div className="etudes-settings-row">
            <div>
              <div className="etudes-settings-label">Thème visuel</div>
              <div className="etudes-settings-sublabel">
                Choisissez entre l’apparence claire ou sombre
              </div>
            </div>
            <div className="etudes-settings-segment">
              <button
                type="button"
                className={!isDark ? 'is-active' : ''}
                onClick={() => {
                  if (isDark) onToggleTheme();
                }}
              >
                ☀️ Clair
              </button>
              <button
                type="button"
                className={isDark ? 'is-active' : ''}
                onClick={() => {
                  if (!isDark) onToggleTheme();
                }}
              >
                🌙 Sombre
              </button>
            </div>
          </div>

          {/* Mode d'organisation des thèmes */}
          <div className="etudes-settings-row">
            <div>
              <div className="etudes-settings-label">Organisation des thèmes</div>
              <div className="etudes-settings-sublabel">
                Structure hiérarchisée par grands thèmes ou liste plate
              </div>
            </div>
            <div className="etudes-settings-segment">
              <button
                type="button"
                className={themesViewMode === 'grands-themes' ? 'is-active' : ''}
                onClick={() => onSetThemesViewMode('grands-themes')}
                title="Classer par grands thèmes éditoriaux (IA)"
              >
                🏛️ Grands thèmes
              </button>
              <button
                type="button"
                className={themesViewMode === 'tags' ? 'is-active' : ''}
                onClick={() => onSetThemesViewMode('tags')}
                title="Afficher tous les tags et mots-clés"
              >
                🏷️ Tous les tags
              </button>
            </div>
          </div>
        </div>

        {/* ================= SECTION 2 : TRI & FILTRES ================= */}
        <div className="etudes-settings-section">
          <h4 className="etudes-settings-section-title">
            <span>🔍</span> Tri & Filtres de recherche
          </h4>

          {/* Tri par défaut */}
          <div className="etudes-settings-row">
            <div>
              <div className="etudes-settings-label">Trier les études par</div>
              <div className="etudes-settings-sublabel">
                Ordre de classement dans les listes et carrousels
              </div>
            </div>
            <select
              className="etudes-settings-select"
              value={sortBy}
              onChange={(e) => onSetSortBy(e.target.value as 'recent' | 'title' | 'author')}
            >
              <option value="recent">Récemment ajoutées</option>
              <option value="title">Titre (A à Z)</option>
              <option value="author">Auteur (A à Z)</option>
            </select>
          </div>

          {/* Filtre par genre */}
          {availableGenres.length > 0 && (
            <div className="etudes-settings-row">
              <div>
                <div className="etudes-settings-label">Filtrer par genre</div>
                <div className="etudes-settings-sublabel">
                  Afficher uniquement un type d’écrit spécifique
                </div>
              </div>
              <select
                className="etudes-settings-select"
                value={selectedGenreFilter || ''}
                onChange={(e) => onSetGenreFilter(e.target.value || null)}
              >
                <option value="">Tous les genres ({availableGenres.length})</option>
                {availableGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtre par auteur */}
          {availableAuthors.length > 0 && (
            <div className="etudes-settings-row">
              <div>
                <div className="etudes-settings-label">Filtrer par auteur</div>
                <div className="etudes-settings-sublabel">
                  Consulter les écrits d'un contributeur précis
                </div>
              </div>
              <select
                className="etudes-settings-select"
                value={selectedAuthorFilter || ''}
                onChange={(e) => onSetAuthorFilter(e.target.value || null)}
              >
                <option value="">Tous les auteurs ({availableAuthors.length})</option>
                {availableAuthors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Réinitialisation rapide des filtres */}
          {hasActiveFilters && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ fontSize: 13, padding: '6px 12px' }}
                onClick={onResetFilters}
              >
                🔄 Réinitialiser tous les filtres
              </button>
            </div>
          )}
        </div>

        {/* ================= SECTION 3 : INTELLIGENCE ARTIFICIELLE GEMINI ================= */}
        <div className="etudes-settings-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 className="etudes-settings-section-title" style={{ margin: 0 }}>
              <span>✨</span> Intelligence Artificielle (Google Gemini)
            </h4>
            <span
              className={`etudes-settings-status-badge ${hasGeminiKey ? 'is-active' : 'is-inactive'}`}
            >
              {hasGeminiKey ? '● Active' : '○ Non configurée'}
            </span>
          </div>

          <p className="etudes-settings-desc">
            L'IA Gemini analyse automatiquement vos fichiers lors du dépôt (détection du genre et des
            thèmes pertinents) et organise les thématiques de la revue en grands thèmes cohérents.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="etudes-primary-btn"
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => {
                onClose();
                onOpenGeminiKeyModal();
              }}
            >
              ⚙️ {hasGeminiKey ? 'Modifier la clé API Gemini' : 'Configurer la clé API Gemini'}
            </button>

            {canManageDocuments && onClassifyAllThemes && (
              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ fontSize: 13, padding: '7px 14px' }}
                onClick={onClassifyAllThemes}
                disabled={isClassifyingThemes}
                title="Relancer l'organisation thématique globale de toutes les études"
              >
                {isClassifyingThemes ? 'Organisation en cours…' : '✨ Réorganiser les thèmes'}
              </button>
            )}
          </div>
        </div>

        {/* ================= SECTION 4 : COMPTE & SESSIONS ================= */}
        <div className="etudes-settings-section">
          <h4 className="etudes-settings-section-title">
            <span>👤</span> Compte & Appareils
          </h4>

          <div className="etudes-settings-row">
            <div>
              <div className="etudes-settings-label">{accountLabel}</div>
              {accountEmail && (
                <div className="etudes-settings-sublabel">{accountEmail}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="etudes-secondary-btn"
                style={{ fontSize: 13, padding: '6px 12px' }}
                onClick={() => {
                  onClose();
                  onOpenDevicesModal();
                }}
              >
                📱 Appareils connectés
              </button>

              {!isLockedOrNoSession && onLockSession && (
                <button
                  type="button"
                  className="etudes-secondary-btn"
                  style={{ fontSize: 13, padding: '6px 12px' }}
                  onClick={() => {
                    onClose();
                    onLockSession();
                  }}
                  title="Verrouiller la session actuelle"
                >
                  🔒 Déconnexion
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= SECTION 5 : INFORMATIONS LÉGALES & CGU ================= */}
        <div className="etudes-settings-section">
          <h4 className="etudes-settings-section-title">
            <span>⚖️</span> Informations Légales
          </h4>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="etudes-footer-link"
              style={{ fontSize: 14 }}
              onClick={() => {
                onClose();
                onOpenLegalModal('mentions');
              }}
            >
              Mentions Légales
            </button>
            <span style={{ color: 'var(--etudes-border)' }}>•</span>
            <button
              type="button"
              className="etudes-footer-link"
              style={{ fontSize: 14 }}
              onClick={() => {
                onClose();
                onOpenLegalModal('cgu');
              }}
            >
              Conditions Générales d'Utilisation (CGU)
            </button>
          </div>
        </div>

        {/* ================= SECTION 6 : BIBLIOTHÈQUE ================= */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 12,
            borderTop: '1px solid var(--etudes-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12.5,
            color: 'var(--etudes-text-muted)',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            📚 {totalArticlesCount} étude{totalArticlesCount > 1 ? 's' : ''} • {totalListsCount} liste
            {totalListsCount > 1 ? 's' : ''} de lecture
          </div>

          <button
            type="button"
            className="etudes-secondary-btn"
            style={{ fontSize: 13, padding: '6px 16px' }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
