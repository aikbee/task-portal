import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, systemMessage, broadcast, assertManager } from "@/lib/chat";
import { saveBuffer, deleteStoredFile } from "@/lib/uploads";
import { imageMeta } from "@/lib/images";
import { PRESET_KEYS, AVATAR_MAX_BYTES, uploadedFileOf } from "@/lib/avatar-presets";

async function ownedGroup(id, user) {
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Only group chats have a picture.", 400);
  assertManager(convo, "change the picture");
  return convo;
}
async function apply(convo, userId, value) {
  const row = await queryOne("SELECT avatar FROM conversations WHERE id = ?", [convo.id]);
  await execute("UPDATE conversations SET avatar = ? WHERE id = ?", [value, convo.id]);
  const old = uploadedFileOf(row?.avatar);
  if (old && old !== uploadedFileOf(value)) await deleteStoredFile(old).catch(() => {});
  await systemMessage(convo, userId, "image");
  broadcast(convo, { type: "conversation", conversation_id: convo.id, action: "updated" });
  return conversationFor(convo.id, userId);
}

/** Pick a preset icon for the group: { avatar: "preset:<key>" } (owner or admin). */
export const PUT = handler(async (request, params, user) => {
  const convo = await ownedGroup(requireId(params.id), user);
  const value = String((await readJson(request)).avatar ?? "");
  if (!(value.startsWith("preset:") && PRESET_KEYS.has(value.slice(7)))) throw new HttpError("Pick one of the icons.", 400);
  return ok(await apply(convo, user.id, value));
});

/** Upload a group picture (multipart "file", 2 MB; owner or admin). */
export const POST = handler(async (request, params, user) => {
  const convo = await ownedGroup(requireId(params.id), user);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !file.size) throw new HttpError("Choose a picture.", 400);
  if (file.size > AVATAR_MAX_BYTES) throw new HttpError("Pictures can be up to 2 MB.", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const meta = imageMeta(buf);
  if (!meta) throw new HttpError("That is not a JPEG, PNG, GIF or WebP image.", 400);
  const { storedName } = await saveBuffer(buf, `group-${convo.id}.${meta.type}`);
  return ok(await apply(convo, user.id, `upload:group:${convo.id}:${storedName}`), { status: 201 });
});

/** Back to the coloured badge (owner or admin). */
export const DELETE = handler(async (_request, params, user) => {
  const convo = await ownedGroup(requireId(params.id), user);
  return ok(await apply(convo, user.id, null));
});
