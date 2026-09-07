import { query, execute } from "@/lib/db";
import { handler, ok, readJson, pick, oneOf, requireId, HttpError } from "@/lib/api-utils";
import { NOTE_COLORS } from "@/lib/constants";

export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const body = await readJson(request);
  const data = pick(body, ["module", "title", "content", "color", "pinned", "sort_order"]);
  oneOf(data.color, Object.keys(NOTE_COLORS), "color");
  if ("pinned" in data) data.pinned = data.pinned ? 1 : 0;
  const cols = Object.keys(data);
  if (cols.length) {
    const res = await execute(`UPDATE notes SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND user_id = ?`, [...cols.map((c) => data[c]), id, user.id]);
    if (!res.affectedRows) throw new HttpError("Note not found.", 404);
  }
  const [row] = await query("SELECT * FROM notes WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!row) throw new HttpError("Note not found.", 404);
  return ok(row);
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  const res = await execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!res.affectedRows) throw new HttpError("Note not found.", 404);
  return ok({ id });
});
