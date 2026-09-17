import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { MEMBER_ROLES, membersOf, profileForMembers, assertCanSetRole } from "@/lib/sharing";
import { notify } from "@/lib/notifications";

/** Who the profile is shared with. Any active member may look; `can_manage` says whether they may change it. */
export const GET = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id));
  return ok({ profile, members: await membersOf(profile.id), can_manage: ["owner", "manager"].includes(profile.my_role) });
});

/** Invite an existing account: { user_id } (a chat friend, say) or { email }, plus { role }. They join once they accept. */
export const POST = handler(async (request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const body = await readJson(request);
  const role = body.role ?? "viewer";
  if (!MEMBER_ROLES.includes(role)) throw new HttpError("Role must be viewer, editor or manager.", 400);
  assertCanSetRole(profile.my_role, null, role);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const target = body.user_id
    ? await queryOne("SELECT id, name FROM users WHERE id = ? AND status = 'active'", [Number(body.user_id) || 0])
    : email
      ? await queryOne("SELECT id, name FROM users WHERE LOWER(email) = ? AND status = 'active'", [email])
      : null;
  if (!body.user_id && !email) throw new HttpError("Pick a person or enter their email.", 400);
  if (!target) throw new HttpError(email ? "No active account uses that email. They need a portal account first." : "That account does not exist.", 404);
  if (target.id === profile.user_id) throw new HttpError("That person owns this profile.", 409);
  if (target.id === user.id) throw new HttpError("You are already in this profile.", 409);
  const existing = await queryOne("SELECT status FROM profile_members WHERE profile_id = ? AND user_id = ?", [profile.id, target.id]);
  if (existing) throw new HttpError(existing.status === "active" ? `${target.name} is already a member.` : `${target.name} has already been invited.`, 409);
  await execute("INSERT INTO profile_members (profile_id, user_id, role, status, invited_by) VALUES (?, ?, ?, 'invited', ?)", [profile.id, target.id, role, user.id]);
  await notify({ userId: target.id, type: "profile_invite", title: `${user.name} invited you to the profile "${profile.name}"`, body: `As ${role}. Open Profiles to accept or decline.`, href: "/profiles", entityType: "profile", entityId: profile.id, actorId: user.id, dedupeKey: `profile-invite:${profile.id}:${target.id}:${Date.now()}` }).catch(() => {});
  return ok({ members: await membersOf(profile.id) }, { status: 201 });
});
