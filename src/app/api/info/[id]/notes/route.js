import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { applyOrder, nextSortOrder } from "@/lib/ordering";
import { listNotes } from "../route";
import { blockPatch } from "@/lib/block-body";

async function owned(id, profileId) {
  const row = await queryOne("SELECT id FROM info_items WHERE id = ? AND profile_id = ?", [id, profileId]);
  if (!row) throw new HttpError("Info item not found.", 404);
}

/** Create a note: { title, content } → { items, created_id } */
export const POST = handler(async (request, params, user) => {
  const infoId = requireId(params.id);
  await owned(infoId, user.profile_id);
  const body = await readJson(request);
  const order = await nextSortOrder("info_notes", infoId);
  const b = blockPatch({ title: body.title ?? "", content: body.content ?? null, format: body.format ?? "text" });
  const res = await execute("INSERT INTO info_notes (info_id, title, content, format, sort_order) VALUES (?, ?, ?, ?, ?)", [infoId, b.title, b.content, b.format, order]);
  return ok({ items: await listNotes(infoId), created_id: res.insertId }, { status: 201 });
});

/** Reorder: { order: [noteId, ...] } */
export const PUT = handler(async (request, params, user) => {
  const infoId = requireId(params.id);
  await owned(infoId, user.profile_id);
  const body = await readJson(request);
  if (!Array.isArray(body.order)) throw new HttpError("order must be an array of ids.", 400);
  await applyOrder("info_notes", infoId, body.order);
  return ok(await listNotes(infoId));
});
