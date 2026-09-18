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
    const np = body.notification_prefs ?? {};
    let email_mode = ["instant", "digest", "off"].includes(np.email_mode) ? np.email_mode : cur.email_mode ?? (cur.email === false ? "off" : "instant");
    if (typeof np.email === "boolean") email_mode = np.email ? (email_mode === "off" ? "instant" : email_mode) : "off"; // older callers
    const digest_hour = Number.isInteger(np.digest_hour) && np.digest_hour >= 0 && np.digest_hour <= 23 ? np.digest_hour : Number.isInteger(cur.digest_hour) ? cur.digest_hour : 8;
    const tz = typeof np.tz === "string" && np.tz.length <= 64 && /^[A-Za-z_+\-/0-9]+$/.test(np.tz) ? np.tz : cur.tz ?? null;
    data.notification_prefs = JSON.stringify({ ...cur, muted, email: email_mode !== "off", email_mode, digest_hour, tz });
  }
  const cols = Object.keys(data);
  if (cols.length) await execute(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => data[c]), user.id]);
  return ok(await queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]));
});
