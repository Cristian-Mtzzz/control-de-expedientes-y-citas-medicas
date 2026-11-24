import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { ROLES, diffDays, hoy } from '../utils.js';

const ICONS = {
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 18h2" /></>,
  pacientes: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m-3-3h6" /></>,
  seguimiento: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
  usuarios: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m-3-3h6" /></>,
};

function Marca({ usuario }) {
  return (
    <div className="brand">
      {usuario.rol === 'medico' && usuario.logo_data
        ? <img className="brand-logo" src={usuario.logo_data} alt={`Logo de ${usuario.nombre}`} />
        : <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true">
          <rect width="42" height="42" rx="13" fill="currentColor" />
          <path d="M18 9h6v9h9v6h-9v9h-6v-9H9v-6h9z" fill="#eff8f4" />
          <circle cx="32" cy="10" r="4" fill="#d8b15c" />
        </svg>}
      <div><b>Consultorio</b><span>Gestión de citas</span></div>
    </div>
  );
}

export default function Layout() {
  const { usuario, logout } = useAuth();
  const loc = useLocation();
  const [vencidos, setVencidos] = useState(0);
  const [msg, setMsg] = useState('');
  const t = useRef();

  const refrescarNav = useCallback(() => {
    api('/seguimientos?estado=pendiente')
      .then(rows => setVencidos(rows.filter(s => diffDays(hoy(), s.fecha_objetivo) <= 0).length))
      .catch(() => {});
  }, []);
  useEffect(refrescarNav, [loc.pathname, refrescarNav]);

  const toast = useCallback(m => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 2600); }, []);
  const navItem = (to, icon, label, badge) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'on' : '')} key={to}>
      <span className="nav-item">
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[icon]}</svg>
        <span>{label}</span>
      </span>
      {badge}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className="side">
        <Marca usuario={usuario} />
        <nav className="nav">
          {navItem('/agenda', 'agenda', 'Agenda')}
          {navItem('/pacientes', 'pacientes', 'Pacientes')}
          {navItem('/seguimiento', 'seguimiento', 'Seguimiento',
            vencidos > 0 && <span className="count" title="Vencidos o que vencen hoy">{vencidos}</span>)}
          {usuario.rol === 'admin' && navItem('/usuarios', 'usuarios', 'Equipo')}
          <button className="mobile-logout" onClick={logout}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
            <span>Salir</span>
          </button>
        </nav>
        <div className="whoami">
          <div className="user-avatar" aria-hidden="true">{usuario.nombre.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
          <div className="user-copy">
            <b>{usuario.nombre}</b>
            <p>{ROLES[usuario.rol]}{usuario.especialidad ? ' · ' + usuario.especialidad : ''}</p>
          </div>
          <button className="linkbtn" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main>
        <header className="workspace-topbar">
          <span>Consultorio <span className="topbar-slash">/</span> <b>{loc.pathname.startsWith('/pacientes') ? 'Pacientes' : loc.pathname === '/seguimiento' ? 'Seguimiento' : loc.pathname === '/usuarios' ? 'Equipo' : 'Agenda'}</b></span>
          <span className="topbar-date">{new Date().toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </header>
        <Outlet context={{ toast, refrescarNav }} />
      </main>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
