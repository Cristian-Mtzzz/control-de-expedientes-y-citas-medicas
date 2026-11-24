import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { firmarToken, requireAuth, ah } from '../auth.js';

const r = Router();
const CAMPOS = 'id, nombre, email, rol, especialidad, color';

async function columnasUsuario() {
  const { rows } = await query(
    `SELECT COUNT(*) AS logo_data FROM user_tab_columns
     WHERE table_name = 'USUARIOS' AND column_name = 'LOGO_DATA'`
  );
  return Number(rows[0].logo_data) > 0 ? `${CAMPOS}, logo_data` : CAMPOS;
}

r.post('/login', ah(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const campos = await columnasUsuario();
  const { rows } = await query(
    `SELECT ${campos}, password_hash FROM usuarios
     WHERE LOWER(email) = LOWER($1) AND activo = 1 AND rol IN ('admin','medico')`,
    [email.trim()]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  delete u.password_hash;
  res.json({ token: firmarToken(u), usuario: u });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  const campos = await columnasUsuario();
  const { rows } = await query(`SELECT ${campos} FROM usuarios WHERE id = $1 AND activo = 1`, [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Usuario inactivo.' });
  res.json(rows[0]);
}));

export default r;
