import bcrypt from 'bcryptjs';
import { tx, cerrarPool, num } from '../src/db.js';

async function main() {
  try {
    const hash = await bcrypt.hash('admin', 10);
    await tx(async db => {
      const { rows } = await db.query(
        `SELECT id, rol FROM usuarios WHERE LOWER(email) = LOWER($1) FOR UPDATE`,
        ['admin']
      );
      if (rows[0]) {
        if (rows[0].rol !== 'admin')
          throw new Error('El usuario "admin" ya existe y no tiene el rol de administrador.');
        await db.query(
          `UPDATE usuarios SET password_hash = $1, activo = 1 WHERE id = $2`,
          [hash, num(rows[0].id)]
        );
        console.log('Cuenta de administrador "admin" actualizada y activada.');
        return;
      }

      await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, color, activo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['Administrador', 'admin', hash, 'admin', '#5a6966', 1]
      );
      console.log('Cuenta de administrador creada: admin / admin.');
    });
  } finally {
    await cerrarPool();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
