/**
 * Signed session tokens: "<sessionId>.<hmac>". Uses Web Crypto only so the
 * same code runs in the request proxy and in route handlers.
 */
const enc = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSessionId(id, secret) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(id));
  return `${id}.${b64url(sig)}`;
}

/** Returns the session id when the signature is valid, otherwise null. */
export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  if (!/^[a-f0-9]{48}$/.test(id)) return null;
  const expected = await signSessionId(id, secret);
  return safeEqual(expected, token) ? id : null;
}

export const SESSION_COOKIE = "ap_session";
export const sessionSecret = () => process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
