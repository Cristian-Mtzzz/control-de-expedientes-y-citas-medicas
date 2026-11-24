import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault(); setErr(''); setEnviando(true);
    try { await login(email, password); nav('/agenda'); }
    catch (e2) { setErr(e2.message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="login">
      <section className="login-story">
        <div className="login-brand">
          <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true"><rect width="42" height="42" rx="13" fill="currentColor" /><path d="M18 9h6v9h9v6h-9v9h-6v-9H9v-6h9z" fill="#eff8f4" /><circle cx="32" cy="10" r="4" fill="#d8b15c" /></svg>
          <span><b>Consultorio</b><small>Gestión de citas</small></span>
        </div>
        <div className="login-message">
          <span className="login-rule" />
          <h1>Agenda y seguimiento<br />del consultorio.</h1>
          <p>Citas del día, controles pendientes y la ficha de cada paciente.</p>
        </div>
        <div className="login-foot">Uso interno del consultorio</div>
      </section>
      <section className="login-panel">
        <form onSubmit={entrar}>
          <div className="login-mobile-brand">
            <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true"><rect width="42" height="42" rx="13" fill="currentColor" /><path d="M18 9h6v9h9v6h-9v9h-6v-9H9v-6h9z" fill="#eff8f4" /><circle cx="32" cy="10" r="4" fill="#d8b15c" /></svg>
            <span><b>Consultorio</b><small></small></span>
          </div>
          <div className="login-form-heading"><h2>Iniciar sesión</h2><p>Usa el correo y la contraseña de tu cuenta.</p></div>
          <div className="f"><label htmlFor="lg-email">Correo o usuario</label><input id="lg-email" type="text" inputMode="email" autoComplete="username" autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="f"><label htmlFor="lg-pass">Contraseña</label><input id="lg-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary login-submit" disabled={enviando}>{enviando ? 'Verificando…' : 'Entrar al consultorio'}</button>
          <p className="login-help">¿Necesitas acceso? Solicítalo al administrador del consultorio.</p>
        </form>
      </section>
    </div>
  );
}
