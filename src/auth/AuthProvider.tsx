import React, { createContext, useContext, useEffect, useState } from 'react';
import { bootstrap, onAuthChange } from './api';

const Ctx = createContext<{ authed: boolean; ready: boolean }>({ authed: false, ready: false });
export const useAuth = () => useContext(Ctx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const off = onAuthChange(setAuthed);
    bootstrap().finally(() => setReady(true));
    return off;
  }, []);

  return <Ctx.Provider value={{ authed, ready }}>{children}</Ctx.Provider>;
};
