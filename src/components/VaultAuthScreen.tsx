import React, { useState } from 'react';
import {
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  Moon,
  RotateCcw,
  Sun,
} from 'lucide-react';
import { VaultAuthConfig } from '../types/vault';

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
  isDark,
  onToggleTheme,
  onInitializeVault,
  onUnlockVault,
  onResetVault,
}) => {
  const [username, setUsername] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [seedSamples, setSeedSamples] = useState<boolean>(true);
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resetConfirmationText, setResetConfirmationText] = useState<string>('');

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
    <div className="min-h-screen w-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      {/* En-tête minimaliste */}
      <header className="flex items-center justify-between gap-8 px-6 sm:px-10 py-4 border-b border-zinc-200/80 dark:border-zinc-900">
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0">
          Bibliothèque
        </span>

        <nav className="hidden sm:flex items-center gap-6 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="whitespace-nowrap shrink-0">Mes lectures</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">
            {authConfig ? 'Verrouillé' : 'Configuration'}
          </span>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5" />
                <span>Clair</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span>Sombre</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Carte centrale épurée */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md p-8 sm:p-10 rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-zinc-900/70">
          {!authConfig ? (
            <form onSubmit={handleInitSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 mb-3">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Créer votre bibliothèque
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Définissez votre nom et une clé d’accès pour protéger vos livres et vos notes locales.
                </p>
              </div>

              {errorMessage && (
                <div className="px-3.5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
                  {errorMessage}
                </div>
              )}

              <div>
                <label
                  htmlFor="vault-init-username"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Nom
                </label>
                <input
                  id="vault-init-username"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Ex. Camille"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label
                  htmlFor="vault-init-passphrase"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Clé d’accès
                </label>
                <div className="relative">
                  <input
                    id="vault-init-passphrase"
                    type={showPassphrase ? 'text' : 'password'}
                    required
                    placeholder="8 caractères minimum"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    title={showPassphrase ? 'Masquer' : 'Afficher'}
                  >
                    {showPassphrase ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="vault-init-confirm"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Confirmer la clé
                </label>
                <input
                  id="vault-init-confirm"
                  type={showPassphrase ? 'text' : 'password'}
                  required
                  placeholder="Répétez la clé d’accès"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seedSamples}
                  onChange={(e) => setSeedSamples(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-0"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  Inclure quatre ouvrages d’exemple (.epub, .pdf, .md, .txt)
                </span>
              </label>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 font-medium text-xs transition-colors cursor-pointer"
              >
                {isProcessing ? 'Préparation...' : 'Continuer'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <form onSubmit={handleUnlockSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 mb-3">
                    <Lock className="w-4 h-4" />
                  </div>
                  <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {authConfig.username}
                  </h1>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Bibliothèque verrouillée. Saisissez votre clé pour accéder à vos lectures.
                  </p>
                </div>

                {errorMessage && (
                  <div className="px-3.5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
                    {errorMessage}
                  </div>
                )}

                <div>
                  <label htmlFor="vault-unlock-passphrase" className="sr-only">
                    Clé d’accès
                  </label>
                  <div className="relative">
                    <input
                      id="vault-unlock-passphrase"
                      type={showPassphrase ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Clé d’accès..."
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      title={showPassphrase ? 'Masquer' : 'Afficher'}
                    >
                      {showPassphrase ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 font-medium text-xs transition-colors cursor-pointer"
                >
                  {isProcessing ? 'Ouverture...' : 'Ouvrir la bibliothèque'}
                </button>
              </form>

              <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80">
                {!showResetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Réinitialiser la bibliothèque</span>
                  </button>
                ) : (
                  <form onSubmit={handleResetConfirm} className="space-y-2.5">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Cette action supprime les fichiers stockés localement. Saisissez{' '}
                      <code className="font-mono text-zinc-700 dark:text-zinc-200">
                        EFFACER
                      </code>{' '}
                      pour confirmer.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={resetConfirmationText}
                        onChange={(e) => setResetConfirmationText(e.target.value)}
                        placeholder="EFFACER"
                        className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={
                          resetConfirmationText.trim().toUpperCase() !== 'EFFACER' ||
                          isProcessing
                        }
                        className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-medium"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowResetConfirm(false);
                          setResetConfirmationText('');
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-xs"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
