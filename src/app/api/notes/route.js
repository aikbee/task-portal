import { query, execute } from "@/lib/db";
import { handler, ok, readJson, pick, oneOf } from "@/lib/api-utils";
import { NOTE_COLORS } from "@/lib/constants";
import { nextSortOrder } from "@/lib/ordering";

export const GET = handler(async (request, _params, user) => {
  const mod = request.nextUrl.searchParams.get("module");
  const rows = mod
    ? await query("SELECT * FROM notes WHERE user_id = ? AND module = ? ORDER BY pinned DESC, sort_order, id", [user.id, mod])
    : await query("SELECT * FROM notes WHERE user_id = ? ORDER BY module, pinned DESC, sort_order, id", [user.id]);
  return ok(rows);
});

export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const data = pick(body, ["module", "title", "content", "color", "pinned"]);
  data.user_id = user.id;
  data.module = data.module || "dashboard";
  oneOf(data.color, Object.keys(NOTE_COLORS), "color");
  data.color = data.color || "yellow";
  data.pinned = data.pinned ? 1 : 0;
  data.sort_order = await nextSortOrder("notes", data.module);
  const cols = Object.keys(data);
  const res = await execute(`INSERT INTO notes (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
  const [row] = await query("SELECT * FROM notes WHERE id = ?", [res.insertId]);
  return ok(row, { status: 201 });
});
