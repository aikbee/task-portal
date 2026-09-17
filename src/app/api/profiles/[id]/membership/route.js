import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { setProfileCookie } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { autoLinkByEmail, unlinkMember } from "@/lib/sharing";

async function mine(profileId, userId) {
  const row = await queryOne(
    "SELECT pm.role, pm.status, pm.invited_by, p.name, p.user_id AS owner_id FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id WHERE pm.profile_id = ? AND pm.user_id = ?",
    [profileId, userId]
  );
  if (!row) throw new HttpError("There is no invitation to that profile.", 404);
  return row;
}
const tell = (ids, payload) => Promise.all([...new Set(ids.filter(Boolean))].map((userId) => notify({ ...payload, userId }).catch(() => {})));

/** My own membership: { accept: true } joins, { accept: false } declines the invitation. */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const { accept } = await readJson(request);
  const row = await mine(id, user.id);
  if (row.status === "active") throw new HttpError("You are already a member.", 409);
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'profile_invite' AND entity_type = 'profile' AND entity_id = ?", [user.id, id]).catch(() => {});
  if (accept) {
    await execute("UPDATE profile_members SET status = 'active', accepted_at = NOW() WHERE profile_id = ? AND user_id = ?", [id, user.id]);
    await autoLinkByEmail(id, { userId: user.id }); // an employee record with my email is me
    await tell([row.owner_id, row.invited_by], { type: "profile_joined", title: `${user.name} joined "${row.name}"`, body: `As ${row.role}`, href: "/profiles", entityType: "profile", entityId: id, actorId: user.id });
    return ok({ id, status: "active", role: row.role });
  }
  await execute("DELETE FROM profile_members WHERE profile_id = ? AND user_id = ?", [id, user.id]);
  await tell([row.invited_by ?? row.owner_id], { type: "profile_joined", title: `${user.name} declined the invitation to "${row.name}"`, href: "/profiles", entityType: "profile", entityId: id, actorId: user.id });
  return ok({ id, status: "declined" });
});

/** Leave a profile that was shared with me. */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const row = await mine(id, user.id);
  await execute("DELETE FROM profile_members WHERE profile_id = ? AND user_id = ?", [id, user.id]);
  await unlinkMember(id, user.id);
  if (user.profile_id === id) await setProfileCookie(null); // back to my own default profile
  if (row.status === "active") await tell([row.owner_id], { type: "profile_joined", title: `${user.name} left "${row.name}"`, href: "/profiles", entityType: "profile", entityId: id, actorId: user.id });
  return ok({ id });
});
