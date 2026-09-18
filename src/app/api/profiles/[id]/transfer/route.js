import { query } from "@/lib/db";
import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { transferProfile } from "@/lib/sharing";
import { notify } from "@/lib/notifications";

/** Owner only: { user_id, keep_role: manager | editor | viewer | null } hands the profile to that member. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const body = await readJson(request);
  const res = await transferProfile(user, id, { toUserId: body.user_id, keepRole: "keep_role" in body ? body.keep_role || null : "manager" });
  const others = (await query("SELECT user_id FROM profile_members WHERE profile_id = ? AND status = 'active' AND user_id NOT IN (?, ?)", [id, res.owner.id, user.id])).map((r) => r.user_id);
  await notify({ userId: res.owner.id, type: "profile_role", title: `${user.name} made you the owner of "${res.name}"`, body: res.kept_role ? `${user.name} stays as ${res.kept_role}.` : `${user.name} left the profile.`, href: "/profiles", entityType: "profile", entityId: id, actorId: user.id }).catch(() => {});
  await Promise.all(others.map((uid) => notify({ userId: uid, type: "profile_role", title: `"${res.name}" is now owned by ${res.owner.name}`, body: `Handed over by ${user.name}.`, href: "/profiles", entityType: "profile", entityId: id, actorId: user.id }).catch(() => {})));
  return ok(res);
});
