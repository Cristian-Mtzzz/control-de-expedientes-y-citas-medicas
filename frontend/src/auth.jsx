import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then(setUsuario).catch(() => setToken(null)).finally(() => setCargando(false));
  }, []);

  async function login(email, password) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.token);
    setUsuario(r.usuario);
  }
  function logout() { setToken(null); setUsuario(null); }

  return <AuthCtx.Provider value={{ usuario, cargando, login, logout }}>{children}</AuthCtx.Provider>;
}
