import { execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";
import { pendingInvites } from "@/lib/mail";

/** Withdraw an invitation that went to somebody without an account: the link in their mail stops working. */
export const DELETE = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const res = await execute("DELETE FROM mail_tokens WHERE id = ? AND purpose = 'join' AND profile_id = ? AND used_at IS NULL", [requireId(params.inviteId), profile.id]);
  if (!res.affectedRows) throw new HttpError("Invitation not found.", 404);
  return ok({ pending: await pendingInvites(profile.id) });
});
