import React, { useState } from 'react';
import { FolioIcon } from '../components/FolioIcon';
import { login, register } from './api';

const ERRORS: Record<string, string> = {
  bad_credentials: 'Email ou mot de passe incorrect.',
  email_taken: 'Un compte existe déjà avec cet email.',
  invalid_input: 'Email invalide ou mot de passe trop court (10 caractères minimum).',
};

export const AccountAuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'register';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
          <p className="auth-form-kicker">{isSignup ? 'Begin your collection' : 'Welcome back'}</p>
          <h2>{isSignup ? 'Create your reading space.' : 'Return to your library.'}</h2>
          <p className="auth-form-copy">
            {isSignup
              ? 'A few details and your personal library is ready.'
              : 'Enter your details to continue your reading journey.'}
          </p>

          {error && <div className="auth-error-banner">{error}</div>}

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
            <label htmlFor="acc-password">
              Password
              <div className="auth-input">
                <FolioIcon name="lock" size={17} />
                <input
                  id="acc-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={10}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder={isSignup ? '10 caractères minimum' : 'Enter your password'}
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
            {!isSignup && (
              <div className="auth-options">
                <label>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy
                ? 'Please wait...'
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
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {isSignup ? 'I already have an account' : 'I don’t have an account'}
          </button>
        </div>
        <p className="auth-legal">By continuing, you agree to our Terms and Privacy Policy.</p>
      </section>
    </main>
  );
};
