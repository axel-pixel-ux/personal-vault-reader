import React, { useState } from 'react';
import { VaultAuthConfig } from '../types/vault';
import { FolioIcon } from './FolioIcon';
import { LegalModal } from './TermsModal';

interface VaultAuthScreenProps {
  authConfig: VaultAuthConfig | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onInitializeVault: (
    username: string,
    passphrase: string,
    seedSamples: boolean
  ) => Promise<void>;
  onUnlockVault: (passphrase: string) => Promise<boolean>;
  onResetVault: () => Promise<void>;
}

export const VaultAuthScreen: React.FC<VaultAuthScreenProps> = ({
  authConfig,
  onInitializeVault,
  onUnlockVault,
  onResetVault,
}) => {
  const [username, setUsername] = useState<string>(() => {
    try {
      return localStorage.getItem('folio_pending_username') || '';
    } catch {
      return '';
    }
  });
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [seedSamples, setSeedSamples] = useState<boolean>(true);
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resetConfirmationText, setResetConfirmationText] = useState<string>('');
  const [legalModalState, setLegalModalState] = useState<{ open: boolean; tab: 'mentions' | 'cgu' }>({
    open: false,
    tab: 'mentions',
  });

  const handleInitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
      setErrorMessage('Veuillez indiquer un nom (minimum 2 caractères).');
      return;
    }

    if (passphrase.length < 8) {
      setErrorMessage('La clé d’accès doit comporter au moins 8 caractères.');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setErrorMessage('Les deux clés saisies ne correspondent pas.');
      return;
    }

    try {
      setIsProcessing(true);
      try {
        localStorage.removeItem('folio_pending_username');
      } catch {
        // Ignorer
      }
      await onInitializeVault(cleanUsername, passphrase, seedSamples);
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Impossible de créer la bibliothèque.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!passphrase) {
      setErrorMessage('Veuillez saisir votre clé d’accès.');
      return;
    }

    try {
      setIsProcessing(true);
      const success = await onUnlockVault(passphrase);
      if (!success) {
        setErrorMessage('Clé d’accès incorrecte.');
      } else {
        setPassphrase('');
      }
    } catch {
      setErrorMessage('Impossible de déverrouiller la bibliothèque.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetConfirmationText.trim().toUpperCase() !== 'EFFACER') return;
    setIsProcessing(true);
    try {
      await onResetVault();
      setShowResetConfirm(false);
      setResetConfirmationText('');
      setPassphrase('');
      setErrorMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-intro">
        <div className="auth-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <a className="auth-brand" href="#sign-in" aria-label="Folio">
          <span className="brand-mark">
            <FolioIcon name="book" size={22} />
          </span>
          Folio
        </a>
        <div className="auth-story">
          <p className="auth-eyebrow">
            <FolioIcon name="sparkle" size={14} />
            A library made for you
          </p>
          <h1>
            Every great story
            <br />
            deserves a <em>quiet place.</em>
          </h1>
          <p className="auth-lead">
            Bring your books, essays and ideas together. Read slowly, remember more, and return to
            every page that matters.
          </p>
          <div className="auth-features">
            <article>
              <span>01</span>
              <div>
                <strong>Read without distraction</strong>
                <p>A calm reader shaped around your focus.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <strong>Your collection, beautifully organized</strong>
                <p>Books, notes and highlights in one place.</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <strong>Continue exactly where you left off</strong>
                <p>Your reading journey, always within reach.</p>
              </div>
            </article>
          </div>
        </div>
        <p className="auth-quote">“A reader lives a thousand lives before he dies.”</p>
      </section>

      <section className="auth-form-side" id="sign-in">
        <div className="auth-form-wrap">
          {!authConfig ? (
            <>
              <p className="auth-form-kicker">Begin your collection</p>
              <h2>Create your reading space.</h2>
              <p className="auth-form-copy">
                Définissez votre nom et un mot de passe pour accéder à vos livres et vos notes.
              </p>

              {errorMessage && <div className="auth-error-banner">{errorMessage}</div>}

              <form className="auth-form" onSubmit={handleInitSubmit}>
                <label htmlFor="vault-init-username">
                  Votre nom
                  <div className="auth-input">
                    <FolioIcon name="file" size={17} />
                    <input
                      id="vault-init-username"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="Ex. Camille"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </label>

                <label htmlFor="vault-init-passphrase">
                  Mot de passe (8 caractères min.)
                  <div className="auth-input">
                    <FolioIcon name="lock" size={17} />
                    <input
                      id="vault-init-passphrase"
                      type={showPassphrase ? 'text' : 'password'}
                      required
                      placeholder="8 caractères minimum"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase((v) => !v)}
                      aria-label={showPassphrase ? 'Masquer' : 'Afficher'}
                    >
                      {showPassphrase ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label htmlFor="vault-init-confirm">
                  Confirmer le mot de passe
                  <div className="auth-input">
                    <FolioIcon name="lock" size={17} />
                    <input
                      id="vault-init-confirm"
                      type={showPassphrase ? 'text' : 'password'}
                      required
                      placeholder="Répétez le mot de passe"
                      value={confirmPassphrase}
                      onChange={(e) => setConfirmPassphrase(e.target.value)}
                    />
                  </div>
                </label>

                <div className="auth-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={seedSamples}
                      onChange={(e) => setSeedSamples(e.target.checked)}
                    />{' '}
                    Inclure quatre ouvrages d’exemple (.epub, .pdf, .md, .txt)
                  </label>
                </div>

                <button className="auth-submit" type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Préparation...' : 'Create my library'}
                  <FolioIcon name="chevron" size={16} />
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="auth-form-kicker">Welcome back, {authConfig.username}</p>
              <h2>Return to your library.</h2>
              <p className="auth-form-copy">
                Saisissez votre mot de passe pour accéder à vos lectures.
              </p>

              {errorMessage && <div className="auth-error-banner">{errorMessage}</div>}

              <form className="auth-form" onSubmit={handleUnlockSubmit}>
                <label htmlFor="vault-unlock-passphrase">
                  Mot de passe
                  <div className="auth-input">
                    <FolioIcon name="lock" size={17} />
                    <input
                      id="vault-unlock-passphrase"
                      type={showPassphrase ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Saisissez votre mot de passe..."
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase((v) => !v)}
                      aria-label={showPassphrase ? 'Masquer' : 'Afficher'}
                    >
                      {showPassphrase ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <button className="auth-submit" type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Ouverture...' : 'Enter my library'}
                  <FolioIcon name="chevron" size={16} />
                </button>
              </form>

              <div className="auth-divider">
                <span>or</span>
              </div>

              {!showResetConfirm ? (
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => setShowResetConfirm(true)}
                >
                  Réinitialiser la bibliothèque locale
                </button>
              ) : (
                <form className="auth-form" onSubmit={handleResetConfirm}>
                  <label>
                    Saisissez EFFACER pour confirmer la réinitialisation
                    <div className="auth-input">
                      <FolioIcon name="trash" size={17} />
                      <input
                        type="text"
                        value={resetConfirmationText}
                        onChange={(e) => setResetConfirmationText(e.target.value)}
                        placeholder="EFFACER"
                      />
                    </div>
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="submit"
                      disabled={
                        resetConfirmationText.trim().toUpperCase() !== 'EFFACER' || isProcessing
                      }
                      className="auth-submit"
                      style={{ flex: 1, background: '#a94444' }}
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      className="auth-switch"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setShowResetConfirm(false);
                        setResetConfirmationText('');
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
        <p className="auth-legal">
          En continuant, vous acceptez nos{' '}
          <button
            type="button"
            onClick={() => setLegalModalState({ open: true, tab: 'mentions' })}
            style={{
              border: 0,
              background: 'transparent',
              color: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
              fontWeight: 600,
            }}
          >
            Mentions Légales
          </button>{' '}
          et nos{' '}
          <button
            type="button"
            onClick={() => setLegalModalState({ open: true, tab: 'cgu' })}
            style={{
              border: 0,
              background: 'transparent',
              color: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
            }}
          >
            Conditions d’Utilisation
          </button>
          .
        </p>
      </section>

      {legalModalState.open && (
        <LegalModal
          initialTab={legalModalState.tab}
          onClose={() => setLegalModalState({ open: false, tab: 'mentions' })}
        />
      )}
    </main>
  );
};
