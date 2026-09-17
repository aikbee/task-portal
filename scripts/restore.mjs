#!/usr/bin/env node
/**
 * Restore a Task Portal database backup (a db-*.sql.gz made by scripts/backup.mjs).
 *
 *   node --env-file=.env.local scripts/restore.mjs <backup.sql.gz> [--database <name>] [--force]
 *
 * The target is DB_NAME unless --database names another one (it is created when missing, which is the safe way
 * to look inside a backup). A database that already holds tables is refused without --force, because the dump
 * drops and recreates every table it contains. Uploaded files are not part of the dump: copy them back from
 * <BACKUP_DIR>/files into UPLOAD_DIR. Everybody has to sign in again afterwards (sessions are never backed up).
 */
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import mysql from "mysql2/promise";

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--database");
const dbArg = argv.includes("--database") ? argv[argv.indexOf("--database") + 1] : null;
const FORCE = argv.includes("--force");
const database = dbArg || process.env.DB_NAME || "task_portal";
if (!file || !fs.existsSync(file)) {
  console.error("Usage: node --env-file=.env.local scripts/restore.mjs <backup.sql.gz> [--database <name>] [--force]");
  process.exit(1);
}
if (!/^[A-Za-z0-9_$-]+$/.test(database)) {
  console.error(`"${database}" is not a usable database name.`);
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  charset: "utf8mb4",
  multipleStatements: false,
});
try {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${database}\``);
  const [existing] = await conn.query("SHOW TABLES");
  if (existing.length && !FORCE) {
    console.error(`Database "${database}" already holds ${existing.length} table(s). Restoring replaces them.\nRe-run with --force to go ahead, or pass --database <new name> to restore next to it.`);
    process.exit(1);
  }
  console.log(`Restoring ${file} into "${database}"…`);
  const input = file.endsWith(".gz") ? fs.createReadStream(file).pipe(zlib.createGunzip()) : fs.createReadStream(file);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let statement = "", count = 0;
  for await (const line of lines) {
    if (!statement && (line.startsWith("--") || !line.trim())) continue;
    if (/^DELIMITER /i.test(line)) throw new Error("This dump contains stored routines or triggers; restore it with the mysql client instead: gunzip -c file | mysql <database>");
    statement += (statement ? "\n" : "") + line;
    // strings in the dump never hold a raw newline, so a line ending in ";" always ends a statement
    if (!line.trimEnd().endsWith(";")) continue;
    await conn.query(statement);
    statement = "";
    count++;
  }
  if (statement.trim()) await conn.query(statement);
  const [tables] = await conn.query("SHOW TABLES");
  let rows = 0;
  for (const t of tables) rows += Number((await conn.query(`SELECT COUNT(*) AS n FROM \`${Object.values(t)[0]}\``))[0][0].n);
  console.log(`Done: ${count} statements, ${tables.length} tables, ${rows} rows.`);
} catch (e) {
  console.error(`Restore failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await conn.end().catch(() => {});
}
