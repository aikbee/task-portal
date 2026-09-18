import crypto from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { signSessionId, verifySessionToken, SESSION_COOKIE, sessionSecret } from "./session-token";
import { bearerOf, resolveToken } from "./api-tokens";
import { sharedProfilesOf } from "./sharing";

const DAY = 86_400_000;
export const WORKSPACE_COOKIE = "ap_workspace";
export const PROFILE_COOKIE = "ap_profile";

export const PUBLIC_USER_FIELDS = "u.id, u.name, u.email, u.role, u.status, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, u.employee_id, u.notification_prefs, (u.pin_hash IS NOT NULL) AS has_pin, (u.google_sub IS NOT NULL) AS has_google, (u.totp_secret IS NOT NULL) AS has_totp, u.last_login_at, u.created_at, u.updated_at";

/** Create a DB session for the user and set the signed cookie (on `response` when given, else via next/headers). */
export async function createSession(userId, { remember = false, userAgent = "", response = null, ip = null } = {}) {
  const id = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + (remember ? 30 : 7) * DAY);
  // FROM_UNIXTIME keeps expires_at in the same time zone MySQL uses for NOW()
  await execute("INSERT INTO sessions (id, user_id, expires_at, user_agent, ip, last_seen_at) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?, NOW())", [id, userId, Math.floor(expires.getTime() / 1000), userAgent.slice(0, 255) || null, ip]);
  const cookie = {
    name: SESSION_COOKIE,
    value: await signSessionId(id, sessionSecret()),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.COOKIE_SECURE === "1",
    expires,
  };
  if (response) response.cookies.set(cookie);
  else (await cookies()).set(cookie);
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
 * workspace — another user's id (then `workspace` describes that user), or the
 * owner of a profile that was shared with the user.
 *
 *   home_id          whose profiles "my profiles" are (own id, or the admin's target): never a sharer
 *   profiles         the home profiles;  shared_profiles  the ones other people share with this user
 *   access           owner | manager | editor | viewer: what the user may do in the active profile
 *   shared           null, or { owner, role } while the active profile is somebody else's
 */
export async function getSessionUser(request) {
  const bearer = bearerOf(request);
  if (bearer) return tokenUser(bearer);
  const id = await sessionIdFrom(request);
  if (!id) return null;
  const row = await queryOne(
    `SELECT ${PUBLIC_USER_FIELDS}, s.id AS session_id, s.expires_at, (s.unlocked_until IS NOT NULL AND s.unlocked_until > NOW()) AS secrets_unlocked,
       (s.last_seen_at IS NULL OR s.last_seen_at < NOW() - INTERVAL 5 MINUTE) AS stale_seen
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > NOW() AND u.status = 'active'`,
    [id]
  );
  if (!row) return null;
  // "last active" on the Security page, refreshed at most every five minutes and never awaited
  if (row.stale_seen) execute("UPDATE sessions SET last_seen_at = NOW() WHERE id = ?", [id]).catch(() => {});
  delete row.stale_seen;
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
  // active profile: the cookie's profile if it is one of the home profiles or one shared with the user, else the default
  const home_id = owner_id;
  const profiles = await profilesOf(home_id);
  const shared_profiles = await sharedProfilesOf(row.id);
  const wantedProfile = Number(await cookieValue(request, PROFILE_COOKIE));
  let profile = profiles.find((p) => p.id === wantedProfile);
  let access = "owner";
  let shared = null;
  if (!profile) {
    const lent = shared_profiles.find((p) => p.id === wantedProfile);
    if (lent) {
      profile = lent;
      owner_id = lent.user_id; // what members create belongs to the profile's owner
      workspace = null;
      access = lent.role;
      shared = { owner: lent.owner, role: lent.role };
    }
  }
  profile ??= profiles.find((p) => p.is_default) ?? profiles[0];
  return { ...row, has_pin: Boolean(row.has_pin), has_google: Boolean(row.has_google), has_totp: Boolean(row.has_totp), secrets_unlocked: Boolean(row.secrets_unlocked), owner_id, home_id, workspace, profile_id: profile.id, profile, profiles, shared_profiles, access, shared };
}

/**
 * A request with "Authorization: Bearer tp_…": the same user shape as a session, inside the token's profile,
 * with `token: { id, scope }` so the API guard can keep read tokens to reading. Secrets stay locked.
 */
async function tokenUser(bearer) {
  const t = await resolveToken(bearer);
  if (!t) return null;
  if (t.usage.over) {
    const what = t.usage.scope === "day" ? "today" : "this minute";
    throw new HttpError(`This token has made too many requests ${what}. Try again in ${t.usage.retry_after} seconds.`, 429, { limit: t.usage.limit, retry_after: t.usage.retry_after }, { "Retry-After": String(t.usage.retry_after), "X-RateLimit-Limit": String(t.usage.limit), "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + t.usage.retry_after) });
  }
  const row = await queryOne(`SELECT ${PUBLIC_USER_FIELDS}, NULL AS session_id, NULL AS expires_at, 0 AS secrets_unlocked FROM users u WHERE u.id = ? AND u.status = 'active'`, [t.user_id]);
  if (!row) return null;
  const home_id = row.id;
  const profiles = await profilesOf(home_id);
  const shared_profiles = await sharedProfilesOf(row.id);
  let owner_id = row.id;
  let access = "owner";
  let shared = null;
  let profile = profiles.find((p) => p.id === t.profile_id);
  if (!profile && t.profile_id) {
    const lent = shared_profiles.find((p) => p.id === t.profile_id);
    if (!lent) return null; // the token's profile is gone or no longer shared: the token is useless
    profile = lent;
    owner_id = lent.user_id;
    access = lent.role;
    shared = { owner: lent.owner, role: lent.role };
  }
  profile ??= profiles.find((p) => p.is_default) ?? profiles[0];
  return { ...row, has_pin: Boolean(row.has_pin), has_google: Boolean(row.has_google), has_totp: Boolean(row.has_totp), secrets_unlocked: false, owner_id, home_id, workspace: null, profile_id: profile.id, profile, profiles, shared_profiles, access, shared, token: { id: t.id, scope: t.scope, usage: t.usage } };
}

export async function requireUser(request) {
  const user = await getSessionUser(request);
  if (!user) throw new HttpError("Authentication required.", 401);
  return user;
}

export function requireRole(user, role) {
  if (user?.role !== role) throw new HttpError("Admin access required.", 403);
}

/** Remove expired sessions and old login history (called opportunistically on login). */
export async function pruneSessions() {
  await execute("DELETE FROM sessions WHERE expires_at < NOW()");
  await execute("DELETE FROM login_events WHERE created_at < NOW() - INTERVAL 180 DAY");
}
