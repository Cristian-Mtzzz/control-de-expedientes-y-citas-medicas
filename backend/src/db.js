// Acceso a Oracle Database con node-oracledb.
//
// Este archivo es la ÚNICA parte del servidor que sabe que la base es Oracle.
// Las rutas siguen escribiendo SQL con parámetros numerados ($1, $2, …) y aquí
// se traducen a los parámetros con nombre que usa Oracle (:p1, :p2, …).
//
// Modo "thick": node-oracledb se apoya en las librerías cliente que ya trae
// instalado Oracle. Hace falta porque el modo "thin" (JavaScript puro) solo
// admite Oracle 12.1 o más reciente, y Oracle 11g XE es anterior. La carpeta de
// esas librerías se indica en ORACLE_CLIENT_LIB (ver .env.example).
import path from 'node:path';
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB]; // las notas largas llegan como texto normal

let poolPromesa = null;
let clienteIniciado = false;

// En Windows hay que poner la carpeta del cliente en el PATH del proceso:
// pasarla como libDir no basta, porque oci.dll busca ahí al lado sus propias
// librerías y no las encuentra.
function iniciarCliente() {
  const lib = process.env.ORACLE_CLIENT_LIB;
  if (clienteIniciado || !lib) return;
  process.env.PATH = lib + path.delimiter + process.env.PATH;
  oracledb.initOracleClient();
  clienteIniciado = true;
}

// Crea el pool de conexiones (una sola vez, aunque lo llamen varias partes a la vez)
export function iniciarPool() {
  if (!poolPromesa) {
    iniciarCliente();
    poolPromesa = oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT,
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
      // Formatos fijos para que las fechas no dependan de la configuración del
      // servidor. Se escribe en estilo callback (conn, etiqueta, cb) porque es
      // el que espera node-oracledb aquí: con una función async se queda colgado.
      sessionCallback: (conn, etiqueta, cb) => {
        conn.execute(
          `ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD'
                             NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD HH24:MI:SS'`,
          cb);
      },
    });
  }
  return poolPromesa;
}

export async function cerrarPool() {
  if (poolPromesa) {
    const pool = await poolPromesa;
    poolPromesa = null;
    await pool.close(5);
  }
}

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------
// Oracle necesita saber el tipo de un parámetro cuando el valor puede ser NULL.
// Estos tres ayudantes lo dicen de forma explícita; se usan en las rutas.
export const num = v =>
  ({ val: v === null || v === undefined || v === '' ? null : Number(v), type: oracledb.NUMBER });

export const str = v =>
  ({ val: v === null || v === undefined || v === '' ? null : String(v), type: oracledb.STRING });

export const clob = v =>
  ({ val: v === null || v === undefined || v === '' ? null : String(v), type: oracledb.CLOB });

// Recibe 'YYYY-MM-DD' y lo manda como DATE de Oracle (a las 00:00 locales)
export const fecha = v => {
  const t = v ? String(v).slice(0, 10) : null;
  return { val: t ? new Date(`${t}T00:00:00`) : null, type: oracledb.DB_TYPE_DATE };
};

const esParametro = v => v !== null && typeof v === 'object' && !(v instanceof Date) && 'val' in v;

const sustituir = sql => sql.replace(/\$(\d+)/g, (_, n) => ':p' + n);

function armar(params = []) {
  const binds = {};
  params.forEach((v, i) => {
    binds['p' + (i + 1)] = esParametro(v) ? v : { val: v === undefined ? null : v };
  });
  return binds;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
const z = n => String(n).padStart(2, '0');
const aTexto = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;

// Oracle devuelve los nombres de columna en MAYÚSCULAS: los pasamos a minúsculas
// y convertimos las columnas DATE a 'YYYY-MM-DD' (que es lo que espera el cliente).
function filas(rows, metaData) {
  if (!rows || !metaData) return [];
  return rows.map(fila => {
    const o = {};
    for (const col of metaData) {
      const v = fila[col.name];
      o[col.name.toLowerCase()] =
        col.dbType === oracledb.DB_TYPE_DATE && v instanceof Date ? aTexto(v) : v;
    }
    return o;
  });
}

// Oracle no tiene "RETURNING id" a secas: necesita un parámetro de salida.
// Lo agregamos aquí para que las rutas puedan escribirlo igual que en PostgreSQL.
const PIDE_ID = /\breturning\s+id\s*$/i;

// Un bloque PL/SQL necesita su ";" final; una sentencia SQL suelta, en cambio,
// falla si lo lleva (ORA-00911).
const ES_PLSQL = /^(begin|declare|create\s+(or\s+replace\s+)?(trigger|procedure|function|package|type))/i;

async function ejecutar(conn, sql, params, autoCommit) {
  const binds = armar(params);
  let texto = sustituir(sql).trim();
  if (!ES_PLSQL.test(texto)) texto = texto.replace(/;$/, '').trimEnd();
  if (PIDE_ID.test(texto)) {
    texto += ' INTO :idSalida';
    binds.idSalida = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
  }
  const r = await conn.execute(texto, binds, { autoCommit });
  if (binds.idSalida) return { rows: [{ id: r.outBinds.idSalida[0] }], rowsAffected: r.rowsAffected };
  return { rows: filas(r.rows, r.metaData), rowsAffected: r.rowsAffected };
}

// Una consulta suelta (se confirma sola)
export async function query(sql, params) {
  const pool = await iniciarPool();
  const conn = await pool.getConnection();
  try {
    return await ejecutar(conn, sql, params, true);
  } finally {
    await conn.close();
  }
}

// Ejecuta fn dentro de una transacción; si algo falla, se revierte todo
export async function tx(fn) {
  const pool = await iniciarPool();
  const conn = await pool.getConnection();
  const db = { query: (sql, params) => ejecutar(conn, sql, params, false) };
  try {
    const resultado = await fn(db);
    await conn.commit();
    return resultado;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.close();
  }
}

// Fecha local de hoy en formato YYYY-MM-DD (usa TZ del .env)
export function hoy() {
  return aTexto(new Date());
}
