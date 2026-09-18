import { queryOne, execute } from "./db";
import { normaliseAccess } from "./access-control";

/**
 * The access set new accounts start with (see access-control.js). Kept in app_settings as `default_access`;
 * nothing stored means new accounts start with everything. It only seeds an account when it is created:
 * changing the defaults later does not touch existing people.
 */
export async function readDefaultAccess() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'default_access'").catch(() => null);
  return normaliseAccess(row?.value ?? null);
}
export async function saveDefaultAccess(raw, userId) {
  const access = normaliseAccess(raw);
  if (!access.modules_off.length && !access.features_off.length) await execute("DELETE FROM app_settings WHERE name = 'default_access'");
  else await execute("INSERT INTO app_settings (name, value, updated_by) VALUES ('default_access', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [JSON.stringify(access), userId]);
  return access;
}
/** Give a fresh account the default set (administrators are never limited, so they get nothing). */
export async function applyDefaultAccess(userId, role = "user") {
  if (role === "admin") return null;
  const access = await readDefaultAccess();
  if (!access.modules_off.length && !access.features_off.length) return null;
  await execute("UPDATE users SET module_access = ? WHERE id = ?", [JSON.stringify(access), userId]);
  return access;
}
