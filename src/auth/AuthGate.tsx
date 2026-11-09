import React from 'react';
import { AuthProvider, useAuth } from './AuthProvider';
import { AccountAuthScreen } from './AccountAuthScreen';
import { AccountBar } from './DevicesPanel';

const Gate: React.FC<{ children: React.ReactNode; hideFloatingBar?: boolean }> = ({
  children,
  hideFloatingBar = false,
}) => {
  const { authed, ready } = useAuth();
  if (!ready) {
    return <div className="min-h-screen" style={{ background: 'var(--paper)' }} aria-busy="true" />;
  }
  if (!authed) return <AccountAuthScreen />;
  return (
    <>
      {children}
      {!hideFloatingBar && <AccountBar />}
    </>
  );
};

/** Protège l'application : compte unique requis avant d'accéder à Folio ou au site Études. */
export const AuthGate: React.FC<{ children: React.ReactNode; hideFloatingBar?: boolean }> = ({
  children,
  hideFloatingBar = false,
}) => (
  <AuthProvider>
    <Gate hideFloatingBar={hideFloatingBar}>{children}</Gate>
  </AuthProvider>
);
