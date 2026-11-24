// Crea las tablas y carga datos de ejemplo. ¡Borra todo lo que haya en la base!
// Uso: npm run db:init
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { query, cerrarPool, hoy, fecha, num } from '../src/db.js';

const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const HOY = hoy();
const d = n => { const [y, m, dd] = HOY.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// Columnas DATE: hay que enviarlas como fecha de Oracle, no como texto
const COLS_FECHA = new Set(['fecha', 'fecha_nac', 'fecha_objetivo']);

// node-oracledb ejecuta una sentencia por llamada, así que hay que partir el
// archivo: los bloques PL/SQL terminan con "/" en una línea aparte (igual que
// en SQL Developer) y las demás sentencias se separan con ";".
const INICIO_PLSQL = /(^|\n)[ \t]*(BEGIN|DECLARE|CREATE[ \t]+(OR[ \t]+REPLACE[ \t]+)?(TRIGGER|PROCEDURE|FUNCTION|PACKAGE))\b/i;
const partir = t => t.split(';').map(s => s.trim()).filter(Boolean);

function sentencias(texto) {
  return texto.split(/^[ \t]*\/[ \t]*$/m).flatMap(trozo => {
    const limpio = trozo.replace(/--[^\n]*/g, '').trim();
    if (!limpio) return [];
    // Un bloque PL/SQL lleva ";" por dentro, así que no se puede partir por ";".
    // El bloque empieza en su palabra clave y ocupa el resto del trozo (hasta el "/").
    const i = limpio.search(INICIO_PLSQL);
    if (i < 0) return partir(limpio);
    return [...partir(limpio.slice(0, i)), limpio.slice(i).trim()];
  });
}

async function ins(tabla, obj) {
  const cols = Object.keys(obj);
  const vals = cols.map(c => (COLS_FECHA.has(c) ? fecha(obj[c]) : obj[c]));
  const { rows } = await query(
    `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
    vals);
  return rows[0].id;
}

async function main() {
  console.log('Creando tablas…');
  for (const s of sentencias(sql)) await query(s);

  const hash = await bcrypt.hash('clave1234', 10);
  const hashAdmin = await bcrypt.hash('admin', 10);
  const U = {};
  for (const [k, u] of Object.entries({
    admin: { nombre: 'Rosa Aguilar', email: 'admin', rol: 'admin', color: '#5a6966' },
    mejia: { nombre: 'Dra. Ana Lucía Mejía', email: 'amejia@consultorio.hn', rol: 'medico', especialidad: 'Medicina interna', color: '#2d6fa8' },
    zelaya: { nombre: 'Dr. Carlos Zelaya', email: 'czelaya@consultorio.hn', rol: 'medico', especialidad: 'Pediatría', color: '#b06a12' },
    rivera: { nombre: 'Dra. Gabriela Rivera', email: 'grivera@consultorio.hn', rol: 'medico', especialidad: 'Ginecología', color: '#8a3f86' },
  })) U[k] = await ins('usuarios', { ...u, password_hash: k === 'admin' ? hashAdmin : hash });

  const P = {};
  const pac = (k, nombres, apellidos, dni, fecha_nac, sexo, telefono, medico, extra = {}) =>
    ins('pacientes', { nombres, apellidos, dni, fecha_nac, sexo, telefono, medico_id: U[medico], direccion: 'Tegucigalpa, M.D.C.', ...extra }).then(id => (P[k] = id));
  await pac('jose', 'José Antonio', 'Hernández Cruz', '0801-1968-04512', '1968-03-14', 'M', '9876-1122', 'mejia', { alergias: 'Penicilina', sangre: 'O+', contacto_emergencia: 'Marta Cruz (esposa) 9988-1100' });
  await pac('maria', 'María Fernanda', 'López Sabillón', '0801-1985-11873', '1985-07-22', 'F', '3345-8890', 'rivera', { sangre: 'A+' });
  await pac('luis', 'Luis Alberto', 'Castillo Mejía', '0801-2019-00321', '2019-02-10', 'M', '9712-4455', 'zelaya', { contacto_emergencia: 'Diana Mejía (madre) 9712-4455' });
  await pac('sofia', 'Sofía', 'Martínez Reyes', '0801-2016-07790', '2016-11-03', 'F', '8890-3321', 'zelaya', { sangre: 'B+' });
  await pac('carmen', 'Carmen Elena', 'Banegas Ortiz', '0801-1952-00987', '1952-01-30', 'F', '2232-5566', 'mejia', { alergias: 'Sulfas', sangre: 'O+' });
  await pac('daniela', 'Daniela', 'Paz Ordóñez', '0801-1993-14502', '1993-09-18', 'F', '9001-7788', 'rivera');
  await pac('roberto', 'Roberto Carlos', 'Funes Valle', '0801-1979-03345', '1979-05-05', 'M', '3150-6677', 'mejia', { sangre: 'A-' });
  await pac('ana', 'Ana Gabriela', 'Sierra Lagos', '0801-1990-09911', '1990-12-12', 'F', '9789-0012', 'rivera');
  await pac('mateo', 'Mateo Andrés', 'Cruz Rivera', '0801-2021-01234', '2021-06-25', 'M', '8812-3434', 'zelaya', { contacto_emergencia: 'Lucía Rivera (madre) 8812-3434' });
  await pac('jorge', 'Jorge Luis', 'Matamoros Pineda', '0801-1960-02200', '1960-08-08', 'M', '2237-9090', 'mejia');

  const cita = (p, m, fechaCita, hora, tipo, motivo, estado) =>
    ins('citas', { paciente_id: P[p], medico_id: U[m], fecha: fechaCita, hora, tipo, motivo, estado, creado_por: U[m] });
  const nota = (citaId, p, m, fechaNota, motivo, examen, diagnostico, tratamiento, indicaciones) =>
    ins('notas', { cita_id: citaId, paciente_id: P[p], medico_id: U[m], fecha: fechaNota, motivo, examen, diagnostico, tratamiento, indicaciones });
  const seg = (p, m, origen, fecha_objetivo, motivo) =>
    ins('seguimientos', { paciente_id: P[p], medico_id: U[m], cita_origen_id: origen, fecha_objetivo, motivo });
  const vincular = async (segId, citaId) => {
    await query(`UPDATE seguimientos SET estado='agendado', cita_id=$1 WHERE id=$2`, [num(citaId), num(segId)]);
    await query(`UPDATE citas SET origen_seguimiento_id=$1 WHERE id=$2`, [num(segId), num(citaId)]);
  };

  // Historial atendido con notas y seguimientos
  let c = await cita('jose', 'mejia', d(-28), '09:00', 'primera', 'Control de presión arterial', 'atendida');
  await nota(c, 'jose', 'mejia', d(-28), 'Control de presión arterial', 'PA 152/96 mmHg, FC 78. Sin edema.', 'Hipertensión arterial esencial (I10)', 'Losartán 50 mg cada 24 h', 'Dieta baja en sodio. Registrar PA en casa.');
  let s = await seg('jose', 'mejia', c, HOY, 'Revisar registro de presión arterial');
  await vincular(s, await cita('jose', 'mejia', HOY, '09:00', 'subsiguiente', 'Control de hipertensión', 'confirmada'));

  c = await cita('carmen', 'mejia', d(-45), '10:00', 'primera', 'Sed excesiva y cansancio', 'atendida');
  await nota(c, 'carmen', 'mejia', d(-45), 'Sed excesiva y cansancio', 'Glucosa capilar 248 mg/dL. IMC 29.', 'Diabetes mellitus tipo 2 (E11.9)', 'Metformina 850 mg cada 12 h', 'HbA1c antes del control. Caminar 30 min diarios.');
  await seg('carmen', 'mejia', c, d(-15), 'Resultado de HbA1c y ajuste de dosis');

  c = await cita('luis', 'zelaya', d(-10), '08:30', 'primera', 'Fiebre y dolor de garganta', 'atendida');
  await nota(c, 'luis', 'zelaya', d(-10), 'Fiebre y dolor de garganta', 'T 38.6 °C. Amígdalas con exudado.', 'Faringoamigdalitis aguda (J03.9)', 'Amoxicilina 50 mg/kg/día por 10 días', 'Volver antes si no baja la fiebre en 48 h.');
  await seg('luis', 'zelaya', c, HOY, 'Control post antibiótico');

  c = await cita('maria', 'rivera', d(-20), '10:30', 'subsiguiente', 'Control prenatal', 'atendida');
  await nota(c, 'maria', 'rivera', d(-20), 'Control prenatal', '24 semanas. AU 23 cm, FCF 145 lpm.', 'Embarazo de 24 semanas, control prenatal (Z34.9)', 'Sulfato ferroso + ácido fólico', 'Ultrasonido morfológico.');
  s = await seg('maria', 'rivera', c, d(8), 'Control prenatal 28 semanas');
  await vincular(s, await cita('maria', 'rivera', d(8), '10:30', 'subsiguiente', 'Control prenatal', 'programada'));

  c = await cita('roberto', 'mejia', d(-60), '11:00', 'primera', 'Chequeo general', 'atendida');
  await nota(c, 'roberto', 'mejia', d(-60), 'Chequeo general', 'Colesterol total 262 mg/dL, LDL 171.', 'Dislipidemia (E78.5)', 'Atorvastatina 20 mg en la noche', 'Perfil lipídico en 3 meses.');
  await seg('roberto', 'mejia', c, d(30), 'Perfil lipídico de control');

  c = await cita('daniela', 'rivera', d(-5), '15:00', 'primera', 'Ardor al orinar', 'atendida');
  await nota(c, 'daniela', 'rivera', d(-5), 'Ardor al orinar', 'Disuria, sin fiebre. EGO con nitritos positivos.', 'Infección urinaria no complicada (N39.0)', 'Nitrofurantoína 100 mg cada 12 h por 5 días', 'Urocultivo de control.');
  await seg('daniela', 'rivera', c, d(2), 'Resultado de urocultivo');

  // Otras citas
  await cita('mateo', 'zelaya', d(-3), '09:00', 'primera', 'Fiebre y tos', 'no_asistio');
  await cita('jorge', 'mejia', d(-2), '10:00', 'primera', 'Dolor lumbar', 'cancelada');
  await cita('jorge', 'mejia', HOY, '10:00', 'primera', 'Dolor lumbar', 'programada');
  await cita('sofia', 'zelaya', HOY, '08:30', 'primera', 'Control de niño sano', 'confirmada');
  await cita('mateo', 'zelaya', HOY, '09:30', 'primera', 'Fiebre y tos (reprogramada)', 'programada');
  await cita('ana', 'rivera', HOY, '14:00', 'primera', 'Citología de control', 'programada');
  await cita('sofia', 'zelaya', d(3), '08:00', 'subsiguiente', 'Revisión de resultados', 'programada');

  console.log('Listo. Administrador: admin / admin. Usuarios médicos (contraseña: clave1234):');
  console.log('  amejia@consultorio.hn · czelaya@consultorio.hn · grivera@consultorio.hn');
  await cerrarPool();
}

main().catch(async e => { console.error(e); await cerrarPool().catch(() => {}); process.exit(1); });
