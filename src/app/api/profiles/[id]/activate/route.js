import { queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { setProfileCookie } from "@/lib/auth";

/** Make this profile the active one for the current workspace owner. */
export const POST = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const row = await queryOne("SELECT id, name, color, description, is_default FROM profiles WHERE id = ? AND user_id = ?", [id, user.owner_id]);
  if (!row) throw new HttpError("Profile not found.", 404);
  await setProfileCookie(id);
  return ok({ active: row });
});
