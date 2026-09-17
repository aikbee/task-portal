import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { MEMBER_ROLES, membersOf, profileForMembers, assertCanSetRole, unlinkMember } from "@/lib/sharing";
import { notify } from "@/lib/notifications";

async function memberRow(profileId, userId) {
  const row = await queryOne("SELECT pm.role, pm.status, u.name FROM profile_members pm JOIN users u ON u.id = pm.user_id WHERE pm.profile_id = ? AND pm.user_id = ?", [profileId, userId]);
  if (!row) throw new HttpError("That person is not in this profile.", 404);
  return row;
}

/** { role }: change what a member may do. */
export const PUT = handler(async (request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const memberId = requireId(params.userId);
  const { role } = await readJson(request);
  if (!MEMBER_ROLES.includes(role)) throw new HttpError("Role must be viewer, editor or manager.", 400);
  const member = await memberRow(profile.id, memberId);
  if (memberId === user.id) throw new HttpError("You cannot change your own role.", 400);
  assertCanSetRole(profile.my_role, member.role, role);
  if (member.role !== role) {
    await execute("UPDATE profile_members SET role = ? WHERE profile_id = ? AND user_id = ?", [role, profile.id, memberId]);
    if (member.status === "active") await notify({ userId: memberId, type: "profile_role", title: `You are now ${role} in "${profile.name}"`, body: `Changed by ${user.name}`, href: "/profiles", entityType: "profile", entityId: profile.id, actorId: user.id }).catch(() => {});
  }
  return ok({ members: await membersOf(profile.id) });
});

/** Remove a member or withdraw an invitation. */
export const DELETE = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const memberId = requireId(params.userId);
  const member = await memberRow(profile.id, memberId);
  if (memberId === user.id) throw new HttpError("Use Leave to remove yourself.", 400);
  assertCanSetRole(profile.my_role, member.role, null);
  await execute("DELETE FROM profile_members WHERE profile_id = ? AND user_id = ?", [profile.id, memberId]);
  await unlinkMember(profile.id, memberId);
  if (member.status === "active") await notify({ userId: memberId, type: "profile_removed", title: `You no longer have access to "${profile.name}"`, body: `Removed by ${user.name}`, href: "/profiles", entityType: "profile", entityId: profile.id, actorId: user.id }).catch(() => {});
  else await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'profile_invite' AND entity_type = 'profile' AND entity_id = ? AND read_at IS NULL", [memberId, profile.id]).catch(() => {});
  return ok({ members: await membersOf(profile.id) });
});
