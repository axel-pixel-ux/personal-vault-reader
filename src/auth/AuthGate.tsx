import React from 'react';
import { AuthProvider, useAuth } from './AuthProvider';
import { AccountAuthScreen } from './AccountAuthScreen';
import { AccountBar } from './DevicesPanel';

const Gate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authed, ready } = useAuth();
  if (!ready) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" aria-busy="true" />;
  }
  if (!authed) return <AccountAuthScreen />;
  return (
    <>
      {children}
      <AccountBar />
    </>
  );
};

/** Protège l'application : compte requis avant d'accéder au coffre local. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <Gate>{children}</Gate>
  </AuthProvider>
);
