import crypto from "node:crypto";

export const GOOGLE_COOKIE = "ap_google";
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirectUri = (origin) => `${origin}/api/auth/google/callback`;

/** PKCE pair: the verifier stays in our signed cookie, the challenge goes to Google. */
export function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthUrl({ origin, state, challenge, clientId = process.env.GOOGLE_CLIENT_ID }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", googleRedirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/** Exchange the authorization code (server side, with the client secret) and read the verified profile. */
export async function exchangeGoogleCode({ code, verifier, origin }) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status}): ${(await tokenRes.text()).slice(0, 200)}`);
  const tokens = await tokenRes.json();
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!infoRes.ok) throw new Error(`Google userinfo failed (${infoRes.status})`);
  const p = await infoRes.json();
  return {
    sub: String(p.sub || ""),
    email: String(p.email || "").trim().toLowerCase(),
    verified: p.email_verified === true || p.email_verified === "true",
    name: String(p.name || ""),
  };
}
