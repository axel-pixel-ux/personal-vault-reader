import React, { useState } from 'react';
import { FolioIcon } from '../components/FolioIcon';
import { TermsModal } from '../components/TermsModal';
import { login, register, requestPasswordReset, resetPassword } from './api';

const ERRORS: Record<string, string> = {
  bad_credentials: 'Email ou mot de passe incorrect.',
  email_taken: 'Un compte existe déjà avec cet email.',
  invalid_input: 'Email invalide ou mot de passe trop court (10 caractères minimum).',
  invalid_or_expired_token: 'Ce lien est invalide ou a expiré. Refaites une demande.',
  too_many_requests: 'Trop de tentatives. Réessayez dans quelques minutes.',
  smtp_not_configured:
    'Serveur mail (SMTP) non configuré sur la box : renseignez SMTP_USER et SMTP_PASS dans le fichier .env de la VM.',
  smtp_send_failed: 'Impossible d’envoyer l’e-mail de réinitialisation. Vérifiez les identifiants SMTP.',
};

export const AccountAuthScreen: React.FC = () => {
  const resetToken = React.useMemo(() => new URLSearchParams(window.location.search).get('reset'), []);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const isSignup = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  const goLogin = () => {
    setMode('login');
    setError(null);
    setPassword('');
    if (resetToken) window.history.replaceState({}, '', window.location.pathname);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (isForgot) {
        await requestPasswordReset(email);
        setInfo('Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d’être envoyé.');
        return;
      }
      if (isReset) {
        await resetPassword(resetToken ?? '', password);
        goLogin();
        setInfo('Mot de passe modifié. Vous pouvez vous connecter.');
        return;
      }
      if (isSignup && name.trim()) {
        try {
          localStorage.setItem('folio_pending_username', name.trim());
        } catch {
          // Ignorer
        }
      }
      await (mode === 'login' ? login : register)(email, password);
    } catch (err: any) {
      setError(ERRORS[err?.message] ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setBusy(false);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <a className="auth-brand" href="#sign-in" aria-label="Folio × Études">
            <span className="brand-mark">
              <FolioIcon name="book" size={22} />
            </span>
            Folio × Études
          </a>
          <a
            href="/"
            className="hub-back-link"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            ← Retour au Hub
          </a>
        </div>
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
          <p className="auth-form-kicker">
            {isReset
              ? 'Nouveau mot de passe'
              : isForgot
              ? 'Mot de passe oublié'
              : isSignup
              ? 'Begin your collection'
              : 'Welcome back'}
          </p>
          <h2>
            {isReset
              ? 'Choisissez un nouveau mot de passe.'
              : isForgot
              ? 'Réinitialiser votre mot de passe.'
              : isSignup
              ? 'Create your reading space.'
              : 'Return to your library.'}
          </h2>
          <p className="auth-form-copy">
            {isReset
              ? 'Saisissez votre nouveau mot de passe (10 caractères minimum).'
              : isForgot
              ? 'Entrez l’adresse e-mail de votre compte pour recevoir un lien de réinitialisation.'
              : isSignup
              ? 'A few details and your personal library is ready.'
              : 'Enter your details to continue your reading journey.'}
          </p>

          {error && <div className="auth-error-banner">{error}</div>}
          {info && <div className="auth-error-banner" style={{ background: 'rgba(60,140,90,.12)', color: 'inherit' }}>{info}</div>}

          <form className="auth-form" onSubmit={submit}>
            {isSignup && (
              <label htmlFor="acc-name">
                Your name
                <div className="auth-input">
                  <FolioIcon name="file" size={17} />
                  <input
                    id="acc-name"
                    name="name"
                    type="text"
                    placeholder="Jane Reader"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </label>
            )}
            {!isReset && (
              <label htmlFor="acc-email">
                Email address
                <div className="auth-input">
                  <span className="mail-icon">@</span>
                  <input
                    id="acc-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </label>
            )}
            {!isForgot && (
              <label htmlFor="acc-password">
                {isReset ? 'New password' : 'Password'}
                <div className="auth-input">
                  <FolioIcon name="lock" size={17} />
                  <input
                    id="acc-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={10}
                    autoComplete={isSignup || isReset ? 'new-password' : 'current-password'}
                    placeholder={isSignup || isReset ? '10 caractères minimum' : 'Enter your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            )}
            {mode === 'login' && (
              <div className="auth-options">
                <label>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy
                ? 'Veuillez patienter...'
                : isReset
                ? 'Enregistrer le nouveau mot de passe'
                : isForgot
                ? 'Envoyer le lien par e-mail'
                : isSignup
                ? 'Create my library'
                : 'Enter my library'}
              <FolioIcon name="chevron" size={16} />
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              if (isForgot || isReset) {
                goLogin();
                setInfo(null);
                return;
              }
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setInfo(null);
            }}
          >
            {isForgot || isReset
              ? 'Retour à la connexion'
              : isSignup
              ? 'I already have an account'
              : 'I don’t have an account'}
          </button>
        </div>
        <p className="auth-legal">
          En continuant, vous acceptez nos{' '}
          <button
            type="button"
            onClick={() => setShowTerms(true)}
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
            Conditions Générales &amp; Confidentialité
          </button>
          .
        </p>
      </section>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </main>
  );
};
