import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { getSessionUser } from "@/lib/auth";
import { appOrigin, safeNext, signedCookie } from "@/lib/auth-cookies";
import { GOOGLE_COOKIE, googleEnabled, buildGoogleAuthUrl, pkce } from "@/lib/google-auth";

/**
 * Start "Continue with Google" (public). ?remember=1 keeps the session for 30 days,
 * ?next=/path is where to land afterwards, ?link=1 connects Google to the signed-in
 * account instead of signing in.
 */
export const GET = handler(
  async (request) => {
    if (!googleEnabled()) throw new HttpError("Google sign-in is not set up on this server.", 404);
    const sp = request.nextUrl.searchParams;
    const origin = appOrigin(request);
    let link = null;
    if (sp.get("link") === "1") {
      const user = await getSessionUser(request);
      if (!user) return NextResponse.redirect(new URL("/login", origin));
      link = user.id;
    }
    const { verifier, challenge } = pkce();
    const state = crypto.randomBytes(16).toString("base64url");
    const res = NextResponse.redirect(buildGoogleAuthUrl({ origin, state, challenge }));
    res.cookies.set(signedCookie(GOOGLE_COOKIE, { state, verifier, remember: sp.get("remember") === "1", next: safeNext(sp.get("next")), link }, 600));
    return res;
  },
  { auth: false }
);

/** Disconnect Google from the signed-in account (the password keeps working). */
export const DELETE = handler(async (_request, _params, user) => {
  await execute("UPDATE users SET google_sub = NULL WHERE id = ?", [user.id]);
  return ok({ ok: true });
});
