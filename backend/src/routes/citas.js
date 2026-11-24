import { Router } from 'express';
import { query, tx, hoy, num, fecha } from '../db.js';
import { ah, HttpError, requireRol } from '../auth.js';
import { asegurarAcceso } from './pacientes.js';

const r = Router();

// Columnas que se envían al cliente (se omite hora_min, que es de uso interno)
const CAMPOS = `c.id, c.paciente_id, c.medico_id, c.fecha, c.hora, c.duracion, c.tipo,
                c.motivo, c.estado, c.origen_seguimiento_id, c.creado_por`;

// 'HH:MM' -> minutos desde medianoche (igual que la columna hora_min de la tabla)
const minutos = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

// Busca una cita del mismo médico que se cruce en horario
async function choque(db, medicoId, dia, hora, duracion, exceptoId = null) {
  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT c.hora, p.nombres || ' ' || p.apellidos AS paciente
      FROM citas c JOIN pacientes p ON p.id = c.paciente_id
      WHERE c.medico_id = $1 AND c.fecha = $2 AND c.estado NOT IN ('cancelada','no_asistio')
        AND c.id <> NVL($3, 0)
        AND c.hora_min < $4 + $5
        AND c.hora_min + c.duracion > $4
    ) WHERE ROWNUM = 1`,
    [num(medicoId), fecha(dia), num(exceptoId), minutos(hora), num(duracion)]);
  return rows[0];
}

async function bloquearAgenda(db, medicoId) {
  const { rows } = await db.query(
    `SELECT id FROM usuarios WHERE id = $1 AND rol = 'medico' AND activo = 1 FOR UPDATE`,
    [num(medicoId)]
  );
  if (!rows[0]) throw new HttpError(400, 'Selecciona un médico válido.');
}

async function cargarCita(db, id, user) {
  const { rows } = await db.query(
    `SELECT c.*, p.medico_id AS paciente_medico_id
     FROM citas c JOIN pacientes p ON p.id = c.paciente_id WHERE c.id = $1`,
    [num(id)]
  );
  const c = rows[0];
  if (!c) throw new HttpError(404, 'Cita no encontrada.');
  if (user.rol === 'medico' && (c.medico_id !== user.id || c.paciente_medico_id !== user.id))
    throw new HttpError(403, 'Esta cita no pertenece a uno de tus pacientes.');
  return c;
}

// Agenda de un día. Médico: solo citas de sus pacientes. Admin: todas o filtradas.
r.get('/', ah(async (req, res) => {
  const dia = req.query.fecha || hoy();
  const medicoId = req.user.rol === 'medico' ? req.user.id : (req.query.medico_id ? Number(req.query.medico_id) : null);
  const { rows } = await query(`
    SELECT ${CAMPOS}, p.nombres || ' ' || p.apellidos AS paciente, p.alergias
    FROM citas c JOIN pacientes p ON p.id = c.paciente_id
    WHERE c.fecha = $1 AND ($2 IS NULL OR (c.medico_id = $2 AND p.medico_id = $2))
    ORDER BY c.hora`, [fecha(dia), num(medicoId)]);
  res.json(rows);
}));

r.post('/', ah(async (req, res) => {
  const b = req.body;
  const medicoId = req.user.rol === 'medico' ? req.user.id : Number(b.medico_id);
  const duracion = Number(b.duracion) || 30;
  if (!b.paciente_id) throw new HttpError(400, 'Selecciona el paciente.');
  if (!medicoId) throw new HttpError(400, 'Selecciona el médico.');
  if (!b.fecha || !b.hora) throw new HttpError(400, 'Indica fecha y hora.');
  if (b.fecha < hoy()) throw new HttpError(400, 'La fecha ya pasó. Elige hoy o una fecha futura.');
  if (!b.motivo?.trim()) throw new HttpError(400, 'Escribe el motivo de la cita.');
  if (!['primera', 'subsiguiente'].includes(b.tipo)) throw new HttpError(400, 'Tipo de cita no válido.');

  const id = await tx(async db => {
    const paciente = await asegurarAcceso(req.user, b.paciente_id, db);
    if (Number(paciente.medico_id) !== medicoId)
      throw new HttpError(400, 'La cita debe asignarse al médico tratante del paciente.');
    await bloquearAgenda(db, medicoId);
    const ch = await choque(db, medicoId, b.fecha, b.hora, duracion);
    if (ch) throw new HttpError(409, `El médico ya tiene cita a las ${ch.hora} con ${ch.paciente}. Elige otra hora.`);
    let segId = b.origen_seguimiento_id || null;
    if (segId) {
      const s = (await db.query(`SELECT * FROM seguimientos WHERE id = $1 FOR UPDATE`, [num(segId)])).rows[0];
      if (!s || s.estado !== 'pendiente' || s.paciente_id !== Number(b.paciente_id) || s.medico_id !== medicoId)
        throw new HttpError(400, 'El seguimiento elegido ya no está pendiente para este paciente y médico.');
    }
    const { rows } = await db.query(`
      INSERT INTO citas (paciente_id, medico_id, fecha, hora, duracion, tipo, motivo, origen_seguimiento_id, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [num(b.paciente_id), num(medicoId), fecha(b.fecha), b.hora, num(duracion), b.tipo,
       b.motivo.trim(), num(segId), num(req.user.id)]);
    if (segId) await db.query(`UPDATE seguimientos SET estado = 'agendado', cita_id = $1 WHERE id = $2`, [num(rows[0].id), num(segId)]);
    return rows[0].id;
  });
  res.status(201).json({ id });
}));

// Cambiar estado: confirmada, cancelada o no_asistio
r.patch('/:id/estado', ah(async (req, res) => {
  const { estado } = req.body;
  await tx(async db => {
    const c = await cargarCita(db, req.params.id, req.user);
    const abierta = ['programada', 'confirmada'].includes(c.estado);
    if (estado === 'confirmada' && c.estado !== 'programada') throw new HttpError(400, 'Solo se confirman citas por confirmar.');
    if (['cancelada', 'no_asistio'].includes(estado) && !abierta) throw new HttpError(400, 'La cita ya no está abierta.');
    if (estado === 'no_asistio' && c.fecha > hoy()) throw new HttpError(400, 'No puedes marcar inasistencia de una cita futura.');
    if (!['confirmada', 'cancelada', 'no_asistio'].includes(estado)) throw new HttpError(400, 'Estado no válido.');
    await db.query(`UPDATE citas SET estado = $1 WHERE id = $2`, [estado, num(c.id)]);
    // Si la cita venía de un seguimiento, este vuelve a quedar pendiente
    if (estado !== 'confirmada')
      await db.query(`UPDATE seguimientos SET estado = 'pendiente', cita_id = NULL WHERE cita_id = $1 AND estado = 'agendado'`, [num(c.id)]);
  });
  res.json({ ok: true });
}));

// Atender: guarda la nota clínica, cierra la cita y opcionalmente crea el seguimiento (y su cita)
r.post('/:id/atender', requireRol('medico'), ah(async (req, res) => {
  const b = req.body;
  if (!b.diagnostico?.trim()) throw new HttpError(400, 'Escribe el diagnóstico para cerrar la consulta.');
  const resultado = await tx(async db => {
    const c = await cargarCita(db, req.params.id, req.user);
    if (!['programada', 'confirmada'].includes(c.estado)) throw new HttpError(400, 'Esta cita ya no está abierta.');
    if (c.fecha > hoy()) throw new HttpError(400, 'No puedes atender una cita futura.');

    await db.query(`
      INSERT INTO notas (cita_id, paciente_id, medico_id, fecha, motivo, examen, diagnostico, tratamiento, indicaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [num(c.id), num(c.paciente_id), num(c.medico_id), fecha(c.fecha), b.motivo || c.motivo,
       b.examen || null, b.diagnostico.trim(), b.tratamiento || null, b.indicaciones || null]);
    await db.query(`UPDATE citas SET estado = 'atendida' WHERE id = $1`, [num(c.id)]);
    if (c.origen_seguimiento_id)
      await db.query(`UPDATE seguimientos SET estado = 'cumplido' WHERE id = $1`, [num(c.origen_seguimiento_id)]);

    const s = b.seguimiento;
    if (!s) return { seguimiento: null };
    if (!s.fecha_objetivo || s.fecha_objetivo <= hoy()) throw new HttpError(400, 'La fecha del control debe ser posterior a hoy.');
    const motivo = s.motivo?.trim() || `Control: ${b.diagnostico.trim()}`;
    const seg = (await db.query(`
      INSERT INTO seguimientos (paciente_id, medico_id, cita_origen_id, fecha_objetivo, motivo)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [num(c.paciente_id), num(c.medico_id), num(c.id), fecha(s.fecha_objetivo), motivo])).rows[0];
    if (!s.agendar) return { seguimiento: seg.id, agendado: false };

    const hora = s.hora || c.hora;
    await bloquearAgenda(db, c.medico_id);
    const ch = await choque(db, c.medico_id, s.fecha_objetivo, hora, 30);
    if (ch) throw new HttpError(409, `Ya tienes cita ese día a las ${ch.hora}. Cambia la hora o desmarca "Agendar ahora".`);
    const nc = (await db.query(`
      INSERT INTO citas (paciente_id, medico_id, fecha, hora, duracion, tipo, motivo, origen_seguimiento_id, creado_por)
      VALUES ($1,$2,$3,$4,30,'subsiguiente',$5,$6,$7) RETURNING id`,
      [num(c.paciente_id), num(c.medico_id), fecha(s.fecha_objetivo), hora, motivo, num(seg.id), num(req.user.id)])).rows[0];
    await db.query(`UPDATE seguimientos SET estado = 'agendado', cita_id = $1 WHERE id = $2`, [num(nc.id), num(seg.id)]);
    return { seguimiento: seg.id, agendado: true, cita: nc.id };
  });
  res.json(resultado);
}));

r.get('/:id/nota', requireRol('medico'), ah(async (req, res) => {
  const { rows } = await query(`
    SELECT n.*, m.nombre AS medico FROM notas n JOIN usuarios m ON m.id = n.medico_id WHERE n.cita_id = $1`,
    [num(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Esta cita no tiene nota registrada.');
  await asegurarAcceso(req.user, rows[0].paciente_id);
  res.json(rows[0]);
}));

export default r;
