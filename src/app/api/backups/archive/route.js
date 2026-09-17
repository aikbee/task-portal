import fsp from "node:fs/promises";
import path from "node:path";
import { handler, HttpError } from "@/lib/api-utils";
import { listBackups, backupPath } from "@/lib/backups";
import { uploadDir } from "@/lib/uploads";
import { zipStream } from "@/lib/chat-export";

const ZIP_LIMIT = 3.5 * 1024 * 1024 * 1024; // the simple ZIP format addresses 4 GB
const RESTORE_NOTES = `Task Portal: full backup

database/   the newest database archive (gzip-compressed SQL)
uploads/    every uploaded file (attachments, photos, voice notes, videos)

To restore on a server that has the app checked out:

  1. Database, into an empty database named by DB_NAME:
       node --env-file=.env scripts/restore.mjs database/<file>.sql.gz
     or with the MySQL client:
       gunzip -c database/<file>.sql.gz | mysql -u <user> -p <database>
  2. Files: copy everything under uploads/ into the app's UPLOAD_DIR.
  3. Keep the same DATA_KEY in the environment, or stored Info secrets cannot be read.
  4. Everybody signs in again: login sessions are never part of a backup.
`;

/** Admin: one ZIP with the newest database archive and every uploaded file, for keeping a copy off the server. */
export const GET = handler(
  async () => {
    const [newest] = await listBackups();
    if (!newest) throw new HttpError("There is no backup yet. Run one first.", 409);
    const dir = uploadDir();
    const names = (await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
    let total = newest.bytes;
    for (const n of names) total += (await fsp.stat(path.join(/* turbopackIgnore: true */ dir, n)).catch(() => ({ size: 0 }))).size;
    if (total > ZIP_LIMIT) throw new HttpError("The files are too large for one ZIP download. Copy the backup folder from the server instead.", 413);
    async function* entries() {
      yield { name: "README.txt", data: Buffer.from(RESTORE_NOTES, "utf8") };
      yield { name: `database/${newest.name}`, data: () => fsp.readFile(backupPath(newest.name)).catch(() => null), mtime: new Date(newest.at) };
      for (const n of names) yield { name: `uploads/${n}`, data: () => fsp.readFile(path.join(/* turbopackIgnore: true */ dir, n)).catch(() => null) };
    }
    const stamp = newest.at.slice(0, 10);
    return new Response(ReadableStream.from(zipStream(entries())), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="task-portal-backup-${stamp}.zip"`, "Cache-Control": "no-store" },
    });
  },
  { role: "admin" }
);
