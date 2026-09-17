import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { backupPath, backupOverview } from "@/lib/backups";

async function existing(name) {
  const file = backupPath(name);
  if (!file) throw new HttpError("Not a backup name.", 400);
  const st = await fsp.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError("Backup not found.", 404);
  return { file, size: st.size };
}

/** Admin: download one database archive (gzip-compressed SQL). */
export const GET = handler(
  async (_request, params) => {
    const { file, size } = await existing(params.name);
    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      headers: { "Content-Type": "application/gzip", "Content-Length": String(size), "Content-Disposition": `attachment; filename="task-portal-${params.name}"`, "Cache-Control": "no-store" },
    });
  },
  { role: "admin" }
);

/** Admin: remove one archive by hand (rotation normally takes care of this). */
export const DELETE = handler(
  async (_request, params) => {
    const { file } = await existing(params.name);
    await fsp.rm(file, { force: true });
    return ok(await backupOverview());
  },
  { role: "admin" }
);
