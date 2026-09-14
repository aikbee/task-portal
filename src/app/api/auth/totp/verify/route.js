import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readSignedCookie, signedCookie, clearCookie } from "@/lib/auth-cookies";
import { MFA_COOKIE, MFA_MAX_ATTEMPTS, checkSecondFactor, trustDevice } from "@/lib/mfa";
import { finishLogin } from "@/lib/login";

/**
 * Second step of a password sign-in (public): { code, trust }. The first step left a
 * signed cookie naming the user; five wrong codes end the attempt.
 */
export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const saved = readSignedCookie(request, MFA_COOKIE);
    const user = saved ? await queryOne("SELECT * FROM users WHERE id = ?", [saved.u]) : null;
    if (!saved || !user?.totp_secret) throw new HttpError("Your sign-in expired. Enter your email and password again.", 400);
    try {
      await checkSecondFactor(user, body.code);
    } catch (err) {
      const attempts = (saved.attempts ?? 0) + 1;
      if (attempts >= MFA_MAX_ATTEMPTS) {
        const res = NextResponse.json({ error: "Too many wrong codes. Enter your email and password again." }, { status: 429 });
        res.cookies.set(clearCookie(MFA_COOKIE));
        return res;
      }
      const left = MFA_MAX_ATTEMPTS - attempts;
      const res = NextResponse.json({ error: `${err.message} ${left} attempt${left === 1 ? "" : "s"} left.` }, { status: 400 });
      res.cookies.set(signedCookie(MFA_COOKIE, { u: saved.u, remember: saved.remember, attempts }, Math.max(1, Math.floor((saved.exp - Date.now()) / 1000))));
      return res;
    }
    const res = ok({ id: user.id, name: user.name, email: user.email, role: user.role });
    await finishLogin(request, user, { remember: Boolean(saved.remember), method: "totp", response: res });
    if (body.trust) await trustDevice(request, res, user.id);
    res.cookies.set(clearCookie(MFA_COOKIE));
    return res;
  },
  { auth: false }
);
