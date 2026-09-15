import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { PUBLIC_USER_FIELDS } from "@/lib/auth";
import { saveBuffer, deleteStoredFile } from "@/lib/uploads";
import { imageMeta } from "@/lib/images";
import { PRESET_KEYS, AVATAR_MAX_BYTES, uploadedFileOf } from "@/lib/avatar-presets";

const me = (id) => queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users u WHERE u.id = ?`, [id]);
async function setAvatar(userId, value) {
  const row = await queryOne("SELECT avatar FROM users WHERE id = ?", [userId]);
  await execute("UPDATE users SET avatar = ? WHERE id = ?", [value, userId]);
  const old = uploadedFileOf(row?.avatar);
  if (old && old !== uploadedFileOf(value)) await deleteStoredFile(old).catch(() => {});
}

/** Pick a preset icon or initials: { avatar: "preset:<key>" | "initials" }. */
export const PUT = handler(async (request, _params, user) => {
  const value = String((await readJson(request)).avatar ?? "");
  const okValue = value === "initials" || (value.startsWith("preset:") && PRESET_KEYS.has(value.slice(7)));
  if (!okValue) throw new HttpError("Pick one of the icons, or initials.", 400);
  await setAvatar(user.id, value);
  return ok(await me(user.id));
});

/** Upload a photo (multipart "file", JPEG/PNG/GIF/WebP, 2 MB; the browser sends a 256 px square). */
export const POST = handler(async (request, _params, user) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !file.size) throw new HttpError("Choose a picture.", 400);
  if (file.size > AVATAR_MAX_BYTES) throw new HttpError("Pictures can be up to 2 MB.", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const meta = imageMeta(buf);
  if (!meta) throw new HttpError("That is not a JPEG, PNG, GIF or WebP image.", 400);
  const { storedName } = await saveBuffer(buf, `avatar-${user.id}.${meta.type}`);
  await setAvatar(user.id, `upload:user:${user.id}:${storedName}`);
  return ok(await me(user.id), { status: 201 });
});

/** Back to the default badge. */
export const DELETE = handler(async (_request, _params, user) => {
  await setAvatar(user.id, null);
  return ok(await me(user.id));
});
