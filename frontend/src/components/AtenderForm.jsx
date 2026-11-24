import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { addDays, edad, fCorta, fDia, hoy } from '../utils.js';

export default function AtenderForm({ cita, onClose, onSaved }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ motivo: cita.motivo, examen: '', diagnostico: '', tratamiento: '', indicaciones: '' });
  const [plazo, setPlazo] = useState('30');
  const [fseg, setFseg] = useState(addDays(hoy(), 30));
  const [mseg, setMseg] = useState('');
  const [agendar, setAgendar] = useState(true);
  const [hora, setHora] = useState(cita.hora);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  useEffect(() => { api('/pacientes/' + cita.paciente_id).then(setP); }, [cita.paciente_id]);

  function cambiarPlazo(v) { setPlazo(v); if (v && v !== 'otra') setFseg(addDays(hoy(), Number(v))); }

  async function guardar(e) {
    e.preventDefault(); setErr('');
    try {
      const r = await api(`/citas/${cita.id}/atender`, {
        method: 'POST',
        body: { ...f, seguimiento: plazo ? { fecha_objetivo: fseg, motivo: mseg, agendar, hora } : null },
      });
      onSaved(r.agendado ? 'Consulta guardada · control agendado ' + fDia(fseg) : r.seguimiento ? 'Consulta guardada · seguimiento pendiente de agendar' : 'Consulta guardada');
    } catch (e2) { setErr(e2.message); }
  }

  const prev = (p?.notas || []).slice(0, 2);
  return (
    <Modal title={'Atender: ' + cita.paciente} onClose={onClose} wide>
      <form onSubmit={guardar}>
        <div className="body"><div className="atender">
          <aside className="resumen">
            {!p ? <span className="note">Cargando…</span> : <>
              <div><b>{p.nombres} {p.apellidos}</b><div className="note">{edad(p.fecha_nac)} · {p.sexo}{p.sangre ? ' · ' + p.sangre : ''}</div></div>
              {p.alergias ? <div className="alergia">Alergias: {p.alergias}</div> : <div className="note">Sin alergias registradas</div>}
              <div><span className={'chip' + (cita.tipo === 'subsiguiente' ? ' seg' : '')}>{cita.tipo === 'subsiguiente' ? 'Subsiguiente' : 'Primera vez'}</span> <span className="mono note">{fDia(cita.fecha)} {cita.hora}</span></div>
              {prev.length ? prev.map(n => (
                <div className="prev" key={n.id}><b>{fCorta(n.fecha)}</b> · {n.medico}<br />{n.diagnostico}<br /><span className="note">{n.tratamiento}</span></div>
              )) : <div className="prev note">Primera consulta registrada.</div>}
            </>}
          </aside>
          <div className="stack" style={{ gap: 12 }}>
            <div className="f"><label htmlFor="at-mot">Motivo de consulta</label><input id="at-mot" value={f.motivo} onChange={set('motivo')} /></div>
            <div className="f"><label htmlFor="at-ex">Hallazgos / examen físico</label><textarea id="at-ex" placeholder="Signos vitales, exploración, resultados…" value={f.examen} onChange={set('examen')} /></div>
            <div className="f"><label htmlFor="at-dx">Diagnóstico</label><input id="at-dx" placeholder="Ej. Hipertensión arterial esencial (I10)" value={f.diagnostico} onChange={set('diagnostico')} /></div>
            <div className="f2">
              <div className="f"><label htmlFor="at-tx">Tratamiento</label><textarea id="at-tx" value={f.tratamiento} onChange={set('tratamiento')} /></div>
              <div className="f"><label htmlFor="at-in">Indicaciones</label><textarea id="at-in" value={f.indicaciones} onChange={set('indicaciones')} /></div>
            </div>
            <div className="segbox">
              <div className="f2">
                <div className="f"><label htmlFor="at-plazo">Próximo control</label>
                  <select id="at-plazo" value={plazo} onChange={e => cambiarPlazo(e.target.value)}>
                    <option value="">Sin seguimiento</option><option value="7">En 1 semana</option><option value="14">En 2 semanas</option>
                    <option value="30">En 1 mes</option><option value="90">En 3 meses</option><option value="otra">Otra fecha…</option>
                  </select></div>
                <div className="f"><label htmlFor="at-fseg">Fecha del control</label>
                  <input id="at-fseg" type="date" min={addDays(hoy(), 1)} value={fseg} disabled={plazo !== 'otra'} onChange={e => setFseg(e.target.value)} /></div>
              </div>
              <div className="f"><label htmlFor="at-mseg">Motivo del control</label><input id="at-mseg" disabled={!plazo} placeholder="Ej. Revisar resultados de laboratorio" value={mseg} onChange={e => setMseg(e.target.value)} /></div>
              <label className="check"><input type="checkbox" disabled={!plazo} checked={agendar} onChange={e => setAgendar(e.target.checked)} /> Agendar la cita subsiguiente ahora a las
                <input type="time" step="300" style={{ width: 'auto' }} disabled={!plazo || !agendar} value={hora} onChange={e => setHora(e.target.value)} /></label>
            </div>
            {err && <div className="err">{err}</div>}
          </div>
        </div></div>
        <footer><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar y finalizar consulta</button></footer>
      </form>
    </Modal>
  );
}
