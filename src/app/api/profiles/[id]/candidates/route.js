import { query } from "@/lib/db";
import { handler, ok, requireId } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";

/** People the inviter can pick from a list: their chat friends who are not in the profile yet. Anyone else goes by email. */
export const GET = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar
     FROM friendships f JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
     WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?) AND u.status = 'active' AND u.id <> ?
       AND u.id NOT IN (SELECT user_id FROM profile_members WHERE profile_id = ?)
     ORDER BY u.name`,
    [user.id, user.id, user.id, profile.user_id, profile.id]
  );
  return ok(rows);
});
