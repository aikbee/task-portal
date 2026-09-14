import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/password";
import { checkSecondFactor, disableTotp, totpStatus } from "@/lib/mfa";
import { notify } from "@/lib/notifications";

/** Turn 2FA off: { password, code } where code is an authenticator or recovery code. */
export const POST = handler(async (request, _params, me) => {
  const body = await readJson(request);
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [me.id]);
  if (!user?.totp_secret) throw new HttpError("Two-factor authentication is not on.", 400);
  if (!verifyPassword(String(body.password ?? ""), user.password_hash)) throw new HttpError("Password is incorrect.", 400);
  await checkSecondFactor(user, body.code);
  await disableTotp(me.id);
  notify({ userId: me.id, type: "security_method", title: "Two-factor authentication turned off", body: "Password sign-ins no longer ask for a code. Turn it back on from Profile & password if this wasn't you.", href: "/notifications", entityType: "user", entityId: me.id }).catch(() => {});
  return ok(await totpStatus(me.id));
});
