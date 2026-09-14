import { execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readSignedCookie, clearCookie } from "@/lib/auth-cookies";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { TOTP_SETUP_COOKIE, enableTotp, totpStatus } from "@/lib/mfa";
import { notify } from "@/lib/notifications";

/** Step 2 of turning 2FA on: { code } from the app proves it was set up. Returns the recovery codes (shown once). */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const saved = readSignedCookie(request, TOTP_SETUP_COOKIE);
  if (!saved || saved.u !== user.id) throw new HttpError("The setup expired. Start again to get a new QR code.", 400);
  if ((await totpStatus(user.id)).enabled) throw new HttpError("Two-factor authentication is already on.", 400);
  const secret = decryptSecret(saved.s);
  const step = verifyTotp(secret, body.code);
  if (step == null) throw new HttpError("That code is not valid. Scan the QR code again and enter the current 6-digit code.", 400);
  const recovery_codes = await enableTotp(user.id, secret);
  await execute("UPDATE users SET totp_last_step = ? WHERE id = ?", [step, user.id]);
  notify({ userId: user.id, type: "security_method", title: "Two-factor authentication turned on", body: "Password sign-ins now ask for a code from your authenticator app. Keep your recovery codes somewhere safe.", href: "/notifications", entityType: "user", entityId: user.id }).catch(() => {});
  const res = ok({ ...(await totpStatus(user.id)), recovery_codes });
  res.cookies.set(clearCookie(TOTP_SETUP_COOKIE));
  return res;
});
