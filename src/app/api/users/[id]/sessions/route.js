import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { USER_SELECT } from "../../route";
import { notify, notifyAdmins } from "@/lib/notifications";

/** Admin: sign an account out of every device and browser (its password keeps working). */
export const DELETE = handler(
  async (_request, params, me) => {
    const id = requireId(params.id);
    const user = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
    if (!user) throw new HttpError("User not found.", 404);
    const r = await execute("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [id, me.session_id]);
    if (r.affectedRows) {
      notify({ userId: id, type: "security_method", title: "You were signed out of all devices by an admin", body: "Sign in again to continue. Change your password if you did not expect this.", href: "/security", entityType: "user", entityId: id, actorId: me.id }).catch(() => {});
      notifyAdmins(me, { type: "user_updated", title: `Account changed: ${user.name}`, body: `signed out of ${r.affectedRows} session${r.affectedRows === 1 ? "" : "s"}`, href: "/users", entityType: "user", entityId: id });
    }
    return ok(await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]));
  },
  { role: "admin" }
);
