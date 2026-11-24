import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ESTADOS, abierta, addDays, diffDays, fDia, fLarga, hoy } from '../utils.js';
import CitaForm from '../components/CitaForm.jsx';
import AtenderForm from '../components/AtenderForm.jsx';
import Modal, { Confirmar } from '../components/Modal.jsx';
import { NotaView } from './Ficha.jsx';

export default function Agenda() {
  const { usuario } = useAuth();
  const { toast, refrescarNav } = useOutletContext();
  const esMedico = usuario.rol === 'medico';
  const [fecha, setFecha] = useState(hoy());
  const [filtro, setFiltro] = useState('todos');
  const [medicos, setMedicos] = useState([]);
  const [citas, setCitas] = useState([]);
  const [vencidos, setVencidos] = useState(0);
  const [modal, setModal] = useState(null);

  const cargar = useCallback(() => {
    api('/citas?fecha=' + fecha).then(setCitas).catch(e => toast(e.message));
    api('/seguimientos?estado=pendiente').then(r => setVencidos(r.filter(s => diffDays(hoy(), s.fecha_objetivo) <= 0).length));
    refrescarNav();
  }, [fecha, toast, refrescarNav]);
  useEffect(() => { api('/usuarios/medicos').then(setMedicos); }, []);
  useEffect(cargar, [cargar]);

  async function estado(c, e, msg) {
    try { await api(`/citas/${c.id}/estado`, { method: 'PATCH', body: { estado: e } }); toast(msg); cargar(); }
    catch (er) { toast(er.message); }
  }

  const cols = medicos.filter(m => (esMedico ? m.id === usuario.id : filtro === 'todos' || m.id === Number(filtro)));
  const tiles = { total: citas.filter(abierta).length + citas.filter(c => c.estado === 'atendida').length, conf: citas.filter(c => c.estado === 'programada').length, at: citas.filter(c => c.estado === 'atendida').length };

  function Tarjeta({ c }) {
    const mia = esMedico && c.medico_id === usuario.id;
    const activa = c.estado !== 'cancelada' && c.estado !== 'no_asistio';
    return (
      <div className={'cita' + (activa ? '' : ' dim')}>
        <div className="hora">{c.hora}<span>{c.duracion} min</span></div>
        <div>
          <div className="top"><Link className="pac" to={'/pacientes/' + c.paciente_id}>{c.paciente}</Link><span className={'pill ' + c.estado}>{ESTADOS[c.estado]}</span></div>
          <div className="motivo">{c.tipo === 'subsiguiente' ? <span className="chip seg">Subsiguiente</span> : <span className="chip">Primera vez</span>} {c.motivo}{c.alergias && <> · <span className="pill bad">Alergia</span></>}</div>
          <div className="acts">
            {c.estado === 'programada' && <button className="btn sm" onClick={() => estado(c, 'confirmada', 'Cita confirmada')}>Confirmar</button>}
            {abierta(c) && mia && c.fecha <= hoy() && <button className="btn sm primary" onClick={() => setModal({ tipo: 'atender', c })}>Atender</button>}
            {abierta(c) && c.fecha <= hoy() && <button className="btn sm" onClick={() => estado(c, 'no_asistio', 'Marcada como no asistió')}>No asistió</button>}
            {abierta(c) && <button className="btn sm danger" onClick={() => setModal({ tipo: 'cancelar', c })}>Cancelar</button>}
            {c.estado === 'atendida' && esMedico && <button className="btn sm" onClick={() => setModal({ tipo: 'nota', c })}>Ver nota</button>}
            {!activa && <button className="btn sm" onClick={() => setModal({ tipo: 'cita', pre: { titulo: 'Reagendar cita', paciente_id: c.paciente_id, medico_id: c.medico_id, tipo: c.tipo, motivo: c.motivo, duracion: c.duracion, hora: c.hora } })}>Reagendar</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="agenda-heading">
        <div>
          <h1>{fLarga(fecha).replace(/^./, c => c.toLocaleUpperCase('es-HN'))}</h1>
          <p>{esMedico ? 'Tus citas de este día.' : 'Citas de todo el equipo en la fecha seleccionada.'}</p>
        </div>
        <button className="btn primary new-appointment" onClick={() => setModal({ tipo: 'cita', pre: { fecha } })}>
          <span aria-hidden="true">+</span> Nueva cita
        </button>
      </div>
      <div className="tiles">
        <div className="tile"><span className="tile-label">Citas en agenda</span><div className="tile-value">{tiles.total}</div><div className="tile-foot">Sin contar canceladas ni ausencias</div></div>
        <div className="tile"><span className="tile-label">Por confirmar</span><div className="tile-value">{tiles.conf}</div><div className="tile-foot">Sin confirmar en esta fecha</div></div>
        <div className="tile"><span className="tile-label">Atendidas</span><div className="tile-value">{tiles.at}</div><div className="tile-foot">Con nota clínica guardada</div></div>
        <Link to="/seguimiento" className={'tile follow-tile' + (vencidos ? ' alert' : '')}>
          <span className="tile-label">Controles pendientes</span><div className="tile-value">{vencidos}</div><div className="tile-foot">Vencidos o para hoy sin cita</div>
        </Link>
      </div>
      <div className="daybar">
        <div className="date-controls">
          <button className="btn icon-btn" aria-label="Día anterior" onClick={() => setFecha(addDays(fecha, -1))}>‹</button>
          <button className="btn today-btn" onClick={() => setFecha(hoy())}>Hoy</button>
          <button className="btn icon-btn" aria-label="Día siguiente" onClick={() => setFecha(addDays(fecha, 1))}>›</button>
          <input type="date" aria-label="Ir a fecha" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
        </div>
        {!esMedico && <label className="doctor-filter"><span>Médico</span>
          <select id="ag-med" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="todos">Todo el equipo</option>{medicos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </label>}
      </div>
      <div className="cols">
        {cols.map(m => {
          const cs = citas.filter(c => c.medico_id === m.id);
          return (
            <section className="col" key={m.id} style={{ '--doc': m.color }}>
              <header><div className="doctor-identity"><span className="doctor-dot" /><div><b>{m.nombre}</b><small>{m.especialidad}</small></div></div><span className="num">{cs.filter(c => c.estado !== 'cancelada' && c.estado !== 'no_asistio').length} citas</span></header>
              <div className="list">{cs.length ? cs.map(c => <Tarjeta key={c.id} c={c} />) : <div className="empty">Sin citas este día.</div>}</div>
            </section>
          );
        })}
      </div>

      {modal?.tipo === 'cita' && <CitaForm pre={modal.pre} onClose={() => setModal(null)} onSaved={f => { setModal(null); setFecha(f); toast('Cita agendada para ' + fDia(f)); cargar(); }} />}
      {modal?.tipo === 'atender' && <AtenderForm cita={modal.c} onClose={() => setModal(null)} onSaved={m => { setModal(null); toast(m); cargar(); }} />}
      {modal?.tipo === 'cancelar' && <Confirmar title="Cancelar cita" okLabel="Cancelar cita" onClose={() => setModal(null)} onOk={() => estado(modal.c, 'cancelada', 'Cita cancelada')}>
        ¿Cancelar la cita de <b>{modal.c.paciente}</b> del {fDia(modal.c.fecha)} a las {modal.c.hora}? Si venía de un seguimiento, volverá a la lista de pendientes.</Confirmar>}
      {modal?.tipo === 'nota' && <Modal title={'Nota clínica · ' + modal.c.paciente} onClose={() => setModal(null)}><div className="body"><NotaView citaId={modal.c.id} /></div></Modal>}
    </>
  );
}
