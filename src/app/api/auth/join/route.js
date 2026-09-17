import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { findToken, useToken, publicMailSettings } from "@/lib/mail";
import { hashPassword, PASSWORD_MIN } from "@/lib/password";
import { finishLogin } from "@/lib/login";
import { setProfileCookie } from "@/lib/auth";
import { autoLinkByEmail } from "@/lib/sharing";
import { notify, notifyAdmins } from "@/lib/notifications";

const DEAD = "This invitation is no longer valid. Ask for a new one.";
async function invitation(token) {
  const row = await findToken("join", token);
  if (!row || !(await publicMailSettings()).invites) return null;
  const profile = await queryOne("SELECT p.id, p.name, p.user_id, o.name AS owner_name FROM profiles p JOIN users o ON o.id = p.user_id AND o.status = 'active' WHERE p.id = ?", [row.profile_id]);
  if (!profile) return null;
  const inviter = row.invited_by ? await queryOne("SELECT id, name FROM users WHERE id = ?", [row.invited_by]) : null;
  return { row, profile, inviter };
}

/** Public: what the invitation behind ?token= is about, so the page can greet the person. */
export const GET = handler(async (request) => {
  const inv = await invitation(new URL(request.url).searchParams.get("token"));
  if (!inv) return ok({ valid: false });
  const account = await queryOne("SELECT id FROM users WHERE LOWER(email) = ?", [inv.row.email]);
  return ok({ valid: true, email: inv.row.email, role: inv.row.role, profile_name: inv.profile.name, inviter_name: inv.inviter?.name ?? inv.profile.owner_name, has_account: Boolean(account), min_length: PASSWORD_MIN });
}, { auth: false });

/** Public: { token, name, password } creates the account, joins the profile and signs in. */
export const POST = handler(async (request) => {
  const body = await readJson(request);
  const inv = await invitation(body.token);
  if (!inv) throw new HttpError(DEAD, 410);
  const { row, profile, inviter } = inv;
  const existing = await queryOne("SELECT id FROM users WHERE LOWER(email) = ?", [row.email]);
  if (existing) {
    // somebody created the account in the meantime: turn the link into a normal invitation waiting under Profiles
    await execute("INSERT IGNORE INTO profile_members (profile_id, user_id, role, status, invited_by) VALUES (?, ?, ?, 'invited', ?)", [profile.id, existing.id, row.role, row.invited_by]);
    await useToken(row.id);
    throw new HttpError("An account with this email exists already. Sign in: the invitation is waiting under Profiles.", 409);
  }
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) throw new HttpError("Enter your name.", 400);
  const password = String(body.password ?? "");
  if (password.length < PASSWORD_MIN) throw new HttpError(`Password must be at least ${PASSWORD_MIN} characters.`, 400);
  // the link is spent first, so two fast clicks cannot make two accounts
  const used = await useToken(row.id);
  if (!used.affectedRows) throw new HttpError(DEAD, 410);

  const res = await execute("INSERT INTO users (name, email, role, status, password_hash) VALUES (?, ?, 'user', 'active', ?)", [name, row.email, hashPassword(password)]);
  const userId = res.insertId;
  await execute("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES (?, 'Personal', 'Default profile', '#6366f1', 1)", [userId]);
  await execute("INSERT INTO profile_members (profile_id, user_id, role, status, invited_by, accepted_at) VALUES (?, ?, ?, 'active', ?, NOW())", [profile.id, userId, row.role, row.invited_by]);
  await autoLinkByEmail(profile.id, { userId }).catch(() => {});
  // other workspaces that invited the same address: those become ordinary invitations to accept
  await execute("INSERT IGNORE INTO profile_members (profile_id, user_id, role, status, invited_by) SELECT profile_id, ?, role, 'invited', invited_by FROM mail_tokens WHERE purpose = 'join' AND email = ? AND used_at IS NULL AND expires_at > NOW() AND profile_id <> ?", [userId, row.email, profile.id]).catch(() => {});
  await execute("UPDATE mail_tokens SET used_at = NOW() WHERE purpose = 'join' AND email = ? AND used_at IS NULL", [row.email]);

  const user = await queryOne("SELECT * FROM users WHERE id = ?", [userId]);
  await finishLogin(request, user, { method: "join" });
  await setProfileCookie(profile.id); // land in the workspace they were invited to
  const told = [...new Set([profile.user_id, inviter?.id].filter(Boolean))];
  await Promise.all(told.map((id) => notify({ userId: id, type: "profile_joined", title: `${name} joined "${profile.name}"`, body: `As ${row.role}, with a new account (${row.email})`, href: "/profiles", entityType: "profile", entityId: profile.id, actorId: userId }).catch(() => {})));
  notifyAdmins({ id: userId }, { type: "user_created", title: `Account created by invitation: ${name}`, body: `${row.email} · invited by ${inviter?.name ?? profile.owner_name}`, href: "/users", entityType: "user", entityId: userId });
  return ok({ id: userId, name, email: row.email, profile_id: profile.id }, { status: 201 });
}, { auth: false });
