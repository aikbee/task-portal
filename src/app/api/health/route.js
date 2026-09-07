import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

export const GET = handler(async () => {
  const start = Date.now();
  const [row] = await query("SELECT VERSION() AS version, DATABASE() AS db");
  return ok({ status: "ok", version: row.version, database: row.db, latencyMs: Date.now() - start, time: new Date().toISOString() });
}, { auth: false });
