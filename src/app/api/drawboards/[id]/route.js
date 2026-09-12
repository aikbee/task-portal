import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireId, HttpError } from "@/lib/api-utils";
import { listAttachments, purgeFiles } from "@/lib/attachments";
import { BOARD_FIELDS, BOARD_SELECT, normaliseBoard, assertBoardProject } from "../route";

async function getBoard(id, profileId, { full = true } = {}) {
  const row = await queryOne(`${BOARD_SELECT} WHERE b.id = ? AND b.profile_id = ?`, [id, profileId]);
  if (!row) throw new HttpError("Board not found.", 404);
  row.has_drawing = Boolean(row.has_drawing);
  if (full) {
    const big = await queryOne("SELECT data, thumbnail FROM draw_boards WHERE id = ?", [id]);
    row.data = big?.data ?? null;
    row.thumbnail = big?.thumbnail ?? null;
    row.attachments = await listAttachments("drawboard", id);
  }
  return row;
}

export const GET = handler(async (_req, params, user) => ok(await getBoard(requireId(params.id), user.profile_id)));

/** Update fields and/or the drawing: { title?, description?, notes?, project_id?, width?, height?, background?, data?, thumbnail? } */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await getBoard(id, user.profile_id, { full: false });
  const body = normaliseBoard(pick(await readJson(request), [...BOARD_FIELDS, "data", "thumbnail"]));
  if ("title" in body && !body.title) throw new HttpError("Title is required.", 400);
  if ("project_id" in body) await assertBoardProject(body.project_id, user.profile_id);
  const keys = Object.keys(body);
  if (keys.length) await execute(`UPDATE draw_boards SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => body[k]), id]);
  // the editor only needs the light row back (it already holds the drawing it just sent)
  const light = request.nextUrl.searchParams.get("light") === "1";
  return ok(await getBoard(id, user.profile_id, { full: !light }));
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  await getBoard(id, user.profile_id, { full: false });
  // files first (the purge joins the parent row), then the row cascades its attachment rows
  await purgeFiles("drawboard", "p.id = ? AND p.profile_id = ?", [id, user.profile_id]);
  await execute("DELETE FROM draw_boards WHERE id = ?", [id]);
  return ok({ id });
});
