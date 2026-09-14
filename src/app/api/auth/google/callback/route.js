import { NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import { handler } from "@/lib/api-utils";
import { getSessionUser } from "@/lib/auth";
import { appOrigin, readSignedCookie, clearCookie } from "@/lib/auth-cookies";
import { GOOGLE_COOKIE, googleEnabled, exchangeGoogleCode } from "@/lib/google-auth";
import { finishLogin } from "@/lib/login";

/**
 * Google sends the browser back here. Sign-in only works for accounts that already
 * exist: the Google identity is matched by its stored id, or on first use by the
 * verified email address (which links the two from then on). Nobody is created.
 */
export const GET = handler(
  async (request) => {
    const origin = appOrigin(request);
    const redirect = (path, params = {}) => {
      const u = new URL(path, origin);
      for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
      const res = NextResponse.redirect(u);
      res.cookies.set(clearCookie(GOOGLE_COOKIE));
      return res;
    };
    const sp = request.nextUrl.searchParams;
    const saved = readSignedCookie(request, GOOGLE_COOKIE);
    if (!googleEnabled()) return redirect("/login", { error: "google_unavailable" });
    if (sp.get("error")) return redirect("/login", { error: "google_denied" });
    const code = sp.get("code");
    const state = sp.get("state");
    if (!saved || !code || !state || state !== saved.state) return redirect("/login", { error: "google_failed" });

    let profile;
    try {
      profile = await exchangeGoogleCode({ code, verifier: saved.verifier, origin });
    } catch (err) {
      console.error("[google]", err.message);
      return redirect("/login", { error: "google_failed" });
    }
    if (!profile.sub || !profile.email || !profile.verified) return redirect("/login", { error: "google_unverified" });

    if (saved.link) {
      // connect Google to the account that started the flow
      const me = await getSessionUser(request);
      if (!me || me.id !== saved.link) return redirect("/login", { error: "google_failed" });
      const taken = await queryOne("SELECT id FROM users WHERE google_sub = ? AND id <> ?", [profile.sub, me.id]);
      if (taken) return redirect("/", { google: "taken" });
      await execute("UPDATE users SET google_sub = ? WHERE id = ?", [profile.sub, me.id]);
      return redirect("/", { google: "linked" });
    }

    let user = await queryOne("SELECT * FROM users WHERE google_sub = ?", [profile.sub]);
    if (!user) {
      user = await queryOne("SELECT * FROM users WHERE email = ?", [profile.email]);
      if (!user || (user.google_sub && user.google_sub !== profile.sub)) return redirect("/login", { error: "google_no_account", email: profile.email });
      await execute("UPDATE users SET google_sub = ? WHERE id = ?", [profile.sub, user.id]);
    }
    if (user.status !== "active") return redirect("/login", { error: "disabled" });
    const res = redirect(saved.next || "/");
    await finishLogin(request, user, { remember: Boolean(saved.remember), method: "google", response: res });
    return res;
  },
  { auth: false }
);
