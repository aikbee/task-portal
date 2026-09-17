import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, HttpError } from "@/lib/api-utils";
import { PUBLIC_USER_FIELDS } from "@/lib/auth";

/** Update the signed-in user's own name / avatar colour / notification preferences ({ muted: [categories] }). */
export const PUT = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const data = pick(body, ["name", "avatar_color"]);
  if ("name" in data && !data.name) throw new HttpError("Name is required.", 400);
  if (body.notification_prefs !== undefined) {
    // { muted?: [categories], email?: boolean }: what is not sent stays as it was
    const curRow = await queryOne("SELECT notification_prefs FROM users WHERE id = ?", [user.id]);
    const cur = (typeof curRow?.notification_prefs === "string" ? JSON.parse(curRow.notification_prefs) : curRow?.notification_prefs) ?? {};
    const muted = Array.isArray(body.notification_prefs?.muted) ? body.notification_prefs.muted.filter((c) => typeof c === "string").slice(0, 20) : (cur.muted ?? []);
    const email = typeof body.notification_prefs?.email === "boolean" ? body.notification_prefs.email : cur.email !== false;
    data.notification_prefs = JSON.stringify({ muted, email });
  }
  const cols = Object.keys(data);
  if (cols.length) await execute(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => data[c]), user.id]);
  return ok(await queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]));
});
