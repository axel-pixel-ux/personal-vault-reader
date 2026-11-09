import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './auth/AuthGate.tsx';
import EtudesApp from './etudes/EtudesApp.tsx';
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

type ActiveRoute = 'hub' | 'reader' | 'etudes';

function resolveRoute(): ActiveRoute {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  if (path.startsWith('/etude')) {
    return 'etudes';
  }
  if (path.startsWith('/reader') || params.has('read') || params.has('reset')) {
    return 'reader';
  }
  return 'hub';
}

const RootRouter: React.FC = () => {
  const [route, setRoute] = useState<ActiveRoute>(resolveRoute);

  useEffect(() => {
    const onRouteChange = () => {
      setRoute(resolveRoute());
    };
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, []);

  const handleOpenApp = useCallback((href: string) => {
    navigateTo(href);
  }, []);

  if (route === 'hub') {
    return <HomeHub onOpenApp={handleOpenApp} />;
  }

  if (route === 'etudes') {
    return (
      <AuthGate hideFloatingBar>
        <EtudesApp />
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
};

createRoot(document.getElementById('root')!).render(<RootRouter />);
