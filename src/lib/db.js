import mysql from "mysql2/promise";

// A single shared pool across hot reloads in development.
const globalForDb = globalThis;

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "task_portal",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true, // return DATE/TIMESTAMP as strings (no timezone shifts)
    namedPlaceholders: false,
    decimalNumbers: true,
  });
}

export const pool = globalForDb.__adminPortalPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__adminPortalPool = pool;

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
