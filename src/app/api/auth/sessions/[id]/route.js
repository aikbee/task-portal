import { execute } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { listSessions } from "@/lib/login";

/** Terminate one of your other sessions. */
export const DELETE = handler(async (_request, params, user) => {
  const id = String(params.id ?? "");
  if (!/^[a-f0-9]{48}$/.test(id)) throw new HttpError("Invalid session id.", 400);
  if (id === user.session_id) throw new HttpError("This is your current session — use Sign out instead.", 400);
  const r = await execute("DELETE FROM sessions WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.affectedRows) throw new HttpError("Session not found.", 404);
  return ok(await listSessions(user));
});
