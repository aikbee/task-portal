import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { readStatus, backupHealth } from "@/lib/backups";

export const GET = handler(async () => {
  const start = Date.now();
  const [row] = await query("SELECT VERSION() AS version, DATABASE() AS db");
  const backup = await readStatus().catch(() => null);
  return ok({
    status: "ok",
    commit: process.env.GIT_COMMIT ?? "unknown",
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    version: row.version,
    database: row.db,
    latencyMs: Date.now() - start,
    // when the last good backup was taken: lets monitoring notice a backup that stopped running
    backup: { state: backupHealth(backup), lastOkAt: backup?.lastOk?.at ?? null },
    time: new Date().toISOString(),
  });
}, { auth: false });
