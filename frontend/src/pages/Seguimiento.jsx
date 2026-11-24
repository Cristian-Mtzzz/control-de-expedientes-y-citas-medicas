import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { fCorta, plazoSeg } from '../utils.js';
import CitaForm from '../components/CitaForm.jsx';
import { Confirmar } from '../components/Modal.jsx';

const TABS = [['pendiente', 'Pendientes de agendar'], ['agendado', 'Agendados'], ['todos', 'Todos']];

export default function Seguimiento() {
  const { toast, refrescarNav } = useOutletContext();
  const [tab, setTab] = useState('pendiente');
  const [todos, setTodos] = useState([]);
  const [modal, setModal] = useState(null);

  const cargar = useCallback(() => { api('/seguimientos?estado=todos').then(setTodos); refrescarNav(); }, [refrescarNav]);
  useEffect(cargar, [cargar]);

  const lista = todos.filter(s => tab === 'todos' || s.estado === tab);
  const cnt = k => (k === 'todos' ? todos.length : todos.filter(s => s.estado === k).length);

  return (
    <>
      <div className="head"><div><h1>Seguimiento</h1><p>Controles indicados al atender una cita. Agenda la cita subsiguiente antes de que venzan.</p></div></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <span className="mono">{cnt(k)}</span></button>)}
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Paciente</th><th>Médico</th><th>Motivo del control</th><th>Fecha objetivo</th><th>Plazo</th><th></th></tr></thead>
        <tbody>{lista.length ? lista.map(s => {
          const pl = plazoSeg(s);
          return (
            <tr key={s.id}>
              <td><Link to={'/pacientes/' + s.paciente_id}><b>{s.paciente}</b></Link><small className="mono">{s.telefono}</small></td>
              <td>{s.medico}</td><td>{s.motivo}</td><td>{fCorta(s.fecha_objetivo)}</td>
              <td><span className={'pill ' + pl.cls}>{pl.txt}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{s.estado === 'pendiente' && <>
                <button className="btn sm primary" onClick={() => setModal({ tipo: 'cita', s })}>Agendar</button>{' '}
                <button className="btn sm" onClick={() => setModal({ tipo: 'cerrar', s })}>Cerrar</button>
              </>}</td>
            </tr>
          );
        }) : <tr><td colSpan="6" className="empty">No hay seguimientos en esta lista.</td></tr>}</tbody>
      </table></div>

      {modal?.tipo === 'cita' && <CitaForm
        pre={{ titulo: 'Agendar cita subsiguiente', paciente_id: modal.s.paciente_id, medico_id: modal.s.medico_id, tipo: 'subsiguiente', motivo: modal.s.motivo, seguimiento_id: modal.s.id, fecha: modal.s.fecha_objetivo }}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Cita subsiguiente agendada'); cargar(); }} />}
      {modal?.tipo === 'cerrar' && <Confirmar title="Cerrar seguimiento" okLabel="Cerrar seguimiento" onClose={() => setModal(null)}
        onOk={async () => { try { await api(`/seguimientos/${modal.s.id}/cerrar`, { method: 'PATCH' }); toast('Seguimiento cerrado'); cargar(); } catch (e) { toast(e.message); } }}>
        ¿Cerrar el seguimiento de <b>{modal.s.paciente}</b> sin agendar cita? Úsalo cuando ya no necesita el control o no se le pudo contactar.</Confirmar>}
    </>
  );
}
