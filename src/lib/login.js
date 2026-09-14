import { execute } from "./db";
import { HttpError } from "./http-error";
import { createSession, pruneSessions } from "./auth";
import { notify } from "./notifications";

const METHOD_LABEL = { password: "", passkey: " with a passkey", google: " with Google", totp: " with a two-factor code" };

/** "Chrome on macOS" style description of a user agent. */
export function describeUserAgent(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : !ua || /^(node|curl|python|wget|postman|insomnia)/i.test(ua) ? "an API client" : "a browser";
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : null;
  return { browser, os, label: `${browser}${os ? ` on ${os}` : ""}` };
}

/**
 * Shared tail of every sign-in method (password, passkey, Google): refuses disabled
 * accounts, creates the session cookie, stamps last_login_at and sends the security
 * notification. Pass `response` to set the cookie on a redirect you built yourself.
 */
export async function finishLogin(request, user, { remember = false, method = "password", response = null } = {}) {
  if (user.status !== "active") throw new HttpError("This account is disabled.", 403);
  const ua = request.headers.get("user-agent") || "";
  await createSession(user.id, { remember, userAgent: ua, response });
  await execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  pruneSessions().catch(() => {});
  notify({
    userId: user.id,
    type: "security_login",
    title: `New sign-in from ${describeUserAgent(ua).label}${METHOD_LABEL[method] ?? ""}`,
    body: "If this wasn't you, change your password from Profile & password.",
    href: "/notifications",
    entityType: "user",
    entityId: user.id,
  }).catch(() => {});
}
