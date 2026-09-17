import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { clientIp } from "@/lib/login";
import { readMailSettings, publicMailSettings, issueToken, renderEmail, sendMail, linkTo } from "@/lib/mail";

const HOURS = 1;

/**
 * { email }: send a password-reset link. The answer is the same whether or not the address has an account, so the
 * page cannot be used to find out who is registered. Limits: 3 links per account and 10 per IP address an hour.
 */
export const POST = handler(
  async (request) => {
    if (!(await publicMailSettings()).reset) throw new HttpError("Password reset by email is not set up here. Ask an administrator to reset your password.", 503);
    const email = String((await readJson(request)).email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Enter your email address.", 400);
    const ip = clientIp(request);
    const user = await queryOne("SELECT id, name, email FROM users WHERE email = ? AND status = 'active'", [email]);
    if (user) {
      const perUser = (await queryOne("SELECT COUNT(*) AS n FROM mail_tokens WHERE purpose = 'reset' AND user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR", [user.id])).n;
      const perIp = ip ? (await queryOne("SELECT COUNT(*) AS n FROM mail_tokens WHERE purpose = 'reset' AND ip = ? AND created_at > NOW() - INTERVAL 1 HOUR", [ip])).n : 0;
      if (perUser < 3 && perIp < 10) {
        const settings = await readMailSettings();
        const token = await issueToken({ purpose: "reset", userId: user.id, ip, hours: HOURS });
        const { html, text } = renderEmail({
          title: "Reset your password",
          lines: [`Hello ${user.name},`, "Somebody, hopefully you, asked for a new password for your Task Portal account. The link works once and for one hour.", "If it was not you, ignore this message: your password stays as it is."],
          action: { label: "Choose a new password", url: linkTo(settings, `/reset?token=${token}`, request) },
          footer: ip ? `Requested from ${ip}.` : "",
        });
        await sendMail({ to: user.email, subject: "Reset your Task Portal password", text, html, kind: "reset" });
      }
    }
    return ok({ ok: true });
  },
  { auth: false }
);
