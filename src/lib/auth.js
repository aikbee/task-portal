import crypto from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { signSessionId, verifySessionToken, SESSION_COOKIE, sessionSecret } from "./session-token";

const DAY = 86_400_000;
export const WORKSPACE_COOKIE = "ap_workspace";
export const PROFILE_COOKIE = "ap_profile";

export const PUBLIC_USER_FIELDS = "u.id, u.name, u.email, u.role, u.status, u.avatar_color, u.employee_id, u.notification_prefs, (u.pin_hash IS NOT NULL) AS has_pin, u.last_login_at, u.created_at, u.updated_at";

/** Create a DB session for the user and set the signed cookie. */
export async function createSession(userId, { remember = false, userAgent = "" } = {}) {
  const id = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + (remember ? 30 : 7) * DAY);
  // FROM_UNIXTIME keeps expires_at in the same time zone MySQL uses for NOW()
  await execute("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, FROM_UNIXTIME(?), ?)", [id, userId, Math.floor(expires.getTime() / 1000), userAgent.slice(0, 255) || null]);
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: await signSessionId(id, sessionSecret()),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.COOKIE_SECURE === "1",
    expires,
  });
  return id;
}

/** Delete the current session (if any) and clear the cookie. */
export async function destroySession(request) {
  const id = await sessionIdFrom(request);
  if (id) await execute("DELETE FROM sessions WHERE id = ?", [id]);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

async function cookieValue(request, name) {
  let value = request?.cookies?.get?.(name)?.value;
  if (value === undefined) value = (await cookies()).get(name)?.value;
  return value;
}

async function sessionIdFrom(request) {
  return verifySessionToken(await cookieValue(request, SESSION_COOKIE), sessionSecret());
}

/** Remember the active profile (validated on every request against the workspace owner). */
export async function setProfileCookie(profileId) {
  const store = await cookies();
  if (!profileId) return store.delete(PROFILE_COOKIE);
  store.set({ name: PROFILE_COOKIE, value: String(profileId), httpOnly: true, sameSite: "lax", path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: 365 * 86400 });
}

/** Profiles of a workspace owner (creating the default one if none exists). */
export async function profilesOf(ownerId) {
  let rows = await query("SELECT id, user_id, name, description, color, is_default FROM profiles WHERE user_id = ? ORDER BY is_default DESC, name", [ownerId]);
  if (!rows.length) {
    await execute("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES (?, 'Personal', 'Default profile', '#6366f1', 1)", [ownerId]);
    rows = await query("SELECT id, user_id, name, description, color, is_default FROM profiles WHERE user_id = ? ORDER BY is_default DESC, name", [ownerId]);
  }
  return rows;
}

/** Admins may act inside another user's workspace; the choice lives in a cookie. */
export async function setWorkspaceCookie(userId) {
  const store = await cookies();
  if (!userId) return store.delete(WORKSPACE_COOKIE);
  store.set({ name: WORKSPACE_COOKIE, value: String(userId), httpOnly: true, sameSite: "lax", path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: 30 * 86400 });
}

/**
 * Resolve the logged-in user from the session cookie (request optional: falls
 * back to next/headers cookies() for server components). Returns null when
 * missing, expired, or the account is disabled.
 *
 * The result carries `owner_id`: the workspace whose projects / employees /
 * tasks are in scope. It is the user's own id, or — for admins who switched
 * workspace — another user's id (then `workspace` describes that user).
 */
export async function getSessionUser(request) {
  const id = await sessionIdFrom(request);
  if (!id) return null;
  const row = await queryOne(
    `SELECT ${PUBLIC_USER_FIELDS}, s.id AS session_id, s.expires_at, (s.unlocked_until IS NOT NULL AND s.unlocked_until > NOW()) AS secrets_unlocked
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > NOW() AND u.status = 'active'`,
    [id]
  );
  if (!row) return null;
  let owner_id = row.id;
  let workspace = null;
  if (row.role === "admin") {
    const wanted = Number(await cookieValue(request, WORKSPACE_COOKIE));
    if (Number.isInteger(wanted) && wanted > 0 && wanted !== row.id) {
      const target = await queryOne("SELECT id, name, email, role, avatar_color FROM users WHERE id = ?", [wanted]);
      if (target) {
        owner_id = target.id;
        workspace = target;
      }
    }
  }
  // active profile inside that workspace: the cookie's profile if it belongs to the owner, else the default
  const profiles = await profilesOf(owner_id);
  const wantedProfile = Number(await cookieValue(request, PROFILE_COOKIE));
  const profile = profiles.find((p) => p.id === wantedProfile) ?? profiles.find((p) => p.is_default) ?? profiles[0];
  return { ...row, has_pin: Boolean(row.has_pin), secrets_unlocked: Boolean(row.secrets_unlocked), owner_id, workspace, profile_id: profile.id, profile, profiles };
}

export async function requireUser(request) {
  const user = await getSessionUser(request);
  if (!user) throw new HttpError("Authentication required.", 401);
  return user;
}

export function requireRole(user, role) {
  if (user?.role !== role) throw new HttpError("Admin access required.", 403);
}

/** Remove expired sessions (called opportunistically on login). */
export async function pruneSessions() {
  await execute("DELETE FROM sessions WHERE expires_at < NOW()");
}
