import { Router } from 'express';
import { query, num, str } from '../db.js';
import { ah, HttpError } from '../auth.js';

const r = Router();

// ?estado=pendiente|agendado|todos  — médico: solo los suyos
r.get('/', ah(async (req, res) => {
  const estado = req.query.estado && req.query.estado !== 'todos' ? req.query.estado : null;
  const medicoId = req.user.rol === 'medico' ? req.user.id : null;
  const { rows } = await query(`
    SELECT s.*, p.nombres || ' ' || p.apellidos AS paciente, p.telefono, m.nombre AS medico,
           c.fecha AS cita_fecha, c.hora AS cita_hora
    FROM seguimientos s
    JOIN pacientes p ON p.id = s.paciente_id
    JOIN usuarios m ON m.id = s.medico_id
    LEFT JOIN citas c ON c.id = s.cita_id
    WHERE ($1 IS NULL OR s.estado = $1)
      AND ($2 IS NULL OR (s.medico_id = $2 AND p.medico_id = $2))
    ORDER BY s.fecha_objetivo`, [str(estado), num(medicoId)]);
  res.json(rows);
}));

// Cerrar sin agendar (el paciente ya no necesita el control o no se le pudo contactar)
r.patch('/:id/cerrar', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, p.medico_id AS paciente_medico_id
     FROM seguimientos s JOIN pacientes p ON p.id = s.paciente_id WHERE s.id = $1`,
    [num(req.params.id)]
  );
  const s = rows[0];
  if (!s) throw new HttpError(404, 'Seguimiento no encontrado.');
  if (req.user.rol === 'medico' && (s.medico_id !== req.user.id || s.paciente_medico_id !== req.user.id))
    throw new HttpError(403, 'Este seguimiento no pertenece a uno de tus pacientes.');
  if (s.estado !== 'pendiente') throw new HttpError(400, 'Solo se cierran seguimientos pendientes.');
  await query(`UPDATE seguimientos SET estado = 'cerrado' WHERE id = $1`, [num(s.id)]);
  res.json({ ok: true });
}));

export default r;
