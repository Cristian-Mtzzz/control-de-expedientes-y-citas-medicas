import jwt from 'jsonwebtoken';
import { query, num } from './db.js';

export function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '10h' }
  );
}

// Exige un token válido en el encabezado Authorization: Bearer <token>
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  }

  if (!['admin', 'medico'].includes(claims.rol))
    return res.status(403).json({ error: 'Este rol ya no tiene acceso al sistema.' });

  query(`SELECT id, nombre, rol, activo FROM usuarios WHERE id = $1`, [num(claims.id)])
    .then(({ rows }) => {
      const usuario = rows[0];
      if (!usuario || usuario.activo !== 1)
        return res.status(401).json({ error: 'Tu cuenta está inactiva. Contacta al administrador.' });
      if (!['admin', 'medico'].includes(usuario.rol))
        return res.status(403).json({ error: 'Este rol ya no tiene acceso al sistema.' });
      req.user = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
      next();
    })
    .catch(next);
}

// Exige uno de los roles indicados
export const requireRol = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol)
    ? next()
    : res.status(403).json({ error: 'No tienes permiso para esta acción.' });

// Envuelve rutas async para que los errores lleguen al manejador central
export const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Error con código HTTP, para lanzarlo desde las rutas
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
