#!/usr/bin/env node
/**
 * Task Portal backup.
 *
 *   node --env-file=.env.local scripts/backup.mjs [--reason auto|manual|deploy] [--engine auto|mysqldump|node] [--json]
 *
 * What it does, in order:
 *   1. Dumps the database to <BACKUP_DIR>/db/db-YYYYMMDD-HHMMSS-<reason>.sql.gz. It uses `mysqldump` when the
 *      tool is installed and falls back to a built-in dumper (mysql2) when it is not, or when it fails.
 *      Login sessions are never included: the table is recreated empty on restore, so a backup file cannot be
 *      used to take over somebody's session.
 *   2. Reads the archive back (gunzip) and checks it is complete before it counts as a backup.
 *   3. Mirrors the upload directory into <BACKUP_DIR>/files with hard links. Stored files are never rewritten,
 *      so a link costs no disk space, and a file the app deletes stays restorable for BACKUP_FILE_GRACE_DAYS.
 *      When links are not possible (another filesystem) files are copied, up to BACKUP_FILES_COPY_MAX_MB.
 *   4. Rotates dumps: everything from the last 48 hours, then the newest per day / ISO week / month.
 *   5. Writes <BACKUP_DIR>/status.json, which the app reads for the Backups page and /api/health.
 *
 * Backups live on the same server as the app. They protect against mistakes, bad migrations and bugs, not
 * against losing the server: download a copy from the Backups page (or copy BACKUP_DIR elsewhere) regularly.
 *
 * Exit codes: 0 done, 1 failed, 2 another backup is running.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
const REASON = ["auto", "manual", "deploy"].includes(arg("reason")) ? arg("reason") : "manual";
const ENGINE = ["auto", "mysqldump", "node"].includes(arg("engine")) ? arg("engine") : "auto";
const JSON_OUT = argv.includes("--json");

const DB = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "task_portal",
};
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || "uploads");
const BACKUP_DIR = path.resolve(ROOT, process.env.BACKUP_DIR || path.join(UPLOAD_DIR, "..", "backups"));
const DB_DIR = path.join(BACKUP_DIR, "db");
const FILES_DIR = path.join(BACKUP_DIR, "files");
const STATUS_FILE = path.join(BACKUP_DIR, "status.json");
const INDEX_FILE = path.join(BACKUP_DIR, "files-index.json");
const LOCK_FILE = path.join(BACKUP_DIR, "lock");
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== "" && v != null ? Number(v) : d);
const KEEP = { daily: num(process.env.BACKUP_KEEP_DAILY, 14), weekly: num(process.env.BACKUP_KEEP_WEEKLY, 8), monthly: num(process.env.BACKUP_KEEP_MONTHLY, 6) };
const GRACE_DAYS = num(process.env.BACKUP_FILE_GRACE_DAYS, 30);
const COPY_MAX = num(process.env.BACKUP_FILES_COPY_MAX_MB, 2048) * 1024 * 1024;
const MIN_FREE = 200 * 1024 * 1024;
/** Tables whose rows never go into a backup (structure only). */
const SKIP_DATA = ["sessions"];
const NAME_RE = /^db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(auto|manual|deploy)\.sql\.gz$/;

const warnings = [];
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const pad = (n) => String(n).padStart(2, "0");
const stampOf = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
const dateOfName = (name) => {
  const m = NAME_RE.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
};
const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = async (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
};

/* ---------- lock ---------- */
async function takeLock() {
  const mine = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  try {
    await fsp.writeFile(LOCK_FILE, mine, { flag: "wx", mode: 0o600 });
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  const held = await readJson(LOCK_FILE, null);
  let alive = false;
  if (held?.pid) {
    try {
      process.kill(held.pid, 0);
      alive = true;
    } catch {}
  }
  const fresh = held?.at && Date.now() - new Date(held.at).getTime() < 30 * 60 * 1000;
  if (alive && fresh) return false;
  await fsp.writeFile(LOCK_FILE, mine, { mode: 0o600 }); // a stale lock from a crashed run
  return true;
}

/* ---------- database dump ---------- */
async function findBinary(name) {
  const dirs = [...(process.env.PATH || "").split(path.delimiter), "/usr/bin", "/usr/local/bin", "/usr/local/mysql/bin", "/opt/homebrew/bin", "/opt/homebrew/opt/mysql-client/bin"];
  const candidates = [process.env.MYSQLDUMP_PATH, ...dirs.filter(Boolean).map((d) => path.join(d, name))].filter(Boolean);
  for (const file of candidates) {
    try {
      await fsp.access(file, fs.constants.X_OK);
      if ((await fsp.stat(file)).isFile()) return file;
    } catch {}
  }
  return null;
}
let activeChild = null;
function run(bin, args, { into = null, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    let stderr = "", stdout = "";
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
    if (into) child.stdout.pipe(into, { end: false });
    else child.stdout.on("data", (d) => { stdout += d; });
    child.on("error", (e) => resolve({ code: -1, stderr: e.message, stdout }));
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}
async function dumpWithMysqldump(bin, gzip) {
  const help = await run(bin, ["--help"]);
  const base = ["--host", DB.host, "--port", String(DB.port), "--user", DB.user, "--single-transaction", "--quick", "--skip-lock-tables", "--no-tablespaces", "--hex-blob", "--default-character-set=utf8mb4"];
  // MySQL's mysqldump writes GTID statements that need SUPER to restore; MariaDB's has no such flag
  if (/set-gtid-purged/.test(help.stdout)) base.push("--set-gtid-purged=OFF");
  const env = { MYSQL_PWD: DB.password }; // never on the command line, where `ps` would show it
  const data = await run(bin, [...base, ...SKIP_DATA.map((t) => `--ignore-table=${DB.database}.${t}`), DB.database], { into: gzip, env });
  if (data.code !== 0) throw new Error(`mysqldump exited with ${data.code}: ${data.stderr.trim().split("\n").pop()}`);
  const bare = await run(bin, [...base, "--no-data", DB.database, ...SKIP_DATA], { into: gzip, env });
  if (bare.code !== 0) throw new Error(`mysqldump (structure of ${SKIP_DATA.join(", ")}) exited with ${bare.code}: ${bare.stderr.trim().split("\n").pop()}`);
}
async function dumpWithNode(gzip) {
  const conn = mysql.createConnection({
    ...DB,
    charset: "utf8mb4",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    typeCast: (field, next) => (field.type === "JSON" ? field.string("utf8") : next()),
  });
  const q = (sql) => new Promise((res, rej) => conn.query(sql, (e, rows) => (e ? rej(e) : res(rows))));
  const write = async (text) => { if (!gzip.write(text)) await once(gzip, "drain"); };
  try {
    await q("SET time_zone = '+00:00'");
    await q("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await q("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [{ v }] = await q("SELECT VERSION() AS v");
    await write(`-- Task Portal backup (built-in dumper)\n-- Database: ${DB.database}   Server: ${v}\n\nSET NAMES utf8mb4;\nSET TIME_ZONE='+00:00';\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n`);
    const tables = (await q("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")).map((r) => Object.values(r)[0]);
    for (const table of tables) {
      const id = mysql.escapeId(table);
      const create = (await q(`SHOW CREATE TABLE ${id}`))[0]["Create Table"];
      await write(`--\n-- Table ${id}\n--\nDROP TABLE IF EXISTS ${id};\n${create};\n\n`);
      if (SKIP_DATA.includes(table)) continue;
      // computed columns cannot be inserted into; "DEFAULT_GENERATED" (a timestamp default) is an ordinary column
      const cols = (await q(`SHOW COLUMNS FROM ${id}`)).filter((c) => !/\b(VIRTUAL|STORED) GENERATED\b/i.test(c.Extra || "")).map((c) => mysql.escapeId(c.Field));
      if (!cols.length) continue;
      const head = `INSERT INTO ${id} (${cols.join(", ")}) VALUES `;
      let batch = [], size = 0;
      const flush = async () => {
        if (!batch.length) return;
        await write(`${head}${batch.join(",")};\n`);
        batch = [];
        size = 0;
      };
      const stream = conn.query({ sql: `SELECT ${cols.join(", ")} FROM ${id}`, rowsAsArray: true }).stream({ highWaterMark: 200 });
      for await (const row of stream) {
        const tuple = `(${row.map((value) => mysql.escape(value)).join(",")})`;
        batch.push(tuple);
        size += tuple.length;
        if (batch.length >= 200 || size > 512 * 1024) await flush();
      }
      await flush();
      await write("\n");
    }
    await q("COMMIT");
    await write(`SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n\n-- Dump completed on ${new Date().toISOString()}\n`);
  } finally {
    conn.destroy();
  }
}
/** Read the archive back: a backup only counts when it unzips cleanly, holds tables and ends with the trailer. */
async function verifyDump(file) {
  let sqlBytes = 0, tables = 0, tail = "", carry = "";
  const gunzip = fs.createReadStream(file).pipe(zlib.createGunzip());
  for await (const chunk of gunzip) {
    sqlBytes += chunk.length;
    const text = carry + chunk.toString("latin1");
    const cut = text.lastIndexOf("\n");
    tables += (text.slice(0, cut + 1).match(/^CREATE TABLE /gm) || []).length; // whole lines only
    carry = text.slice(cut + 1);
    tail = (tail + chunk.toString("latin1")).slice(-400);
  }
  if (!tables) throw new Error("the dump holds no tables");
  if (!/Dump completed/.test(tail)) throw new Error("the dump is incomplete (no completion marker)");
  return { sqlBytes, tables };
}
async function dumpDatabase() {
  const name = `db-${stampOf(new Date())}-${REASON}.sql.gz`;
  const partial = path.join(DB_DIR, `${name}.partial`);
  const bin = ENGINE === "node" ? null : await findBinary("mysqldump");
  if (ENGINE === "mysqldump" && !bin) throw new Error("mysqldump was not found (set MYSQLDUMP_PATH or use --engine node)");
  const attempt = async (engine) => {
    const out = fs.createWriteStream(partial, { mode: 0o600 });
    const gzip = zlib.createGzip({ level: 6 });
    // a broken output (read-only folder, full disk) must fail the run, not hang the dumper or crash the process
    let broken = null;
    out.on("error", (e) => { broken ??= e; gzip.destroy(e); activeChild?.kill(); });
    gzip.on("error", (e) => { broken ??= e; activeChild?.kill(); });
    gzip.pipe(out);
    try {
      await once(out, "open");
      if (engine === "mysqldump") await dumpWithMysqldump(bin, gzip);
      else await dumpWithNode(gzip);
    } catch (e) {
      throw broken ?? e;
    } finally {
      gzip.end();
      await finished(out).catch(() => {});
    }
    if (broken) throw broken;
    return { engine, ...(await verifyDump(partial)) };
  };
  let result;
  try {
    result = await attempt(bin ? "mysqldump" : "node");
  } catch (e) {
    if (!bin || ENGINE === "mysqldump" || ["EACCES", "EPERM", "ENOSPC", "EROFS", "ENOENT"].includes(e.code)) {
      await fsp.rm(partial, { force: true }).catch(() => {});
      throw e.code ? new Error(`cannot write the archive: ${e.message}`) : e;
    }
    warnings.push(`mysqldump failed (${e.message}); the built-in dumper was used instead`);
    try {
      result = await attempt("node");
    } catch (e2) {
      await fsp.rm(partial, { force: true }).catch(() => {});
      throw e2;
    }
  }
  if (!bin && ENGINE === "auto") warnings.push("mysqldump is not installed; the built-in dumper was used");
  const file = path.join(DB_DIR, name);
  await fsp.rename(partial, file);
  return { name, bytes: (await fsp.stat(file)).size, ...result };
}

/* ---------- uploaded files ---------- */
async function* walk(dir, rel = "") {
  let entries = [];
  try {
    entries = await fsp.readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) yield* walk(dir, r);
    else if (e.isFile()) yield r;
  }
}
async function mirrorFiles() {
  const out = { mode: "link", total: 0, bytes: 0, added: 0, skipped: 0, retained: 0, pruned: 0 };
  const index = await readJson(INDEX_FILE, {});
  const live = new Set();
  let copied = 0;
  for await (const rel of walk(UPLOAD_DIR)) {
    live.add(rel);
    const src = path.join(UPLOAD_DIR, rel), dst = path.join(FILES_DIR, rel);
    const st = await fsp.stat(src).catch(() => null);
    if (!st) continue;
    out.total++;
    out.bytes += st.size;
    if (index[rel]) delete index[rel];
    if (await fsp.stat(dst).then((d) => d.size === st.size, () => false)) continue;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rm(dst, { force: true });
    try {
      if (out.mode === "link") await fsp.link(src, dst);
      else throw Object.assign(new Error("copy"), { code: "EXDEV" });
      out.added++;
    } catch (e) {
      if (!["EXDEV", "EPERM", "ENOTSUP", "EMLINK", "EACCES"].includes(e.code)) throw e;
      out.mode = "copy"; // the backup folder is on another filesystem: copy, within a budget
      if (copied + st.size > COPY_MAX) {
        out.skipped++;
        continue;
      }
      await fsp.copyFile(src, dst);
      copied += st.size;
      out.added++;
    }
  }
  if (out.skipped) warnings.push(`${out.skipped} uploaded file(s) were not copied: the copy budget of ${Math.round(COPY_MAX / 1048576)} MB is used up (raise BACKUP_FILES_COPY_MAX_MB or put BACKUP_DIR on the same disk as the uploads)`);
  // files the app has deleted stay restorable for a while, then go
  const now = Date.now();
  for await (const rel of walk(FILES_DIR)) {
    if (live.has(rel)) continue;
    index[rel] ??= new Date().toISOString();
    if (now - new Date(index[rel]).getTime() > GRACE_DAYS * 86400000) {
      await fsp.rm(path.join(FILES_DIR, rel), { force: true });
      delete index[rel];
      out.pruned++;
    } else out.retained++;
  }
  for (const rel of Object.keys(index)) if (live.has(rel)) delete index[rel];
  await writeJson(INDEX_FILE, index);
  return out;
}

/* ---------- rotation ---------- */
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
};
async function rotate() {
  const names = (await fsp.readdir(DB_DIR)).filter((n) => NAME_RE.test(n)).sort().reverse(); // newest first
  const now = Date.now();
  const keep = new Set();
  const buckets = { daily: new Map(), weekly: new Map(), monthly: new Map() };
  for (const n of names) {
    const d = dateOfName(n);
    if (now - d.getTime() < 48 * 3600000) keep.add(n);
    const keys = { daily: d.toISOString().slice(0, 10), weekly: isoWeek(d), monthly: d.toISOString().slice(0, 7) };
    for (const k of Object.keys(buckets)) if (!buckets[k].has(keys[k])) buckets[k].set(keys[k], n); // the newest of each bucket
  }
  for (const k of Object.keys(buckets)) [...buckets[k].values()].slice(0, KEEP[k]).forEach((n) => keep.add(n));
  if (names[0]) keep.add(names[0]);
  let removed = 0;
  for (const n of names) {
    if (keep.has(n)) continue;
    await fsp.rm(path.join(DB_DIR, n), { force: true });
    removed++;
  }
  for (const n of await fsp.readdir(DB_DIR)) {
    if (!n.endsWith(".partial")) continue;
    const st = await fsp.stat(path.join(DB_DIR, n)).catch(() => null);
    if (st && now - st.mtimeMs > 3600000) await fsp.rm(path.join(DB_DIR, n), { force: true });
  }
  return { kept: keep.size, removed };
}

/* ---------- main ---------- */
async function main() {
  const started = Date.now();
  await fsp.mkdir(DB_DIR, { recursive: true, mode: 0o700 });
  await fsp.mkdir(FILES_DIR, { recursive: true, mode: 0o700 });
  await fsp.chmod(BACKUP_DIR, 0o700).catch(() => {});
  if (!(await takeLock())) {
    say("Another backup is running.");
    if (JSON_OUT) console.log(JSON.stringify({ ok: false, busy: true, error: "Another backup is running." }));
    process.exit(2);
  }
  const previous = await readJson(STATUS_FILE, {});
  const status = { ok: false, at: new Date().toISOString(), reason: REASON, lastOk: previous.lastOk ?? null };
  try {
    const free = await fsp.statfs(BACKUP_DIR).then((s) => Number(s.bavail) * Number(s.bsize), () => null);
    if (free != null && free < MIN_FREE) throw new Error(`only ${Math.round(free / 1048576)} MB free on the backup disk`);
    if (free != null && free < 1024 * 1024 * 1024) warnings.push(`the backup disk has under 1 GB free (${Math.round(free / 1048576)} MB)`);
    say(`Backing up ${DB.database} to ${BACKUP_DIR}`);
    const dump = await dumpDatabase();
    say(`  database: ${dump.name} (${dump.tables} tables, ${(dump.bytes / 1024).toFixed(1)} KB, ${dump.engine})`);
    let files = null;
    try {
      files = await mirrorFiles();
      say(`  files: ${files.total} protected (${(files.bytes / 1048576).toFixed(1)} MB, ${files.mode}), ${files.added} new, ${files.retained} deleted but kept, ${files.pruned} pruned`);
    } catch (e) {
      warnings.push(`uploaded files were not mirrored: ${e.message}`);
    }
    const rotation = await rotate();
    Object.assign(status, { ok: true, engine: dump.engine, file: dump.name, bytes: dump.bytes, sqlBytes: dump.sqlBytes, tables: dump.tables, files, ...rotation, freeBytes: free, lastOk: { at: status.at, file: dump.name, bytes: dump.bytes } });
  } catch (e) {
    status.error = e.message;
    say(`Backup FAILED: ${e.message}`);
  }
  status.warnings = warnings;
  status.durationMs = Date.now() - started;
  await writeJson(STATUS_FILE, status).catch(() => {});
  await fsp.rm(LOCK_FILE, { force: true });
  for (const w of warnings) say(`  warning: ${w}`);
  if (JSON_OUT) console.log(JSON.stringify(status));
  else if (status.ok) say(`Done in ${(status.durationMs / 1000).toFixed(1)} s. ${status.kept} backup(s) kept, ${status.removed} rotated out.`);
  process.exit(status.ok ? 0 : 1);
}
function recordCrash(e) {
  try {
    const previous = fs.existsSync(STATUS_FILE) ? JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")) : {};
    const status = { ok: false, at: new Date().toISOString(), reason: REASON, lastOk: previous.lastOk ?? null, error: e?.message || String(e), warnings };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), { mode: 0o600 });
    if (JSON_OUT) console.log(JSON.stringify(status));
  } catch {}
  try {
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {}
  if (!JSON_OUT) console.error(e);
  process.exit(1);
}
process.on("uncaughtException", recordCrash);
main().catch(recordCrash);
