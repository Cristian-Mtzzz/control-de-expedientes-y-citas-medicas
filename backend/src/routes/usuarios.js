import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, tx, str, num, clob } from '../db.js';
import { requireRol, ah, HttpError } from '../auth.js';

const r = Router();
const ROLES = ['admin', 'medico'];

// Lista de médicos activos (la usan todos los roles para los selectores)
r.get('/medicos', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT id, nombre, especialidad, color FROM usuarios WHERE rol = 'medico' AND activo = 1 ORDER BY nombre`
  );
  res.json(rows);
}));

r.get('/', requireRol('admin'), ah(async (req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.nombre, u.email, u.rol, u.especialidad, u.color, u.activo,
           (SELECT COUNT(*) FROM pacientes p WHERE p.medico_id = u.id) AS pacientes
    FROM usuarios u
    WHERE u.rol IN ('admin','medico')
    ORDER BY u.rol, u.nombre`);
  // En Oracle los booleanos se guardan como 0/1: el cliente espera true/false
  res.json(rows.map(u => ({ ...u, activo: u.activo === 1 })));
}));

// El detalle se carga bajo demanda para no descargar todos los logos en la lista.
r.get('/:id', requireRol('admin'), ah(async (req, res) => {
  const { rows } = await query(
    `SELECT id, nombre, email, rol, especialidad, color, activo, logo_data
     FROM usuarios WHERE id = $1 AND rol IN ('admin','medico')`,
    [num(req.params.id)]
  );
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado.');
  res.json({ ...rows[0], activo: rows[0].activo === 1 });
}));

function validar(b, nuevo) {
  if (!b.nombre?.trim()) throw new HttpError(400, 'Escribe el nombre.');
  if (!b.email?.trim()) throw new HttpError(400, 'Escribe el correo.');
  if (!ROLES.includes(b.rol)) throw new HttpError(400, 'Rol no válido.');
  if (b.rol === 'medico' && !b.especialidad?.trim()) throw new HttpError(400, 'Indica la especialidad del médico.');
  if ((nuevo || b.password) && (b.password || '').length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
}

function validarLogo(logo) {
  if (!logo) return null;
  if (typeof logo !== 'string' || logo.length > 1_400_000)
    throw new HttpError(400, 'El logo debe pesar como máximo 1 MB.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
  if (!match) throw new HttpError(400, 'Usa una imagen PNG, JPG o WebP válida.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2])
    throw new HttpError(400, 'El logo debe pesar como máximo 1 MB y ser una imagen válida.');
  const formato = match[1];
  const valido = formato === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : formato === 'jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valido) throw new HttpError(400, 'El contenido del archivo no coincide con su formato de imagen.');
  return logo;
}

r.post('/', requireRol('admin'), ah(async (req, res) => {
  const b = req.body; validar(b, true);
  const hash = await bcrypt.hash(b.password, 10);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, especialidad, color, activo, logo_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [b.nombre.trim(), b.email.trim().toLowerCase(), hash, b.rol, str(b.especialidad),
     b.color || '#2d6fa8', b.activo === false ? 0 : 1,
     b.rol === 'medico' ? clob(validarLogo(b.logo_data)) : clob(null)]
  );
  res.status(201).json({ id: rows[0].id });
}));

r.put('/:id', requireRol('admin'), ah(async (req, res) => {
  const b = req.body; validar(b, false);
  const id = Number(req.params.id);
  if (id === req.user.id && (b.rol !== 'admin' || b.activo === false))
    throw new HttpError(400, 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo.');
  const hash = b.password ? await bcrypt.hash(b.password, 10) : null;
  await tx(async db => {
    const actual = (await db.query(`SELECT rol FROM usuarios WHERE id = $1 FOR UPDATE`, [num(id)])).rows[0];
    if (!actual) throw new HttpError(404, 'Usuario no encontrado.');
    await db.query(
      `UPDATE usuarios SET nombre=$1, email=$2, rol=$3, especialidad=$4, color=$5,
       activo=$6, logo_data=$7 WHERE id=$8`,
      [b.nombre.trim(), b.email.trim().toLowerCase(), b.rol, str(b.especialidad),
       b.color || '#2d6fa8', b.activo === false ? 0 : 1,
       b.rol === 'medico' ? clob(validarLogo(b.logo_data)) : clob(null), num(id)]
    );
    if (hash) await db.query(`UPDATE usuarios SET password_hash=$1 WHERE id=$2`, [hash, num(id)]);
  });
  res.json({ ok: true });
}));

export default r;
