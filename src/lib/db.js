import mysql from "mysql2/promise";

// A single shared pool across hot reloads in development.
const globalForDb = globalThis;

function createPool() {
  const p = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "task_portal",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // DATE columns (due dates etc.) stay plain "YYYY-MM-DD" strings; TIMESTAMP/DATETIME columns become
    // JS Dates read in UTC (see the SET time_zone below), so JSON carries ISO instants ("...Z") and every
    // browser shows them in its own local time no matter which time zone the server runs in.
    dateStrings: ["DATE"],
    timezone: "Z",
    namedPlaceholders: false,
    decimalNumbers: true,
  });
  // every pooled connection reads and writes TIMESTAMPs in UTC, independent of the MySQL server's zone
  p.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
  return p;
}

// keyed by a config version so a changed pool config takes effect on the next hot reload, not the next restart
const POOL_KEY = "__taskPortalPool_v2";
export const pool = globalForDb[POOL_KEY] ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb[POOL_KEY] = pool;

/** Run a query and return rows. */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run a query and return the first row (or null). */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** Run a query and return the result header (insertId, affectedRows). */
export async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Run a callback inside a transaction. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
