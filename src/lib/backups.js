import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { uploadDir } from "./uploads";
import { notifyAdmins } from "./notifications";

/**
 * App side of the backups (the work itself is `scripts/backup.mjs`, shared with deploys and the command line):
 * where they live, what is there, running one, and the once-a-day trigger used by the cron endpoint.
 */
export const BACKUP_NAME = /^db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(auto|manual|deploy)\.sql\.gz$/;
const STALE_HOURS = 36; // a daily backup that is this late counts as a problem
const DUE_HOURS = 20; // the cron runs a backup when the last good one is older than this

export function backupDir() {
  // turbopackIgnore: a runtime-configurable directory, never part of the build
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.BACKUP_DIR || path.join(uploadDir(), "..", "backups"));
}
const dbDir = () => path.join(/* turbopackIgnore: true */ backupDir(), "db");

export function parseBackupName(name) {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  return { name, at: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString(), reason: m[7] };
}
/** Absolute path of one backup, or null when the name is not a backup name (no traversal, no other files). */
export function backupPath(name) {
  if (typeof name !== "string" || !BACKUP_NAME.test(name)) return null;
  return path.join(/* turbopackIgnore: true */ dbDir(), name);
}

export async function readStatus() {
  try {
    return JSON.parse(await fs.readFile(path.join(/* turbopackIgnore: true */ backupDir(), "status.json"), "utf8"));
  } catch {
    return null;
  }
}
/** ok | stale | failed | never */
export function backupHealth(status) {
  if (!status?.lastOk?.at) return status && status.ok === false ? "failed" : "never";
  if (status.ok === false) return "failed";
  return Date.now() - new Date(status.lastOk.at).getTime() > STALE_HOURS * 3600000 ? "stale" : "ok";
}
export async function listBackups() {
  let names = [];
  try {
    names = await fs.readdir(dbDir());
  } catch {
    return [];
  }
  const rows = [];
  for (const n of names) {
    const meta = parseBackupName(n);
    if (!meta) continue;
    const st = await fs.stat(path.join(/* turbopackIgnore: true */ dbDir(), n)).catch(() => null);
    if (st) rows.push({ ...meta, bytes: st.size });
  }
  return rows.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Everything the Backups page shows. */
export async function backupOverview() {
  const [status, backups] = await Promise.all([readStatus(), listBackups()]);
  const disk = await fs.statfs(backupDir()).then((s) => ({ free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }), () => null);
  return {
    health: backupHealth(status),
    status,
    backups,
    total_bytes: backups.reduce((n, b) => n + b.bytes, 0),
    disk,
    policy: { daily: Number(process.env.BACKUP_KEEP_DAILY || 14), weekly: Number(process.env.BACKUP_KEEP_WEEKLY || 8), monthly: Number(process.env.BACKUP_KEEP_MONTHLY || 6), file_grace_days: Number(process.env.BACKUP_FILE_GRACE_DAYS || 30) },
    location: backupDir(),
  };
}

/** Run scripts/backup.mjs and resolve with its status ({ ok, file, error, busy, … }). One at a time per process. */
export function runBackup(reason = "manual") {
  const g = globalThis;
  if (g.__backupRunning) return g.__backupRunning;
  g.__backupRunning = new Promise((resolve) => {
    const script = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "backup.mjs");
    const child = spawn(process.execPath, [script, "--reason", reason, "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, UPLOAD_DIR: uploadDir(), BACKUP_DIR: backupDir() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60 * 1000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    const done = (result) => {
      clearTimeout(timer);
      g.__backupRunning = null;
      resolve(result);
    };
    child.on("error", (e) => done({ ok: false, error: `Could not start the backup: ${e.message}` }));
    child.on("close", (code) => {
      try {
        done(JSON.parse(out.trim().split("\n").pop()));
      } catch {
        done({ ok: false, error: err.trim().split("\n").pop() || `The backup exited with code ${code}.` });
      }
    });
  });
  return g.__backupRunning;
}

/** Tell the administrators once per failed day; a later success needs no message. */
async function reportFailure(result) {
  if (result.ok || result.busy) return;
  await notifyAdmins(null, {
    type: "backup_failed",
    title: "The backup failed",
    body: result.error || "See the Backups page for details.",
    href: "/backups",
    dedupeKey: `backup-failed:${new Date().toISOString().slice(0, 10)}`,
  }).catch(() => {});
}

/** Cron hook: one automatic backup a day. */
export async function ensureDailyBackup() {
  const status = await readStatus();
  const last = status?.lastOk?.at ? new Date(status.lastOk.at).getTime() : 0;
  if (Date.now() - last < DUE_HOURS * 3600000) return { ran: false, last: status?.lastOk?.at ?? null };
  const result = await runBackup("auto");
  await reportFailure(result);
  return { ran: true, ok: Boolean(result.ok), file: result.file ?? null, error: result.error ?? null };
}
export async function runManualBackup() {
  const result = await runBackup("manual");
  await reportFailure(result);
  return result;
}
