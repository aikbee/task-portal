import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";

/**
 * Sharing a profile with other accounts. The owner is `profiles.user_id`; everybody else has a row in
 * `profile_members` with a role. The session layer (auth.js) puts the role on the user as `access`, and
 * `handler()` in api-utils enforces `requiredAccess()` for every workspace route, so the routes themselves
 * stay unaware of sharing: they keep scoping by `user.profile_id`.
 *
 *   viewer   reads
 *   editor   creates and edits (and removes parts of a record: a file, an output row, a team member)
 *   manager  also deletes whole records and manages members
 *   owner    everything, including the Info vault, which is never shared
 */
export const MEMBER_ROLES = ["viewer", "editor", "manager"];
export const ACCESS_RANK = { viewer: 1, editor: 2, manager: 3, owner: 4 };
export const can = (user, level) => (ACCESS_RANK[user?.access ?? "owner"] ?? 0) >= ACCESS_RANK[level];

const WORKSPACE_ROUTE = /^\/api\/(projects|tasks|requirements|employees|drawboards|events|info|info-notes|attachments|outputs)(\/|$)/;
const WHOLE_RECORD = /^\/api\/(projects|tasks|requirements|employees|drawboards|events)\/\d+\/?$/;

/** The access a request needs inside the active profile, or null for routes that are not workspace data. */
export function requiredAccess(method, pathname) {
  const m = WORKSPACE_ROUTE.exec(pathname);
  if (!m) return null;
  if (m[1] === "info" || m[1] === "info-notes" || /^\/api\/attachments\/info(\/|$)/.test(pathname)) return "owner";
  if (method === "GET" || method === "HEAD") return "viewer";
  if (method === "DELETE") return WHOLE_RECORD.test(pathname) ? "manager" : "editor";
  return "editor";
}
export function assertAccess(user, method, pathname) {
  const need = requiredAccess(method, pathname);
  if (!need || can(user, need)) return;
  if (need === "owner") throw new HttpError("The Info vault is private to the profile's owner and is not shared.", 403, { access: user.access, need });
  if (need === "manager") throw new HttpError("Only the owner or a manager of this shared profile can delete this.", 403, { access: user.access, need });
  throw new HttpError("You have view-only access to this shared profile.", 403, { access: user.access, need });
}

const OWNER_FIELDS = "o.id AS owner_id, o.name AS owner_name, o.avatar_color AS owner_avatar_color, COALESCE(o.avatar, 'preset:pro') AS owner_avatar";
const shapeShared = (r) => ({
  id: r.id, user_id: r.user_id, name: r.name, description: r.description, color: r.color, is_default: 0, role: r.role, status: r.status,
  invited_at: r.created_at, owner: { id: r.owner_id, name: r.owner_name, avatar_color: r.owner_avatar_color, avatar: r.owner_avatar },
  ...(r.inviter_name ? { invited_by: { id: r.invited_by, name: r.inviter_name } } : {}),
});
/** Profiles other people share with this user (status active), or the invitations still waiting (status invited). */
export async function sharedProfilesOf(userId, status = "active") {
  const rows = await query(
    `SELECT p.id, p.user_id, p.name, p.description, p.color, pm.role, pm.status, pm.created_at, pm.invited_by, i.name AS inviter_name, ${OWNER_FIELDS}
     FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id JOIN users o ON o.id = p.user_id AND o.status = 'active'
     LEFT JOIN users i ON i.id = pm.invited_by
     WHERE pm.user_id = ? AND pm.status = ? ORDER BY p.name`,
    [userId, status]
  );
  return rows.map(shapeShared);
}
export const pendingInviteCount = async (userId) => Number((await queryOne("SELECT COUNT(*) AS n FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id JOIN users o ON o.id = p.user_id AND o.status = 'active' WHERE pm.user_id = ? AND pm.status = 'invited'", [userId]))?.n ?? 0);

/** Members of a profile, owner first. */
export async function membersOf(profileId) {
  const profile = await queryOne("SELECT id, user_id FROM profiles WHERE id = ?", [profileId]);
  if (!profile) return [];
  const owner = await queryOne("SELECT u.id, u.name, u.email, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar FROM users u WHERE u.id = ?", [profile.user_id]);
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, pm.role, pm.status, pm.created_at AS invited_at, pm.accepted_at, pm.invited_by
     FROM profile_members pm JOIN users u ON u.id = pm.user_id WHERE pm.profile_id = ? ORDER BY FIELD(pm.role, 'manager', 'editor', 'viewer'), u.name`,
    [profileId]
  );
  return [{ ...owner, role: "owner", status: "active" }, ...rows];
}

/**
 * The profile plus what the user may do with its member list: the owner (or an admin working inside the
 * owner's workspace) and managers manage it, other active members may look at it.
 */
export async function profileForMembers(user, profileId, { manage = false } = {}) {
  const profile = await queryOne("SELECT id, user_id, name, color FROM profiles WHERE id = ?", [profileId]);
  if (!profile) throw new HttpError("Profile not found.", 404);
  let myRole = null;
  if (profile.user_id === user.home_id) myRole = "owner";
  else myRole = (await queryOne("SELECT role FROM profile_members WHERE profile_id = ? AND user_id = ? AND status = 'active'", [profileId, user.id]))?.role ?? null;
  if (!myRole) throw new HttpError("Profile not found.", 404);
  if (manage && ACCESS_RANK[myRole] < ACCESS_RANK.manager) throw new HttpError("Only the owner or a manager can manage who this profile is shared with.", 403);
  return { ...profile, my_role: myRole };
}
/** A manager handles viewers and editors; managers themselves are the owner's business. */
export function assertCanSetRole(myRole, currentRole, nextRole) {
  if (myRole === "owner") return;
  if (currentRole === "manager" || nextRole === "manager") throw new HttpError("Only the owner can add, change or remove a manager.", 403);
}

/* ---------- employee records and the accounts behind them ---------- */

/** Accounts an employee of this profile can be linked to: the owner and the active members. */
export async function linkableAccounts(profileId) {
  return (await membersOf(profileId)).filter((m) => m.status === "active").map(({ id, name, email, avatar, avatar_color, role }) => ({ id, name, email, avatar, avatar_color, role }));
}
/** Null, or the id when that account may be linked to an employee of the profile. */
export async function linkableId(profileId, userId) {
  if (userId == null || userId === "") return null;
  const id = Number(userId);
  if (!(await linkableAccounts(profileId)).some((a) => a.id === id)) throw new HttpError("Only the owner or an active member of this profile can be linked to an employee.", 400);
  return id;
}
/**
 * Link by email where nobody chose yet: an employee record whose email is the account's email is that person.
 * Runs when a member joins (userId) and when an employee is saved (employeeId).
 */
export async function autoLinkByEmail(profileId, { userId = null, employeeId = null } = {}) {
  if (userId) {
    const u = await queryOne("SELECT email FROM users WHERE id = ?", [userId]);
    if (u) await execute("UPDATE employees SET linked_user_id = ? WHERE profile_id = ? AND linked_user_id IS NULL AND LOWER(email) = LOWER(?)", [userId, profileId, u.email]);
    return;
  }
  const e = await queryOne("SELECT email, linked_user_id FROM employees WHERE id = ? AND profile_id = ?", [employeeId, profileId]);
  if (!e || e.linked_user_id) return;
  const match = (await linkableAccounts(profileId)).find((a) => a.email.toLowerCase() === String(e.email).toLowerCase());
  if (match) await execute("UPDATE employees SET linked_user_id = ? WHERE id = ?", [match.id, employeeId]);
}
/** Somebody lost access to a profile: their employee record there no longer points at them. */
export const unlinkMember = (profileId, userId) => execute("UPDATE employees SET linked_user_id = NULL WHERE profile_id = ? AND linked_user_id = ?", [profileId, userId]);

/** Drop every trace of an account from shared profiles (called when the account is deleted). */
export const forgetMember = async (userId) => {
  await execute("DELETE FROM profile_members WHERE user_id = ?", [userId]);
  await execute("UPDATE profile_members SET invited_by = NULL WHERE invited_by = ?", [userId]);
  await execute("UPDATE employees SET linked_user_id = NULL WHERE linked_user_id = ?", [userId]);
};
