import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { USER_SELECT } from "../../route";
import { notify, notifyAdmins } from "@/lib/notifications";

/** Admin: remove every passkey of an account (a lost device, for example). The password keeps working. */
export const DELETE = handler(
  async (_request, params, me) => {
    const id = requireId(params.id);
    const user = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
    if (!user) throw new HttpError("User not found.", 404);
    const r = await execute("DELETE FROM passkeys WHERE user_id = ?", [id]);
    if (r.affectedRows) {
      notify({
        userId: id,
        type: "security_method",
        title: r.affectedRows === 1 ? "A passkey was removed from your account by an admin" : `${r.affectedRows} passkeys were removed from your account by an admin`,
        body: "Sign in with your password and add a new passkey from Profile & password if you still need one.",
        href: "/notifications",
        entityType: "user",
        entityId: id,
        actorId: me.id,
      }).catch(() => {});
      notifyAdmins(me, { type: "user_updated", title: `Account changed: ${user.name}`, body: `${r.affectedRows} passkey${r.affectedRows === 1 ? "" : "s"} removed`, href: "/users", entityType: "user", entityId: id });
    }
    return ok(await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]));
  },
  { role: "admin" }
);
