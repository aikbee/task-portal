import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readSignedCookie, clearCookie, webauthnConfig } from "@/lib/auth-cookies";
import { listPasskeys, PASSKEY_COOKIE } from "@/lib/passkeys";
import { describeUserAgent } from "@/lib/login";

/** Step 2 of adding a passkey: { response, name } from startRegistration(). */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const saved = readSignedCookie(request, PASSKEY_COOKIE);
  if (!saved || saved.t !== "register" || saved.u !== user.id) throw new HttpError("The passkey request expired. Please try again.", 400);
  if (!body.response || typeof body.response !== "object") throw new HttpError("Invalid passkey response.", 400);
  const { rpID, origins } = webauthnConfig(request);
  let result;
  try {
    result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: saved.c, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: false });
  } catch (err) {
    throw new HttpError(`The passkey could not be verified: ${err.message}`, 400);
  }
  if (!result.verified || !result.registrationInfo) throw new HttpError("The passkey could not be verified.", 400);
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const name = String(body.name ?? "").trim().slice(0, 80) || describeUserAgent(request.headers.get("user-agent") || "").label;
  await execute(
    "INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [credential.id, user.id, Buffer.from(credential.publicKey), credential.counter ?? 0, credential.transports?.join(",") || null, credentialDeviceType || null, credentialBackedUp ? 1 : 0, name]
  );
  const res = ok(await listPasskeys(user.id));
  res.cookies.set(clearCookie(PASSKEY_COOKIE));
  return res;
});
