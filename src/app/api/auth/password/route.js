import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { hashPassword, verifyPassword, PASSWORD_MIN } from "@/lib/password";

/** Change the signed-in user's password: { current_password, new_password }. Other sessions are signed out. */
export const PUT = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const current = String(body.current_password ?? "");
  const next = String(body.new_password ?? "");
  const row = await queryOne("SELECT password_hash FROM users WHERE id = ?", [user.id]);
  if (!row || !verifyPassword(current, row.password_hash)) throw new HttpError("Current password is incorrect.", 400);
  if (next.length < PASSWORD_MIN) throw new HttpError(`New password must be at least ${PASSWORD_MIN} characters.`, 400);
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(next), user.id]);
  await execute("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, user.session_id]);
  return ok({ ok: true });
});
