import { query, withTransaction } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";

/**
 * Board ordering: { order: [taskId, ...] } sets sort_order 1..n for the listed
 * tasks (only tasks of the active profile are touched). Used per column.
 */
export const PUT = handler(async (request, _params, user) => {
  const body = await readJson(request);
  if (!Array.isArray(body.order) || !body.order.length) throw new HttpError("order must be a non-empty array of ids.", 400);
  const ids = [...new Set(body.order.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const owned = new Set((await query("SELECT id FROM tasks WHERE profile_id = ? AND id IN (?)", [user.profile_id, ids])).map((r) => r.id));
  const final = ids.filter((id) => owned.has(id));
  await withTransaction(async (conn) => {
    for (let i = 0; i < final.length; i++) await conn.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", [i + 1, final[i]]);
  });
  return ok({ order: final });
});
