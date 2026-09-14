import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { USER_SELECT } from "../../route";
import { notify, notifyAdmins } from "@/lib/notifications";

/** Admin: disconnect "Continue with Google" from an account. The password keeps working. */
export const DELETE = handler(
  async (_request, params, me) => {
    const id = requireId(params.id);
    const user = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
    if (!user) throw new HttpError("User not found.", 404);
    const r = await execute("UPDATE users SET google_sub = NULL WHERE id = ? AND google_sub IS NOT NULL", [id]);
    if (r.affectedRows) {
      notify({
        userId: id,
        type: "security_method",
        title: "Google was disconnected from your account by an admin",
        body: "Sign in with your password. You can connect Google again from Profile & password.",
        href: "/notifications",
        entityType: "user",
        entityId: id,
        actorId: me.id,
      }).catch(() => {});
      notifyAdmins(me, { type: "user_updated", title: `Account changed: ${user.name}`, body: "Google disconnected", href: "/users", entityType: "user", entityId: id });
    }
    return ok(await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]));
  },
  { role: "admin" }
);
