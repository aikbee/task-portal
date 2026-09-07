import { execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { hashPassword } from "@/lib/password";

/**
 * Keep a server-side copy of the lock-screen PIN (hashed) so sensitive actions can
 * be re-verified with it. { pin: "1234" } sets, { pin: null } clears.
 */
export const PUT = handler(async (request, _params, user) => {
  const body = await readJson(request);
  if (body.pin == null || body.pin === "") {
    await execute("UPDATE users SET pin_hash = NULL WHERE id = ?", [user.id]);
    return ok({ has_pin: false });
  }
  const pin = String(body.pin);
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError("PIN must be 4–8 digits.", 400);
  await execute("UPDATE users SET pin_hash = ? WHERE id = ?", [hashPassword(pin), user.id]);
  return ok({ has_pin: true });
});
