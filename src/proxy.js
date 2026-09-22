import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE, sessionSecret } from "@/lib/session-token";

const PUBLIC = new Set([
  "/login", "/api/auth/login", "/api/auth/methods", "/api/auth/passkeys/login/options", "/api/auth/passkeys/login/verify", "/api/auth/google", "/api/auth/google/callback", "/api/auth/totp/verify",
  "/forgot", "/reset", "/join", "/api/auth/forgot", "/api/auth/reset", "/api/auth/join",
  "/api/health", "/offline", "/manifest.webmanifest", "/sw.js", "/api/cron/reminders", "/api/settings/backgrounds",
  "/bg", // the animated background on its own, shown behind the native apps' screens: no data, only the animation
]);

/**
 * Request guard: pages without a validly signed session cookie go to /login,
 * API calls get 401. Full session validation (expiry, disabled accounts)
 * happens in the layouts and route handlers.
 */
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = token ? await verifySessionToken(token, sessionSecret()) : null;

  // the native app checks for and downloads its updates before or without a session
  if (PUBLIC.has(pathname) || pathname.startsWith("/api/app/android/")) {
    if (pathname === "/login" && sessionId) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (sessionId) return NextResponse.next();
  // API tokens: the route handler checks the token itself
  if (pathname.startsWith("/api/") && /^Bearer\s+tp_/i.test(request.headers.get("authorization") ?? "")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
