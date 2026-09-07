import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE, sessionSecret } from "@/lib/session-token";

const PUBLIC = new Set(["/login", "/api/auth/login", "/api/health"]);

/**
 * Request guard: pages without a validly signed session cookie go to /login,
 * API calls get 401. Full session validation (expiry, disabled accounts)
 * happens in the layouts and route handlers.
 */
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = token ? await verifySessionToken(token, sessionSecret()) : null;

  if (PUBLIC.has(pathname)) {
    if (pathname === "/login" && sessionId) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (sessionId) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
