import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { ROLES } from '../utils.js';
import Modal from '../components/Modal.jsx';

function UsuarioForm({ u, onClose, onSaved }) {
  const [f, setF] = useState(u ? { ...u, especialidad: u.especialidad || '', password: '' } : { nombre: '', email: '', rol: 'medico', especialidad: '', color: '#2d6fa8', activo: true, logo_data: null, password: '' });
  const [err, setErr] = useState('');
  const [leyendoLogo, setLeyendoLogo] = useState(false);
  const lectorLogo = useRef(null);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  function cargarLogo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    lectorLogo.current?.abort();
    lectorLogo.current = null;
    setLeyendoLogo(false);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
      setErr('Elige una imagen PNG, JPG o WebP.');
      return;
    }
    if (archivo.size > 1024 * 1024) {
      setErr('El logo debe pesar como máximo 1 MB.');
      return;
    }
    const lector = new FileReader();
    lectorLogo.current = lector;
    setLeyendoLogo(true);
    lector.onload = () => {
      if (lectorLogo.current !== lector) return;
      lectorLogo.current = null;
      setF(x => ({ ...x, logo_data: String(lector.result) }));
      setErr('');
      setLeyendoLogo(false);
    };
    lector.onerror = () => {
      if (lectorLogo.current !== lector) return;
      lectorLogo.current = null;
      setErr('No se pudo leer el archivo de imagen.');
      setLeyendoLogo(false);
    };
    lector.readAsDataURL(archivo);
  }
  async function guardar(e) {
    e.preventDefault(); setErr('');
    try {
      if (u) await api('/usuarios/' + u.id, { method: 'PUT', body: f });
      else await api('/usuarios', { method: 'POST', body: f });
      onSaved();
    } catch (e2) { setErr(e2.message); }
  }
  return (
    <Modal title={u ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="body">
          <div className="f"><label htmlFor="us-nom">Nombre completo</label><input id="us-nom" placeholder="Ej. Dr. Mario Andino" value={f.nombre} onChange={set('nombre')} /></div>
          <div className="f2">
            <div className="f"><label htmlFor="us-mail">Correo (para entrar)</label><input id="us-mail" type="email" value={f.email} onChange={set('email')} /></div>
            <div className="f"><label htmlFor="us-pass">{u ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label><input id="us-pass" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={f.password} onChange={set('password')} /></div>
          </div>
          <div className="f2">
            <div className="f"><label htmlFor="us-rol">Rol</label><select id="us-rol" value={f.rol} onChange={set('rol')}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="f"><label htmlFor="us-esp">Especialidad</label><input id="us-esp" placeholder="Solo para médicos" value={f.especialidad} onChange={set('especialidad')} /></div>
          </div>
          <div className="f2">
            <div className="f"><label htmlFor="us-col">Color en la agenda</label><input id="us-col" type="color" style={{ height: 38, padding: 3 }} value={f.color} onChange={set('color')} /></div>
            <div className="f"><label htmlFor="us-act">Estado</label><select id="us-act" value={f.activo ? '1' : '0'} onChange={e => setF(x => ({ ...x, activo: e.target.value === '1' }))}><option value="1">Activo</option><option value="0">Inactivo</option></select></div>
          </div>
          {f.rol === 'medico' && <div className="f logo-field">
            <label htmlFor="us-logo">Logo del médico</label>
            <div className="logo-editor">
              <div className="logo-preview">
                {f.logo_data ? <img src={f.logo_data} alt="Vista previa del logo" /> : <span>Sin logo</span>}
              </div>
              <div className="logo-actions">
                <input id="us-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={cargarLogo} />
                <small>PNG, JPG o WebP · máximo 1 MB</small>
                {f.logo_data && <button type="button" className="btn sm" onClick={() => {
                  lectorLogo.current?.abort();
                  lectorLogo.current = null;
                  setLeyendoLogo(false);
                  setF(x => ({ ...x, logo_data: null }));
                }}>Quitar logo</button>}
              </div>
            </div>
          </div>}
          {err && <div className="err">{err}</div>}
        </div>
        <footer><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={leyendoLogo}>{leyendoLogo ? 'Leyendo imagen…' : 'Guardar'}</button></footer>
      </form>
    </Modal>
  );
}

export default function Usuarios() {
  const { toast } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const cargar = useCallback(() => { api('/usuarios').then(setRows); }, []);
  useEffect(cargar, [cargar]);
  async function editar(u) {
    try { setModal({ u: await api('/usuarios/' + u.id) }); }
    catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="head"><div><h1>Equipo</h1><p>Médicos y personal con acceso al sistema.</p></div>
        <button className="btn primary" onClick={() => setModal({ u: null })}>Nuevo usuario</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Especialidad</th><th>Pacientes</th><th>Estado</th><th></th></tr></thead>
        <tbody>{rows.map(u => (
          <tr key={u.id}>
            <td>{u.rol === 'medico' && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: u.color, marginRight: 6 }} />}<b>{u.nombre}</b></td>
            <td>{u.email}</td><td>{ROLES[u.rol]}</td><td>{u.especialidad || '—'}</td>
            <td className="mono">{u.rol === 'medico' ? u.pacientes : '—'}</td>
            <td>{u.activo ? <span className="pill ok">Activo</span> : <span className="pill neutral">Inactivo</span>}</td>
            <td><button className="btn sm" onClick={() => editar(u)}>Editar</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      {modal && <UsuarioForm u={modal.u} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Usuario guardado'); cargar(); }} />}
    </>
  );
}
