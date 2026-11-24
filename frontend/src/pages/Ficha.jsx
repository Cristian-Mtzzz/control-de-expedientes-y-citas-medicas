import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ESTADOS, abierta, edad, fCorta, fLarga, hoy, plazoSeg } from '../utils.js';
import Modal from '../components/Modal.jsx';
import PacienteForm from '../components/PacienteForm.jsx';
import CitaForm from '../components/CitaForm.jsx';
import AtenderForm from '../components/AtenderForm.jsx';

export function Nota({ n }) {
  return (
    <div className="nota">
      <div className="when">{fLarga(n.fecha)} · {n.medico}</div>
      <p><b>Motivo:</b> {n.motivo}</p>
      {n.examen && <p><b>Hallazgos:</b> {n.examen}</p>}
      <p><b>Diagnóstico:</b> {n.diagnostico}</p>
      {n.tratamiento && <p><b>Tratamiento:</b> {n.tratamiento}</p>}
      {n.indicaciones && <p><b>Indicaciones:</b> {n.indicaciones}</p>}
    </div>
  );
}

export function NotaView({ citaId }) {
  const [n, setN] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/citas/${citaId}/nota`).then(setN).catch(e => setErr(e.message)); }, [citaId]);
  if (err) return <p className="note">{err}</p>;
  return n ? <Nota n={n} /> : <p className="note">Cargando…</p>;
}

export default function Ficha() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const { toast } = useOutletContext();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const esMedico = usuario.rol === 'medico';

  const cargar = useCallback(() => { api('/pacientes/' + id).then(setP).catch(e => setErr(e.message)); }, [id]);
  useEffect(cargar, [cargar]);

  if (err) return <><Link to="/pacientes" className="note">← Pacientes</Link><h1>Paciente no disponible</h1><p className="note">{err}</p></>;
  if (!p) return <div className="cargando">Cargando…</div>;
  const cerrar = () => setModal(null);
  const nombre = p.nombres + ' ' + p.apellidos;

  return (
    <>
      <Link to="/pacientes" className="note">← Pacientes</Link>
      <div className="ficha-head">
        <div>
          <h1>{nombre}</h1>
          <div className="meta">
            <span>{edad(p.fecha_nac)} · {p.sexo === 'F' ? 'Femenino' : 'Masculino'}</span>
            <span className="mono">ID {p.dni || 'sin registrar'}</span>
            {p.sangre && <span>Sangre {p.sangre}</span>}
            <span>Tratante: {p.medico || '—'}</span>
          </div>
        </div>
        <div className="row">
          {p.alergias && <span className="alergia">Alergias: {p.alergias}</span>}
          <button className="btn" onClick={() => setModal({ tipo: 'editar' })}>Editar datos</button>
          <button className="btn primary" onClick={() => setModal({ tipo: 'cita', pre: { paciente_id: p.id, medico_id: esMedico ? usuario.id : p.medico_id } })}>Nueva cita</button>
        </div>
      </div>

      <div className="grid2">
        <div className="stack">
          <div className="card"><h3>Datos de contacto</h3><dl>
            <dt>Teléfono</dt><dd className="mono">{p.telefono}</dd>
            <dt>Correo</dt><dd>{p.email || '—'}</dd>
            <dt>Dirección</dt><dd>{p.direccion || '—'}</dd>
            <dt>Nacimiento</dt><dd>{fCorta(p.fecha_nac)}</dd>
            <dt>Emergencia</dt><dd>{p.contacto_emergencia || '—'}</dd>
          </dl></div>
          <div className="card"><h3>Seguimiento</h3>
            {p.seguimientos.length ? p.seguimientos.map(s => {
              const pl = plazoSeg(s);
              return (
                <div className="seg-item" key={s.id}>
                  <div><b>{s.motivo}</b><small className="note" style={{ display: 'block' }}>{s.medico} · objetivo {fCorta(s.fecha_objetivo)}</small></div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={'pill ' + pl.cls}>{pl.txt}</span>
                    {s.estado === 'pendiente' && <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => setModal({ tipo: 'cita', pre: { titulo: 'Agendar cita subsiguiente', paciente_id: p.id, medico_id: s.medico_id, tipo: 'subsiguiente', motivo: s.motivo, seguimiento_id: s.id, fecha: s.fecha_objetivo } })}>Agendar</button></div>}
                  </div>
                </div>
              );
            }) : <p className="note" style={{ margin: 0 }}>Sin seguimientos abiertos.</p>}
          </div>
        </div>

        <div className="stack">
          <div className="card"><h3>Historial de citas</h3>
            <div className="tablewrap" style={{ border: 0 }}><table>
              <thead><tr><th>Fecha</th><th>Médico</th><th>Tipo</th><th>Motivo</th><th>Estado</th></tr></thead>
              <tbody>{p.citas.length ? p.citas.map(c => (
                <tr key={c.id}>
                  <td>{fCorta(c.fecha)}<small className="mono">{c.hora}</small></td>
                  <td>{c.medico}</td>
                  <td>{c.tipo === 'subsiguiente' ? <span className="chip seg">Subsiguiente</span> : <span className="chip">Primera vez</span>}</td>
                  <td>{c.motivo}</td>
                  <td><span className={'pill ' + c.estado}>{ESTADOS[c.estado]}</span>
                    {c.tiene_nota && esMedico && <> <button className="btn sm ghost" onClick={() => setModal({ tipo: 'nota', c })}>Nota</button></>}
                    {abierta(c) && esMedico && c.medico_id === usuario.id && c.fecha <= hoy() && <> <button className="btn sm primary" onClick={() => setModal({ tipo: 'atender', c: { ...c, paciente: nombre } })}>Atender</button></>}
                  </td>
                </tr>
              )) : <tr><td colSpan="5" className="empty">Sin citas registradas.</td></tr>}</tbody>
            </table></div>
          </div>
          <div className="card"><h3>Notas clínicas</h3>
            {!esMedico ? <div className="locked">Las notas clínicas solo las pueden ver los médicos.</div>
              : p.notas.length ? p.notas.map(n => <Nota key={n.id} n={n} />)
              : <p className="note" style={{ margin: 0 }}>Todavía no hay notas clínicas.</p>}
          </div>
        </div>
      </div>

      {modal?.tipo === 'editar' && <PacienteForm paciente={p} onClose={cerrar} onSaved={() => { cerrar(); toast('Datos actualizados'); cargar(); }} />}
      {modal?.tipo === 'cita' && <CitaForm pre={modal.pre} onClose={cerrar} onSaved={() => { cerrar(); toast('Cita agendada'); cargar(); }} />}
      {modal?.tipo === 'atender' && <AtenderForm cita={modal.c} onClose={cerrar} onSaved={m => { cerrar(); toast(m); cargar(); }} />}
      {modal?.tipo === 'nota' && <Modal title={'Nota clínica · ' + nombre} onClose={cerrar}><div className="body"><NotaView citaId={modal.c.id} /></div></Modal>}
    </>
  );
}
