import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/password";
import { issueRecoveryCodes, totpStatus } from "@/lib/mfa";
import { notify } from "@/lib/notifications";

/** New recovery codes ({ password } re-confirms). The old ones stop working. */
export const POST = handler(async (request, _params, me) => {
  const body = await readJson(request);
  const user = await queryOne("SELECT password_hash, totp_secret FROM users WHERE id = ?", [me.id]);
  if (!user?.totp_secret) throw new HttpError("Two-factor authentication is not on.", 400);
  if (!verifyPassword(String(body.password ?? ""), user.password_hash)) throw new HttpError("Password is incorrect.", 400);
  const recovery_codes = await issueRecoveryCodes(me.id);
  notify({ userId: me.id, type: "security_method", title: "New recovery codes issued", body: "Your previous two-factor recovery codes no longer work.", href: "/notifications", entityType: "user", entityId: me.id }).catch(() => {});
  return ok({ ...(await totpStatus(me.id)), recovery_codes });
});
