import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/password";
import { getSessionUser } from "@/lib/auth";
import { finishLogin, recordLoginEvent } from "@/lib/login";
import { signedCookie } from "@/lib/auth-cookies";
import { MFA_COOKIE, isTrustedDevice } from "@/lib/mfa";

export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new HttpError("Email and password are required.", 400);

    const { n } = await queryOne("SELECT COUNT(*) AS n FROM users");
    if (n === 0) throw new HttpError("No user accounts exist yet. Run `npm run db:setup` to create the default admin.", 503);

    const user = await queryOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (user) await recordLoginEvent(request, user.id, { method: "password", success: false, reason: "wrong_password" });
      throw new HttpError("Invalid email or password.", 401);
    }

    // two-factor authentication: no session yet, the code step follows (unless this browser is trusted)
    if (user.totp_secret && !(await isTrustedDevice(request, user.id))) {
      if (user.status !== "active") throw new HttpError("This account is disabled.", 403);
      const res = ok({ mfa_required: true });
      res.cookies.set(signedCookie(MFA_COOKIE, { u: user.id, remember: Boolean(body.remember), attempts: 0 }, 300));
      return res;
    }

    await finishLogin(request, user, { remember: Boolean(body.remember), method: "password" });
    const me = await getSessionUser(request).catch(() => null);
    const { password_hash, google_sub, totp_secret, totp_last_step, ...safe } = user;
    return ok({ ...safe, has_google: Boolean(google_sub), has_totp: Boolean(totp_secret), session_id: me?.session_id ?? null });
  },
  { auth: false }
);
