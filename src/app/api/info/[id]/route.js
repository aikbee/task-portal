import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireId, HttpError } from "@/lib/api-utils";
import { encryptSecret } from "@/lib/crypto";
import { listAttachments, purgeFiles } from "@/lib/attachments";
import { INFO_FIELDS, INFO_SELECT, normaliseInfo, assertInfoProject } from "../route";

export async function getInfo(id, profileId) {
  const item = await queryOne(`${INFO_SELECT} WHERE i.id = ? AND i.profile_id = ?`, [id, profileId]);
  if (!item) throw new HttpError("Info item not found.", 404);
  item.has_secret = Boolean(item.has_secret);
  item.notes = await listNotes(id);
  item.attachments = await listAttachments("info", id);
  return item;
}
export const listNotes = (infoId) => query("SELECT * FROM info_notes WHERE info_id = ? ORDER BY sort_order, id", [infoId]);

export const GET = handler(async (_req, params, user) => ok(await getInfo(requireId(params.id), user.profile_id)));

/** Update fields; `secret` (string) re-encrypts, `secret: null` clears it, omitted keeps it. */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await getInfo(id, user.profile_id);
  const body = await readJson(request);
  const data = normaliseInfo(pick(body, INFO_FIELDS));
  if (data.title === null) throw new HttpError("Title is required.", 400);
  await assertInfoProject(user.profile_id, data);
  if ("secret" in body) data.secret_enc = body.secret ? encryptSecret(String(body.secret)) : null;
  const cols = Object.keys(data);
  if (cols.length) await execute(`UPDATE info_items SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...cols.map((c) => data[c]), id, user.profile_id]);
  return ok(await getInfo(id, user.profile_id));
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  await getInfo(id, user.profile_id);
  await purgeFiles("info", "p.id = ? AND p.profile_id = ?", [id, user.profile_id]);
  await execute("DELETE FROM info_items WHERE id = ? AND profile_id = ?", [id, user.profile_id]);
  return ok({ id });
});
