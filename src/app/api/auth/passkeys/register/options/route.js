import { generateRegistrationOptions } from "@simplewebauthn/server";
import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { signedCookie, webauthnConfig } from "@/lib/auth-cookies";
import { PASSKEY_COOKIE } from "@/lib/passkeys";

/** Step 1 of adding a passkey: options for navigator.credentials.create(); the challenge rides in a signed cookie. */
export const POST = handler(async (request, _params, user) => {
  const { rpName, rpID } = webauthnConfig(request);
  const existing = await query("SELECT id, transports FROM passkeys WHERE user_id = ?", [user.id]);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ? c.transports.split(",") : undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  const res = ok(options);
  res.cookies.set(signedCookie(PASSKEY_COOKIE, { c: options.challenge, t: "register", u: user.id }, 300));
  return res;
});
