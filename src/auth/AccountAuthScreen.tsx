import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { login, register } from './api';

const ERRORS: Record<string, string> = {
  bad_credentials: 'Email ou mot de passe incorrect.',
  email_taken: 'Un compte existe déjà avec cet email.',
  invalid_input: 'Email invalide ou mot de passe trop court (10 caractères minimum).',
};

const inputCls =
  'w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500';

export const AccountAuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (mode === 'login' ? login : register)(email, password);
    } catch (err: any) {
      setError(ERRORS[err?.message] ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-12 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <form
        onSubmit={submit}
        className="w-full max-w-md p-8 sm:p-10 rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-zinc-900/70 space-y-5"
      >
        <div className="space-y-1.5">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
            <BookOpen className="w-4 h-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Votre compte permet de rester connecté sur plusieurs appareils. Il est distinct de la clé
            d’accès qui chiffre votre bibliothèque.
          </p>
        </div>

        {error && (
          <div className="px-3.5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="acc-email" className="block text-xs font-medium mb-1.5">Email</label>
          <input id="acc-email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="acc-password" className="block text-xs font-medium mb-1.5">Mot de passe</label>
          <input id="acc-password" type="password" required minLength={10}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? '10 caractères minimum' : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>

        <button type="submit" disabled={busy}
          className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 font-medium text-xs transition-colors cursor-pointer">
          {busy ? 'Patientez...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>

        <button type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="w-full text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
          {mode === 'login' ? 'Pas de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
    </div>
  );
};
