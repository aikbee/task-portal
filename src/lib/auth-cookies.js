import crypto from "node:crypto";
import { sessionSecret } from "./session-token.js";

const COOKIE_PATH = "/api/auth";
const sign = (data) => crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");

/**
 * Short-lived signed cookies carry the state of a sign-in ceremony between two
 * requests (a WebAuthn challenge, an OAuth state + PKCE verifier). Apply the
 * returned attributes with `response.cookies.set(...)`.
 */
export function signedCookie(name, payload, maxAgeSeconds = 300) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + maxAgeSeconds * 1000 })).toString("base64url");
  return { name, value: `${data}.${sign(data)}`, httpOnly: true, sameSite: "lax", path: COOKIE_PATH, secure: process.env.COOKIE_SECURE === "1", maxAge: maxAgeSeconds };
}

export function clearCookie(name) {
  return { name, value: "", path: COOKIE_PATH, maxAge: 0 };
}

/** The payload of a cookie written by signedCookie(), or null when missing, tampered with or expired. */
export function readSignedCookie(request, name) {
  const raw = request.cookies.get(name)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const data = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(data);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

/**
 * The public origin of this deployment: APP_URL when set, otherwise derived from
 * the proxy headers (nginx in front of the app) or the request itself.
 */
export function appOrigin(request) {
  const env = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const h = request.headers;
  const url = new URL(request.url);
  const host = h.get("x-forwarded-host") || h.get("host") || url.host;
  let proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  if (!proto) {
    // a same-host Origin/Referer header tells us how the browser reached us
    for (const name of ["origin", "referer"]) {
      try {
        const u = new URL(h.get(name) || "");
        if (u.host === host) { proto = u.protocol.replace(":", ""); break; }
      } catch {}
    }
  }
  return `${proto || url.protocol.replace(":", "")}://${host}`;
}

/** Only relative in-app paths may be used as post-login destinations. */
export function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** WebAuthn relying-party settings for a request. */
export function webauthnConfig(request) {
  const origin = appOrigin(request);
  const rpID = (process.env.WEBAUTHN_RP_ID || "").trim() || new URL(origin).hostname;
  const origins = new Set([origin]);
  try {
    const o = new URL(request.headers.get("origin") || "");
    if (o.hostname === rpID || o.hostname.endsWith(`.${rpID}`)) origins.add(o.origin);
  } catch {}
  return { rpName: "Task Portal", rpID, origins: [...origins] };
}
