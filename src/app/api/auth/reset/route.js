import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { hashPassword, PASSWORD_MIN } from "@/lib/password";
import { recordLoginEvent } from "@/lib/login";
import { notify } from "@/lib/notifications";
import { findToken, useToken, renderEmail, sendMail } from "@/lib/mail";

const hint = (email) => email.replace(/^(.).*(@.*)$/, "$1•••$2");

/** ?token=: is this link still good, and for which (masked) address? */
export const GET = handler(
  async (request) => {
    const row = await findToken("reset", request.nextUrl.searchParams.get("token"));
    const user = row ? await queryOne("SELECT email FROM users WHERE id = ? AND status = 'active'", [row.user_id]) : null;
    return ok({ valid: Boolean(user), email_hint: user ? hint(user.email) : null, min_length: PASSWORD_MIN });
  },
  { auth: false }
);

/** { token, password }: set the new password. The link is used up, every session of the account is signed out. */
export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const password = String(body.password ?? "");
    const row = await findToken("reset", body.token);
    const user = row ? await queryOne("SELECT id, name, email FROM users WHERE id = ? AND status = 'active'", [row.user_id]) : null;
    if (!user) throw new HttpError("This link is no longer valid. Ask for a new one.", 410);
    if (password.length < PASSWORD_MIN) throw new HttpError(`The password must be at least ${PASSWORD_MIN} characters.`, 400);
    const used = await useToken(row.id);
    if (!used.affectedRows) throw new HttpError("This link is no longer valid. Ask for a new one.", 410);
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(password), user.id]);
    await execute("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    await execute("UPDATE mail_tokens SET used_at = NOW() WHERE purpose = 'reset' AND user_id = ? AND used_at IS NULL", [user.id]); // older links die too
    await recordLoginEvent(request, user.id, { method: "reset", success: true, reason: "password_reset" });
    await notify({ userId: user.id, type: "security_method", title: "Your password was reset by email", body: "Every device was signed out. If this was not you, tell an administrator.", href: "/security", email: false }).catch(() => {});
    const { html, text } = renderEmail({ title: "Your password was changed", lines: [`Hello ${user.name},`, "The password of your Task Portal account was just changed with a reset link, and every device was signed out.", "If this was not you, contact an administrator right away."] });
    sendMail({ to: user.email, subject: "Your Task Portal password was changed", text, html, kind: "reset_done" }).catch(() => {});
    return ok({ ok: true });
  },
  { auth: false }
);
