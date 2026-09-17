import { queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { setProfileCookie } from "@/lib/auth";

/** Make this profile the active one: one of my own, or one that was shared with me (and accepted). */
export const POST = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  let row = await queryOne("SELECT id, name, color, description, is_default FROM profiles WHERE id = ? AND user_id = ?", [id, user.home_id]);
  if (!row) {
    row = await queryOne(
      "SELECT p.id, p.name, p.color, p.description, 0 AS is_default, pm.role FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id JOIN users o ON o.id = p.user_id AND o.status = 'active' WHERE pm.profile_id = ? AND pm.user_id = ? AND pm.status = 'active'",
      [id, user.id]
    );
  }
  if (!row) throw new HttpError("Profile not found.", 404);
  await setProfileCookie(id);
  return ok({ active: row });
});
