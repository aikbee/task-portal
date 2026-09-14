import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { signedCookie, webauthnConfig } from "@/lib/auth-cookies";
import { PASSKEY_COOKIE } from "@/lib/passkeys";

/**
 * Step 1 of signing in with a passkey (public). With { email } the browser is pointed
 * at that account's passkeys; without it any discoverable passkey for this site works.
 */
export const POST = handler(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    let allowCredentials;
    if (email) {
      const rows = await query("SELECT p.id, p.transports FROM passkeys p JOIN users u ON u.id = p.user_id WHERE u.email = ? AND u.status = 'active'", [email]);
      if (rows.length) allowCredentials = rows.map((c) => ({ id: c.id, transports: c.transports ? c.transports.split(",") : undefined }));
    }
    const { rpID } = webauthnConfig(request);
    const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred", allowCredentials });
    const res = ok(options);
    res.cookies.set(signedCookie(PASSKEY_COOKIE, { c: options.challenge, t: "login" }, 300));
    return res;
  },
  { auth: false }
);
