import { Router } from 'express';
import { query, tx, hoy, num, str, fecha } from '../db.js';
import { ah, HttpError } from '../auth.js';

const r = Router();

// El médico_id del paciente es la única fuente de propiedad y visibilidad.
const visible = (user, alias = 'p', param = '$1') =>
  user.rol === 'medico'
    ? `${alias}.medico_id = ${param}`
    : `(${param} IS NULL)`;

// El id del médico cuando quien consulta es médico; NULL para administración.
const soloMedico = user => num(user.rol === 'medico' ? user.id : null);

r.get('/buscar-cita', ah(async (req, res) => {
  const pacienteId = req.query.paciente_id === undefined ? null : Number(req.query.paciente_id);
  const identidad = String(req.query.identidad || '').replace(/\D/g, '');
  const medicoId = req.user.rol === 'medico' ? Number(req.user.id)
    : req.query.medico_id === undefined ? null : Number(req.query.medico_id);

  if (medicoId !== null && (!Number.isInteger(medicoId) || medicoId < 1))
    throw new HttpError(400, 'El médico indicado no es válido.');
  if (req.user.rol !== 'medico' && medicoId === null) return res.json([]);
  if (pacienteId === null && identidad.length < 4) return res.json([]);
  if (pacienteId !== null && (!Number.isInteger(pacienteId) || pacienteId < 1))
    throw new HttpError(400, 'El paciente indicado no es válido.');

  const filtro = pacienteId === null
    ? `REGEXP_REPLACE(p.dni, '[^0-9]', '') LIKE $2`
    : 'p.id = $2';
  const valor = pacienteId === null ? str(`${identidad}%`) : num(pacienteId);
  const limite = pacienteId === null ? 'WHERE ROWNUM <= 20' : '';
  const porMedico = req.user.rol === 'medico' ? '' : 'AND p.medico_id = $3';
  const params = [soloMedico(req.user), valor];
  if (req.user.rol !== 'medico') params.push(num(medicoId));
  const { rows } = await query(`
    SELECT id, nombres, apellidos, dni, medico_id FROM (
      SELECT p.id, p.nombres, p.apellidos, p.dni, p.medico_id
      FROM pacientes p
      WHERE ${visible(req.user)} AND ${filtro} ${porMedico}
      ORDER BY p.dni
    ) ${limite}`,
    params);

  res.json(rows);
}));

export async function asegurarAcceso(user, pacienteId, db = null) {
  const ejecutar = db ? (sql, params) => db.query(sql, params) : query;
  const { rows } = await ejecutar(
    `SELECT p.id, p.medico_id FROM pacientes p
     WHERE p.id = $2 AND ${visible(user)}${db ? ' FOR UPDATE' : ''}`,
    [soloMedico(user), num(pacienteId)]
  );
  if (!rows[0]) throw new HttpError(404, 'Paciente no encontrado o sin acceso.');
  return rows[0];
}

r.get('/', ah(async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  // La próxima cita se saca con MIN sobre el texto 'YYYY-MM-DD HH:MM', que
  // ordenado como texto coincide con el orden cronológico.
  const { rows } = await query(`
    SELECT * FROM (
      SELECT p.id, p.nombres, p.apellidos, p.dni, p.fecha_nac, p.sexo, p.telefono, p.alergias,
             p.medico_id, m.nombre AS medico,
             (SELECT MAX(c.fecha) FROM citas c WHERE c.paciente_id = p.id AND c.estado = 'atendida') AS ultima_consulta,
             (SELECT MIN(TO_CHAR(c.fecha,'YYYY-MM-DD') || ' ' || c.hora) FROM citas c
               WHERE c.paciente_id = p.id AND c.estado IN ('programada','confirmada') AND c.fecha >= $3) AS proxima_cita
      FROM pacientes p LEFT JOIN usuarios m ON m.id = p.medico_id
      WHERE ${visible(req.user)}
        AND LOWER(p.nombres || ' ' || p.apellidos || ' ' || p.dni || ' ' || p.telefono) LIKE LOWER($2)
      ORDER BY p.apellidos, p.nombres
    ) WHERE ROWNUM <= 200`,
    [soloMedico(req.user), str(q), fecha(hoy())]);
  res.json(rows);
}));

r.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  await asegurarAcceso(req.user, id);
  const [p, citas, segs] = await Promise.all([
    query(`SELECT p.*, m.nombre AS medico FROM pacientes p LEFT JOIN usuarios m ON m.id = p.medico_id WHERE p.id = $1`, [num(id)]),
    query(`SELECT c.id, c.paciente_id, c.medico_id, c.fecha, c.hora, c.duracion, c.tipo, c.motivo,
                  c.estado, c.origen_seguimiento_id, m.nombre AS medico,
                  CASE WHEN n.id IS NULL THEN 0 ELSE 1 END AS tiene_nota
           FROM citas c JOIN usuarios m ON m.id = c.medico_id LEFT JOIN notas n ON n.cita_id = c.id
           WHERE c.paciente_id = $1 ORDER BY c.fecha DESC, c.hora DESC`, [num(id)]),
    query(`SELECT s.*, m.nombre AS medico, c.fecha AS cita_fecha, c.hora AS cita_hora
           FROM seguimientos s JOIN usuarios m ON m.id = s.medico_id LEFT JOIN citas c ON c.id = s.cita_id
           WHERE s.paciente_id = $1 AND s.estado IN ('pendiente','agendado') ORDER BY s.fecha_objetivo`, [num(id)]),
  ]);
  // Las notas clínicas solo se envían a médicos
  let notas = null;
  if (req.user.rol === 'medico') {
    notas = (await query(
      `SELECT n.*, m.nombre AS medico FROM notas n JOIN usuarios m ON m.id = n.medico_id
       WHERE n.paciente_id = $1 ORDER BY n.fecha DESC, n.id DESC`, [num(id)])).rows;
  }
  res.json({ ...p.rows[0], citas: citas.rows, seguimientos: segs.rows, notas });
}));

function datos(b, medicoId) {
  if (!b.nombres?.trim() || !b.apellidos?.trim()) throw new HttpError(400, 'Escribe nombres y apellidos.');
  if (!b.fecha_nac) throw new HttpError(400, 'Indica la fecha de nacimiento.');
  if (b.fecha_nac > hoy()) throw new HttpError(400, 'La fecha de nacimiento no puede ser futura.');
  if (!['F', 'M'].includes(b.sexo)) throw new HttpError(400, 'Indica el sexo.');
  if (!b.telefono?.trim()) throw new HttpError(400, 'Indica un teléfono de contacto.');
  const t = v => str((v ?? '').toString().trim());
  return [t(b.nombres), t(b.apellidos), t(b.dni), fecha(b.fecha_nac), b.sexo, t(b.telefono), t(b.email),
          t(b.direccion), t(b.sangre), t(b.alergias), t(b.contacto_emergencia), num(medicoId)];
}

async function validarMedico(db, medicoId) {
  const { rows } = await db.query(
    `SELECT id FROM usuarios WHERE id = $1 AND rol = 'medico' AND activo = 1 FOR UPDATE`,
    [num(medicoId)]
  );
  if (!rows[0]) throw new HttpError(400, 'Selecciona un médico activo para asignar el paciente.');
}

r.post('/', ah(async (req, res) => {
  const medicoId = req.user.rol === 'medico' ? req.user.id : Number(req.body.medico_id);
  if (!medicoId) throw new HttpError(400, 'Selecciona el médico tratante.');
  const id = await tx(async db => {
    await validarMedico(db, medicoId);
    const { rows } = await db.query(
      `INSERT INTO pacientes (nombres, apellidos, dni, fecha_nac, sexo, telefono, email, direccion, sangre,
                              alergias, contacto_emergencia, medico_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, datos(req.body, medicoId));
    return rows[0].id;
  });
  res.status(201).json({ id });
}));

r.put('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  await tx(async db => {
    const actual = await asegurarAcceso(req.user, id, db);
    const medicoId = req.user.rol === 'medico' ? actual.medico_id : Number(req.body.medico_id);
    if (!medicoId) throw new HttpError(400, 'Selecciona el médico tratante.');
    await validarMedico(db, medicoId);
    await db.query(
      `UPDATE pacientes SET nombres=$1, apellidos=$2, dni=$3, fecha_nac=$4, sexo=$5, telefono=$6, email=$7,
         direccion=$8, sangre=$9, alergias=$10, contacto_emergencia=$11, medico_id=$12 WHERE id=$13`,
      [...datos(req.body, medicoId), num(id)]);
  });
  res.json({ ok: true });
}));

export default r;
