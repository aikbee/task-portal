import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { setPosition, applyOrder } from "@/lib/ordering";
import { listNotes } from "../../info/[id]/route";
import { blockPatch } from "@/lib/block-body";

async function find(id, profileId) {
  const row = await queryOne("SELECT n.* FROM info_notes n JOIN info_items i ON i.id = n.info_id WHERE n.id = ? AND i.profile_id = ?", [id, profileId]);
  if (!row) throw new HttpError("Note not found.", 404);
  return row;
}

/** { title?, content?, position? } → ordered list */
export const PUT = handler(async (request, params, user) => {
  const note = await find(requireId(params.id), user.profile_id);
  const body = await readJson(request);
  const patch = blockPatch(body, note);
  const keys = Object.keys(patch);
  if (keys.length) await execute(`UPDATE info_notes SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => patch[k]), note.id]);
  if (body.position != null) await setPosition("info_notes", note.info_id, note.id, body.position);
  return ok(await listNotes(note.info_id));
});

export const DELETE = handler(async (_req, params, user) => {
  const note = await find(requireId(params.id), user.profile_id);
  await execute("DELETE FROM info_notes WHERE id = ?", [note.id]);
  await applyOrder("info_notes", note.info_id, []);
  return ok(await listNotes(note.info_id));
});
