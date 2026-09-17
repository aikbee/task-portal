import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { MEMBER_ROLES, membersOf, profileForMembers, assertCanSetRole } from "@/lib/sharing";
import { notify } from "@/lib/notifications";
import { publicMailSettings, readMailSettings, issueToken, renderEmail, sendMail, linkTo, pendingInvites } from "@/lib/mail";
import { clientIp } from "@/lib/login";

/** Who the profile is shared with. Any active member may look; `can_manage` says whether they may change it. */
export const GET = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id));
  const can_manage = ["owner", "manager"].includes(profile.my_role);
  return ok({ profile, members: await membersOf(profile.id), pending: can_manage ? await pendingInvites(profile.id) : [], can_invite_new: (await publicMailSettings()).invites, can_manage });
});

/**
 * Invite { user_id } (a chat friend, say) or { email }, plus { role }. An existing account joins once it accepts.
 * An address without an account gets a 7-day link to create one, when the administrator allows such invitations.
 */
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
  if (!target && email) return inviteNewPerson(request, user, profile, email, role);
  if (!target) throw new HttpError("That account does not exist.", 404);
  if (target.id === profile.user_id) throw new HttpError("That person owns this profile.", 409);
  if (target.id === user.id) throw new HttpError("You are already in this profile.", 409);
  const existing = await queryOne("SELECT status FROM profile_members WHERE profile_id = ? AND user_id = ?", [profile.id, target.id]);
  if (existing) throw new HttpError(existing.status === "active" ? `${target.name} is already a member.` : `${target.name} has already been invited.`, 409);
  await execute("INSERT INTO profile_members (profile_id, user_id, role, status, invited_by) VALUES (?, ?, ?, 'invited', ?)", [profile.id, target.id, role, user.id]);
  await notify({ userId: target.id, type: "profile_invite", title: `${user.name} invited you to the profile "${profile.name}"`, body: `As ${role}. Open Profiles to accept or decline.`, href: "/profiles", entityType: "profile", entityId: profile.id, actorId: user.id, dedupeKey: `profile-invite:${profile.id}:${target.id}:${Date.now()}` }).catch(() => {});
  return ok({ members: await membersOf(profile.id) }, { status: 201 });
});

/** Nobody has that address yet: mail a link that creates the account and joins the profile in one go. */
async function inviteNewPerson(request, user, profile, email, role) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new HttpError("That does not look like an email address.", 400);
  if (await queryOne("SELECT id FROM users WHERE LOWER(email) = ?", [email])) throw new HttpError("The account with that email is disabled.", 409);
  const settings = await readMailSettings();
  if (!(settings.enabled && settings.configured && settings.allow_invites)) throw new HttpError("No active account uses that email. They need a portal account first.", 404);
  const sent = await queryOne("SELECT COUNT(*) AS n FROM mail_tokens WHERE purpose = 'join' AND invited_by = ? AND created_at > NOW() - INTERVAL 1 HOUR", [user.id]);
  if (Number(sent?.n) >= 10) throw new HttpError("That is a lot of invitations in one hour. Try again later.", 429);
  const waiting = await pendingInvites(profile.id);
  if (waiting.length >= 25 && !waiting.some((w) => w.email === email)) throw new HttpError("Too many invitations are waiting for an answer. Withdraw some first.", 409);
  // inviting the same address again replaces the earlier link
  await execute("DELETE FROM mail_tokens WHERE purpose = 'join' AND profile_id = ? AND email = ? AND used_at IS NULL", [profile.id, email]);
  const token = await issueToken({ purpose: "join", email, profileId: profile.id, role, invitedBy: user.id, ip: clientIp(request), hours: 24 * 7 });
  const { html, text } = renderEmail({
    title: `${user.name} invited you to Task Portal`,
    lines: [`${user.name} (${user.email}) wants to share the workspace "${profile.name}" with you as ${role}.`, "Choose a name and a password to create your account. The link works once and for 7 days.", "If you do not know this person, ignore this message: nothing happens without the link."],
    action: { label: "Accept and create my account", url: linkTo(settings, `/join?token=${token}`, request) },
  });
  const res = await sendMail({ to: email, subject: `${user.name} invited you to Task Portal`, text, html, kind: "join", settings });
  if (!res.ok) {
    await execute("DELETE FROM mail_tokens WHERE purpose = 'join' AND profile_id = ? AND email = ? AND used_at IS NULL", [profile.id, email]);
    throw new HttpError(`The invitation could not be sent: ${res.error}`, 502);
  }
  return ok({ members: await membersOf(profile.id), pending: await pendingInvites(profile.id), invited_by_email: email }, { status: 201 });
}
