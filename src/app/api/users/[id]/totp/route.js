import { queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { USER_SELECT } from "../../route";
import { disableTotp } from "@/lib/mfa";
import { notify, notifyAdmins } from "@/lib/notifications";

/** Admin: turn off two-factor authentication for a locked-out account (lost phone and recovery codes). */
export const DELETE = handler(
  async (_request, params, me) => {
    const id = requireId(params.id);
    const user = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
    if (!user) throw new HttpError("User not found.", 404);
    if (user.has_totp) {
      await disableTotp(id);
      notify({ userId: id, type: "security_method", title: "Two-factor authentication was turned off by an admin", body: "Sign in with your password and set it up again from Profile & password.", href: "/notifications", entityType: "user", entityId: id, actorId: me.id }).catch(() => {});
      notifyAdmins(me, { type: "user_updated", title: `Account changed: ${user.name}`, body: "two-factor authentication reset", href: "/users", entityType: "user", entityId: id });
    }
    return ok(await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]));
  },
  { role: "admin" }
);
