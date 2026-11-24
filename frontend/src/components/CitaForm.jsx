import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fCorta, hoy } from '../utils.js';

// pre: { titulo, paciente_id, medico_id, fecha, hora, duracion, tipo, motivo, seguimiento_id }
export default function CitaForm({ pre = {}, onClose, onSaved }) {
  const { usuario } = useAuth();
  const esMedico = usuario.rol === 'medico';
  const [medicos, setMedicos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [busquedaIdentidad, setBusquedaIdentidad] = useState('');
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [segs, setSegs] = useState([]);
  const [err, setErr] = useState('');
  const solicitudBusqueda = useRef(0);
  const [f, setF] = useState({
    paciente_id: pre.paciente_id || '', medico_id: pre.medico_id || (esMedico ? usuario.id : ''),
    fecha: pre.fecha && pre.fecha >= hoy() ? pre.fecha : hoy(), hora: pre.hora || '08:00', duracion: pre.duracion || 30,
    tipo: pre.tipo || 'primera', motivo: pre.motivo || '', origen_seguimiento_id: pre.seguimiento_id || '',
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    api('/usuarios/medicos').then(ms => { setMedicos(ms); if (!f.medico_id && ms[0]) set('medico_id', ms[0].id); });
    api('/seguimientos?estado=pendiente').then(rows => {
      setSegs(rows);
      // Si se abrió desde la ficha de un paciente, sugerir su seguimiento pendiente
      if (pre.paciente_id && !pre.seguimiento_id) {
        setF(x => {
          const s = rows.find(r => r.paciente_id === Number(x.paciente_id) && r.medico_id === Number(x.medico_id));
          return s ? { ...x, origen_seguimiento_id: s.id, tipo: 'subsiguiente', motivo: x.motivo || s.motivo } : x;
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pre.paciente_id || (!esMedico && !f.medico_id)) return undefined;
    const params = new URLSearchParams({ paciente_id: String(pre.paciente_id) });
    if (!esMedico) params.set('medico_id', String(f.medico_id));
    let activa = true;
    api('/pacientes/buscar-cita?' + params)
      .then(rows => {
        if (!activa) return;
        if (!rows.length) {
          setErrorBusqueda('El paciente no pertenece al médico seleccionado o no está disponible.');
          return;
        }
        setPacienteSeleccionado(rows[0]);
      })
      .catch(e => { if (activa) setErrorBusqueda(e.message); });
    return () => { activa = false; };
  }, [pre.paciente_id, esMedico, f.medico_id]);

  useEffect(() => {
    const identidad = busquedaIdentidad.replace(/\D/g, '');
    const solicitud = ++solicitudBusqueda.current;
    setPacientes([]);
    setErrorBusqueda('');
    if (identidad.length < 4) {
      setBuscandoPaciente(false);
      return undefined;
    }

    if (!esMedico && !f.medico_id) {
      setBuscandoPaciente(false);
      return undefined;
    }

    setBuscandoPaciente(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ identidad });
      if (!esMedico) params.set('medico_id', String(f.medico_id));
      api('/pacientes/buscar-cita?' + params)
        .then(rows => {
          if (solicitud === solicitudBusqueda.current) setPacientes(rows);
        })
        .catch(e => {
          if (solicitud === solicitudBusqueda.current) setErrorBusqueda(e.message);
        })
        .finally(() => {
          if (solicitud === solicitudBusqueda.current) setBuscandoPaciente(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      if (solicitud === solicitudBusqueda.current) solicitudBusqueda.current++;
    };
  }, [busquedaIdentidad, esMedico, f.medico_id]);

  const segsPac = segs.filter(s => s.paciente_id === Number(f.paciente_id) && s.medico_id === Number(f.medico_id));

  // Al cambiar paciente o médico, sugerir vínculo con seguimiento pendiente y tipo de cita
  function elegir(k, v, listaPacientes = pacientes) {
    const n = { ...f, [k]: v };
    if (k === 'paciente_id' && !esMedico) {
      const p = listaPacientes.find(x => x.id === Number(v));
      if (p?.medico_id && medicos.some(m => m.id === p.medico_id)) n.medico_id = p.medico_id;
    }
    if (k === 'medico_id' && !esMedico) {
      const p = listaPacientes.find(x => x.id === Number(n.paciente_id))
        || (pacienteSeleccionado?.id === Number(n.paciente_id) ? pacienteSeleccionado : null);
      if (p && Number(p.medico_id) !== Number(v)) n.paciente_id = '';
    }
    if (k === 'medico_id' && !n.paciente_id) setPacienteSeleccionado(null);
    const s = segs.find(x => x.paciente_id === Number(n.paciente_id) && x.medico_id === Number(n.medico_id));
    n.origen_seguimiento_id = s ? s.id : '';
    if (s) { n.tipo = 'subsiguiente'; if (!n.motivo) n.motivo = s.motivo; }
    setF(n);
  }

  async function guardar(e) {
    e.preventDefault(); setErr('');
    if (!f.paciente_id) { setErr('Busca y selecciona un paciente por su identidad.'); return; }
    try {
      await api('/citas', { method: 'POST', body: { ...f, origen_seguimiento_id: f.origen_seguimiento_id || null } });
      onSaved(f.fecha);
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <Modal title={pre.titulo || 'Nueva cita'} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="body">
          <div className="f">
            <label htmlFor="ci-pac">Paciente</label>
            {pacienteSeleccionado
              ? <div className="patient-selected">
                <span><b>{pacienteSeleccionado.apellidos}, {pacienteSeleccionado.nombres}</b><small>{pacienteSeleccionado.dni || 'Sin identidad registrada'}</small></span>
                <button type="button" className="patient-change" onClick={() => {
                  elegir('paciente_id', '');
                  setPacienteSeleccionado(null);
                }}>Cambiar</button>
              </div>
              : <>
                <input id="ci-pac" type="search" inputMode="numeric" autoComplete="off"
                  placeholder="Escribe el número de identidad"
                  value={busquedaIdentidad} onChange={e => setBusquedaIdentidad(e.target.value)} />
                <span className="note">Escribe al menos 4 dígitos para buscar entre los pacientes existentes de este médico.</span>
                {buscandoPaciente && <span className="note" role="status">Buscando paciente…</span>}
                {errorBusqueda && <span className="err" role="alert">{errorBusqueda}</span>}
                {pacientes.length > 0 && <ul className="patient-results" aria-label="Pacientes encontrados">
                  {pacientes.map(p => <li key={p.id}>
                    <button type="button" onClick={() => {
                      elegir('paciente_id', String(p.id), pacientes);
                      setPacienteSeleccionado(p);
                      setBusquedaIdentidad('');
                    }}>
                      <b>{p.apellidos}, {p.nombres}</b><small>{p.dni}</small>
                    </button>
                  </li>)}
                </ul>}
                {!buscandoPaciente && busquedaIdentidad.replace(/\D/g, '').length >= 4
                  && !errorBusqueda && pacientes.length === 0
                  && <span className="note">No se encontraron pacientes con esa identidad.</span>}
                {pacientes.length === 20 && <span className="note">Se muestran hasta 20 resultados. Agrega más dígitos para afinar la búsqueda.</span>}
              </>}
          </div>
          <div className="f">
            <label htmlFor="ci-med">Médico</label>
            <select id="ci-med" value={f.medico_id} disabled={esMedico} onChange={e => elegir('medico_id', e.target.value)}>
              {medicos.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.especialidad}</option>)}
            </select>
            {!esMedico && <span className="note">Solo se pueden agendar citas con el médico propietario del paciente.</span>}
          </div>
          <div className="f3">
            <div className="f"><label htmlFor="ci-fecha">Fecha</label><input id="ci-fecha" type="date" min={hoy()} value={f.fecha} onChange={e => set('fecha', e.target.value)} /></div>
            <div className="f"><label htmlFor="ci-hora">Hora</label><input id="ci-hora" type="time" step="300" value={f.hora} onChange={e => set('hora', e.target.value)} /></div>
            <div className="f"><label htmlFor="ci-dur">Duración</label>
              <select id="ci-dur" value={f.duracion} onChange={e => set('duracion', Number(e.target.value))}>{[15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} min</option>)}</select></div>
          </div>
          <div className="f2">
            <div className="f"><label htmlFor="ci-tipo">Tipo de cita</label>
              <select id="ci-tipo" value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="primera">Primera vez</option><option value="subsiguiente">Subsiguiente</option></select></div>
            <div className="f"><label htmlFor="ci-seg">Vincular a seguimiento</label>
              <select id="ci-seg" value={f.origen_seguimiento_id} onChange={e => { set('origen_seguimiento_id', e.target.value); if (e.target.value) set('tipo', 'subsiguiente'); }}>
                <option value="">{segsPac.length ? 'No vincular' : 'Sin seguimientos pendientes'}</option>
                {segsPac.map(s => <option key={s.id} value={s.id}>{s.motivo} · {fCorta(s.fecha_objetivo)}</option>)}
              </select></div>
          </div>
          <div className="f"><label htmlFor="ci-mot">Motivo</label><input id="ci-mot" value={f.motivo} placeholder="Ej. Control de presión arterial" onChange={e => set('motivo', e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
        </div>
        <footer><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar cita</button></footer>
      </form>
    </Modal>
  );
}
