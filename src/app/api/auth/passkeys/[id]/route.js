import { execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { listPasskeys, PASSKEY_ID_RE } from "@/lib/passkeys";

const validId = (id) => {
  if (!PASSKEY_ID_RE.test(String(id))) throw new HttpError("Invalid passkey id.", 400);
  return String(id);
};

/** Rename one of your passkeys: { name }. */
export const PATCH = handler(async (request, params, user) => {
  const id = validId(params.id);
  const body = await readJson(request);
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError("Name is required.", 400);
  const r = await execute("UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?", [name, id, user.id]);
  if (!r.affectedRows) throw new HttpError("Passkey not found.", 404);
  return ok(await listPasskeys(user.id));
});

/** Remove one of your passkeys. */
export const DELETE = handler(async (_request, params, user) => {
  const id = validId(params.id);
  const r = await execute("DELETE FROM passkeys WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.affectedRows) throw new HttpError("Passkey not found.", 404);
  return ok(await listPasskeys(user.id));
});
