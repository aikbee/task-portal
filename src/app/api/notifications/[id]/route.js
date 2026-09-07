import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";

/** { read: true|false } */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const body = await readJson(request);
  const res = await execute(`UPDATE notifications SET read_at = ${body.read === false ? "NULL" : "COALESCE(read_at, NOW())"} WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!res.affectedRows) throw new HttpError("Notification not found.", 404);
  return ok(await queryOne("SELECT * FROM notifications WHERE id = ?", [id]));
});

export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const res = await execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!res.affectedRows) throw new HttpError("Notification not found.", 404);
  return ok({ id });
});
