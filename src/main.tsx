import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './auth/AuthGate.tsx';
import { HomeHub } from './hub/HomeHub.tsx';
import './index.css';

export function navigateTo(href: string) {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    window.location.href = href;
    return;
  }
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function shouldRenderReader(): boolean {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return (
    path.startsWith('/reader') ||
    params.has('read') ||
    params.has('reset')
  );
}

const RootRouter: React.FC = () => {
  const [inReader, setInReader] = useState<boolean>(shouldRenderReader);

  useEffect(() => {
    const onRouteChange = () => {
      setInReader(shouldRenderReader());
    };
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, []);

  const handleOpenApp = useCallback((href: string) => {
    navigateTo(href);
  }, []);

  if (!inReader) {
    return <HomeHub onOpenApp={handleOpenApp} />;
  }

  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
};

createRoot(document.getElementById('root')!).render(<RootRouter />);
