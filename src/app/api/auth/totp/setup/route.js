import QRCode from "qrcode";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { signedCookie } from "@/lib/auth-cookies";
import { encryptSecret } from "@/lib/crypto";
import { generateTotpSecret, otpauthUri } from "@/lib/totp";
import { TOTP_SETUP_COOKIE, totpStatus } from "@/lib/mfa";

/** Step 1 of turning 2FA on: a fresh secret (QR + manual key). It only becomes active after /enable confirms a code. */
export const POST = handler(async (request, _params, user) => {
  if ((await totpStatus(user.id)).enabled) throw new HttpError("Two-factor authentication is already on. Turn it off first to set up a new app.", 400);
  const secret = generateTotpSecret();
  const otpauth = otpauthUri({ secret, account: user.email });
  const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 192, errorCorrectionLevel: "M" });
  const res = ok({ secret, otpauth, qr });
  res.cookies.set(signedCookie(TOTP_SETUP_COOKIE, { s: encryptSecret(secret), u: user.id }, 600));
  return res;
});
