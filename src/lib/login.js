import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { createSession, pruneSessions } from "./auth";
import { notify } from "./notifications";

const METHOD_LABEL = { password: "", passkey: " with a passkey", google: " with Google", totp: " with a two-factor code" };

/** "Chrome on macOS" style description of a user agent, plus the device class. */
export function describeUserAgent(ua = "") {
  const browser = /^TaskPortal-Android\//.test(ua) ? "the Task Portal app" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : !ua || /^(node|curl|python|wget|postman|insomnia)/i.test(ua) ? "an API client" : "a browser";
  // iPhones and iPads say "like Mac OS X", so they are checked before macOS
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : null;
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "phone" : "desktop";
  return { browser, os, device, label: `${browser}${os ? ` on ${os}` : ""}` };
}

/** The caller's IP as seen through the reverse proxy (first X-Forwarded-For hop), or null. */
export function clientIp(request) {
  const h = request.headers;
  const raw = (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")?.trim() || "").replace(/^::ffff:/i, "");
  return raw ? raw.slice(0, 45) : null;
}

/** Append a row to the user's login history (never throws). */
export async function recordLoginEvent(request, userId, { method, success, reason = null, sessionId = null }) {
  if (!userId) return;
  const ua = request.headers.get("user-agent") || "";
  const d = describeUserAgent(ua);
  await execute(
    "INSERT INTO login_events (user_id, session_id, method, success, reason, ip, user_agent, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, sessionId, method, success ? 1 : 0, reason, clientIp(request), ua.slice(0, 255) || null, d.browser, d.os, d.device]
  ).catch(() => {});
}

/** The user's live sessions with device details, current one first. */
export async function listSessions(user) {
  const rows = await query(
    "SELECT id, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > NOW() ORDER BY (id = ?) DESC, COALESCE(last_seen_at, created_at) DESC",
    [user.id, user.session_id]
  );
  return rows.map((s) => {
    const d = describeUserAgent(s.user_agent || "");
    return { id: s.id, browser: d.browser, os: d.os, device: d.device, label: d.label, ip: s.ip, created_at: s.created_at, last_seen_at: s.last_seen_at, expires_at: s.expires_at, current: s.id === user.session_id };
  });
}

/**
 * Shared tail of every sign-in method (password, passkey, Google): refuses disabled
 * accounts, creates the session cookie, stamps last_login_at and sends the security
 * notification. Pass `response` to set the cookie on a redirect you built yourself.
 */
export async function finishLogin(request, user, { remember = false, method = "password", response = null } = {}) {
  if (user.status !== "active") {
    await recordLoginEvent(request, user.id, { method, success: false, reason: "disabled" });
    throw new HttpError("This account is disabled.", 403);
  }
  const ua = request.headers.get("user-agent") || "";
  // an email only for a browser this account has not signed in with before (and never for the very first sign-in)
  const d = describeUserAgent(ua);
  const seen = await queryOne("SELECT COUNT(*) AS total, COALESCE(SUM(browser <=> ? AND os <=> ?), 0) AS same FROM login_events WHERE user_id = ? AND success = 1", [d.browser, d.os, user.id]).catch(() => null);
  const newDevice = Boolean(seen && Number(seen.total) > 0 && Number(seen.same) === 0);
  const sessionId = await createSession(user.id, { remember, userAgent: ua, response, ip: clientIp(request) });
  await execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  await recordLoginEvent(request, user.id, { method, success: true, sessionId });
  pruneSessions().catch(() => {});
  notify({
    userId: user.id,
    type: "security_login",
    title: `New sign-in from ${describeUserAgent(ua).label}${METHOD_LABEL[method] ?? ""}`,
    body: "If this wasn't you, change your password from Profile & password.",
    href: "/notifications",
    entityType: "user",
    entityId: user.id,
    email: newDevice,
  }).catch(() => {});
}
