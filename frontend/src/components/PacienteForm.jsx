import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { hoy } from '../utils.js';

const VACIO = { nombres: '', apellidos: '', dni: '', fecha_nac: '', sexo: 'F', telefono: '', email: '', direccion: '', sangre: '', alergias: '', contacto_emergencia: '', medico_id: '' };

export default function PacienteForm({ paciente, onClose, onSaved }) {
  const { usuario } = useAuth();
  const [medicos, setMedicos] = useState([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState(() => {
    const base = { ...VACIO, medico_id: usuario.rol === 'medico' ? usuario.id : '' };
    if (!paciente) return base;
    const p = { ...base };
    for (const k of Object.keys(VACIO)) p[k] = paciente[k] ?? '';
    return p;
  });
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  useEffect(() => { api('/usuarios/medicos').then(ms => { setMedicos(ms); setF(x => x.medico_id ? x : { ...x, medico_id: ms[0]?.id || '' }); }); }, []);

  async function guardar(e) {
    e.preventDefault(); setErr('');
    try {
      const body = { ...f, medico_id: Number(f.medico_id) || null };
      if (paciente) { await api('/pacientes/' + paciente.id, { method: 'PUT', body }); onSaved(paciente.id); }
      else { const r = await api('/pacientes', { method: 'POST', body }); onSaved(r.id); }
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <Modal title={paciente ? 'Editar paciente' : 'Nuevo paciente'} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="body">
          <div className="f2">
            <div className="f"><label htmlFor="pa-nom">Nombres</label><input id="pa-nom" value={f.nombres} onChange={set('nombres')} /></div>
            <div className="f"><label htmlFor="pa-ape">Apellidos</label><input id="pa-ape" value={f.apellidos} onChange={set('apellidos')} /></div>
          </div>
          <div className="f3">
            <div className="f"><label htmlFor="pa-dni">Identidad</label><input id="pa-dni" className="mono" placeholder="0801-1990-12345" value={f.dni} onChange={set('dni')} /></div>
            <div className="f"><label htmlFor="pa-fn">Fecha de nacimiento</label><input id="pa-fn" type="date" max={hoy()} value={f.fecha_nac} onChange={set('fecha_nac')} /></div>
            <div className="f"><label htmlFor="pa-sexo">Sexo</label><select id="pa-sexo" value={f.sexo} onChange={set('sexo')}><option value="F">Femenino</option><option value="M">Masculino</option></select></div>
          </div>
          <div className="f2">
            <div className="f"><label htmlFor="pa-tel">Teléfono</label><input id="pa-tel" className="mono" placeholder="9999-9999" value={f.telefono} onChange={set('telefono')} /></div>
            <div className="f"><label htmlFor="pa-mail">Correo</label><input id="pa-mail" type="email" value={f.email} onChange={set('email')} /></div>
          </div>
          <div className="f"><label htmlFor="pa-dir">Dirección</label><input id="pa-dir" value={f.direccion} onChange={set('direccion')} /></div>
          <div className="f3">
            <div className="f"><label htmlFor="pa-sg">Tipo de sangre</label>
              <select id="pa-sg" value={f.sangre} onChange={set('sangre')}>{['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(s => <option key={s} value={s}>{s || 'No sabe'}</option>)}</select></div>
            <div className="f" style={{ gridColumn: 'span 2' }}><label htmlFor="pa-al">Alergias</label><input id="pa-al" placeholder="Dejar vacío si no tiene" value={f.alergias} onChange={set('alergias')} /></div>
          </div>
          <div className="f"><label htmlFor="pa-ce">Contacto de emergencia</label><input id="pa-ce" placeholder="Nombre (parentesco) teléfono" value={f.contacto_emergencia} onChange={set('contacto_emergencia')} /></div>
          {usuario.rol === 'admin'
            ? <div className="f"><label htmlFor="pa-med">Médico propietario</label>
              <select id="pa-med" value={f.medico_id} onChange={set('medico_id')} required>
                <option value="">Selecciona el médico tratante…</option>
                {medicos.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.especialidad}</option>)}
              </select></div>
            : <p className="note">Este paciente quedará asignado a tu consulta y solo tú podrás verlo. Para transferirlo, solicita el cambio al administrador.</p>}
          {err && <div className="err">{err}</div>}
        </div>
        <footer><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">{paciente ? 'Guardar cambios' : 'Registrar paciente'}</button></footer>
      </form>
    </Modal>
  );
}
