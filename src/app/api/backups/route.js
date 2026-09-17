import { handler, ok, HttpError } from "@/lib/api-utils";
import { backupOverview, runManualBackup } from "@/lib/backups";

/** Admin: the state of the backups and the list of database archives. */
export const GET = handler(async () => ok(await backupOverview()), { role: "admin" });

/** Admin: back up now. Answers with the refreshed overview; 409 while another backup runs, 500 when it failed. */
export const POST = handler(
  async () => {
    const result = await runManualBackup();
    if (result.busy) throw new HttpError("A backup is already running.", 409);
    if (!result.ok) throw new HttpError(result.error || "The backup failed.", 500);
    return ok({ result, ...(await backupOverview()) }, { status: 201 });
  },
  { role: "admin" }
);
