import { queryOne, execute } from "./db";
import { verifyPassword } from "./password";
import { HttpError } from "./http-error";

const UNLOCK_MINUTES = 10;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;
const failures = new Map(); // userId -> { count, until }

/**
 * Re-verify the current user for a sensitive action using the lock-screen PIN
 * or the login password, or an unexpired unlock window on this session.
 * Returns { unlockedUntil } and extends the window on success.
 */
export async function verifySensitive(user, { pin, password } = {}) {
  const now = Date.now();
  const f = failures.get(user.id);
  if (f?.until && f.until > now) throw new HttpError(`Too many attempts. Try again in ${Math.ceil((f.until - now) / 1000)}s.`, 429);

  let verified = false;
  if (!pin && !password) {
    verified = Boolean(user.secrets_unlocked);
    if (!verified) throw new HttpError("Verification required.", 401, { needs: user.has_pin ? ["pin", "password"] : ["password"] });
  } else {
    const row = await queryOne("SELECT password_hash, pin_hash FROM users WHERE id = ?", [user.id]);
    if (password) verified = verifyPassword(String(password), row.password_hash);
    else if (pin) verified = Boolean(row.pin_hash) && verifyPassword(String(pin), row.pin_hash);
    if (!verified) {
      const count = (f?.count ?? 0) + 1;
      failures.set(user.id, count >= MAX_FAILURES ? { count: 0, until: now + LOCKOUT_MS } : { count, until: 0 });
      throw new HttpError(pin ? "Incorrect PIN." : "Incorrect password.", 401, { needs: user.has_pin ? ["pin", "password"] : ["password"] });
    }
    failures.delete(user.id);
  }
  const until = new Date(now + UNLOCK_MINUTES * 60_000);
  await execute("UPDATE sessions SET unlocked_until = FROM_UNIXTIME(?) WHERE id = ?", [Math.floor(until.getTime() / 1000), user.session_id]);
  return { unlockedUntil: until.toISOString() };
}
