import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { edad, fCorta, fDia } from '../utils.js';
import PacienteForm from '../components/PacienteForm.jsx';

export default function Pacientes() {
  const { usuario } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [nuevo, setNuevo] = useState(false);

  // Busca 300 ms después de dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => api('/pacientes?q=' + encodeURIComponent(q)).then(setRows), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <div className="head">
        <div><h1>Pacientes</h1><p>{usuario.rol === 'medico' ? 'Pacientes que tienes asignados o has atendido.' : 'Todos los pacientes del consultorio, con su última y próxima cita.'}</p></div>
        <button className="btn primary new-appointment" onClick={() => setNuevo(true)}><span aria-hidden="true">+</span> Nuevo paciente</button>
      </div>
      <div className="directory-tools">
        <label className="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <input type="search" aria-label="Buscar paciente" placeholder="Buscar por nombre, identidad o teléfono" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <span className="directory-count">{rows ? `${rows.length} ${rows.length === 1 ? 'paciente' : 'pacientes'}` : 'Cargando…'}</span>
      </div>
      <div className="tablewrap patient-table"><table>
        <thead><tr><th>Paciente</th><th>Identidad</th><th>Edad</th><th>Teléfono</th><th>Médico tratante</th><th>Última consulta</th><th>Próxima cita</th></tr></thead>
        <tbody>
          {rows === null ? <tr><td colSpan="7" className="empty">Cargando…</td></tr>
            : !rows.length ? <tr><td colSpan="7" className="empty">No hay pacientes que coincidan con la búsqueda.</td></tr>
            : rows.map(p => (
              <tr key={p.id} className="click" onClick={() => nav('/pacientes/' + p.id)}>
                <td><b>{p.apellidos}</b>, {p.nombres}{p.alergias && <> <span className="pill bad" title={p.alergias}>Alergia</span></>}</td>
                <td className="mono">{p.dni || '—'}</td><td>{edad(p.fecha_nac)}</td><td className="mono">{p.telefono}</td>
                <td>{p.medico || '—'}</td><td>{fCorta(p.ultima_consulta)}</td>
                <td>{p.proxima_cita ? <>{fDia(p.proxima_cita)} <span className="mono">{p.proxima_cita.slice(11)}</span></> : '—'}</td>
              </tr>
            ))}
        </tbody>
      </table></div>
      {nuevo && <PacienteForm onClose={() => setNuevo(false)} onSaved={id => nav('/pacientes/' + id)} />}
    </>
  );
}
