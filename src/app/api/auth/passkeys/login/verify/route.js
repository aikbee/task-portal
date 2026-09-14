import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readSignedCookie, clearCookie, webauthnConfig } from "@/lib/auth-cookies";
import { PASSKEY_COOKIE, PASSKEY_ID_RE, toCredential } from "@/lib/passkeys";
import { finishLogin, recordLoginEvent } from "@/lib/login";

/** Step 2 of signing in with a passkey (public): { response, remember } from startAuthentication(). */
export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const saved = readSignedCookie(request, PASSKEY_COOKIE);
    if (!saved || saved.t !== "login") throw new HttpError("The passkey request expired. Please try again.", 400);
    const response = body.response;
    if (!response || typeof response !== "object" || !PASSKEY_ID_RE.test(String(response.id ?? ""))) throw new HttpError("Invalid passkey response.", 400);
    const row = await queryOne("SELECT * FROM passkeys WHERE id = ?", [String(response.id)]);
    if (!row) throw new HttpError("This passkey is not registered here. Sign in with your password and add it from Profile & password.", 400);
    const user = await queryOne("SELECT * FROM users WHERE id = ?", [row.user_id]);
    if (!user) throw new HttpError("This passkey is not registered here.", 400);
    const { rpID, origins } = webauthnConfig(request);
    let result;
    try {
      result = await verifyAuthenticationResponse({ response, expectedChallenge: saved.c, expectedOrigin: origins, expectedRPID: rpID, credential: toCredential(row), requireUserVerification: false });
    } catch (err) {
      await recordLoginEvent(request, user.id, { method: "passkey", success: false, reason: "passkey_failed" });
      throw new HttpError(`The passkey could not be verified: ${err.message}`, 400);
    }
    if (!result.verified) {
      await recordLoginEvent(request, user.id, { method: "passkey", success: false, reason: "passkey_failed" });
      throw new HttpError("The passkey could not be verified.", 400);
    }
    await execute("UPDATE passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?", [result.authenticationInfo.newCounter, row.id]);
    const res = ok({ id: user.id, name: user.name, email: user.email, role: user.role });
    await finishLogin(request, user, { remember: Boolean(body.remember), method: "passkey", response: res });
    res.cookies.set(clearCookie(PASSKEY_COOKIE));
    return res;
  },
  { auth: false }
);
