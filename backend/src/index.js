import express from 'express';
import cors from 'cors';
import { requireAuth } from './auth.js';
import { iniciarPool, cerrarPool } from './db.js';
import authRoutes from './routes/auth.js';
import usuariosRoutes from './routes/usuarios.js';
import pacientesRoutes from './routes/pacientes.js';
import citasRoutes from './routes/citas.js';
import seguimientosRoutes from './routes/seguimientos.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/salud', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', requireAuth, usuariosRoutes);
app.use('/api/pacientes', requireAuth, pacientesRoutes);
app.use('/api/citas', requireAuth, citasRoutes);
app.use('/api/seguimientos', requireAuth, seguimientosRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Manejo central de errores. Los errores de Oracle traen el número de ORA- en
// err.errorNum (por ejemplo ORA-00001 = se repitió un valor único).
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.errorNum === 1)
    return res.status(409).json({ error: 'Ya existe un registro con ese dato único (identidad o correo).' });
  if (err.errorNum === 2290 || err.errorNum === 2291 || err.errorNum === 1400 || err.errorNum === 1407)
    return res.status(400).json({ error: 'Los datos enviados no cumplen las reglas de la base de datos.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const port = process.env.PORT || 4000;

try {
  await iniciarPool();
} catch (e) {
  console.error('\nNo se pudo conectar a Oracle Database.');
  console.error(`Detalle: ${e.message.split('\n')[0]}`);
  console.error('\nRevisa que el servicio OracleServiceXE esté iniciado y que en backend/.env');
  console.error('estén bien ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT y ORACLE_CLIENT_LIB.\n');
  process.exit(1);
}

const server = app.listen(port, '127.0.0.1', () => console.log(`API lista en http://localhost:${port}`));

// Cierra el pool de Oracle al detener el servidor (Ctrl + C)
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    server.close(async () => {
      await cerrarPool().catch(() => {});
      process.exit(0);
    });
  });
}
