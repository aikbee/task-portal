import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { listTime } from "@/lib/time-tracking";
import { can } from "@/lib/sharing";
import { cleanEntry } from "../route";

async function find(taskId, entryId, profileId) {
  const row = await queryOne("SELECT e.* FROM time_entries e JOIN tasks t ON t.id = e.task_id WHERE e.id = ? AND e.task_id = ? AND t.profile_id = ?", [entryId, taskId, profileId]);
  if (!row) throw new HttpError("Time entry not found.", 404);
  return row;
}

/** { duration | minutes?, spent_on?, note? }: people correct their own entries. */
export const PUT = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  const e = await find(taskId, requireId(params.entryId), user.profile_id);
  if (e.user_id !== user.id) throw new HttpError("Only the person who logged this time can change it.", 403);
  if (e.started_at) throw new HttpError("Stop the timer first.", 409);
  const data = cleanEntry(await readJson(request), { partial: true });
  const cols = Object.keys(data);
  if (cols.length) await execute(`UPDATE time_entries SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => data[c]), e.id]);
  return ok(await listTime(taskId, user));
});

/** Own entries, or anyone's for the owner and managers. */
export const DELETE = handler(async (_request, params, user) => {
  const taskId = requireId(params.id);
  const e = await find(taskId, requireId(params.entryId), user.profile_id);
  if (e.user_id !== user.id && !can(user, "manager")) throw new HttpError("Only the person who logged this time, the owner or a manager can delete it.", 403);
  await execute("DELETE FROM time_entries WHERE id = ?", [e.id]);
  return ok(await listTime(taskId, user));
});
