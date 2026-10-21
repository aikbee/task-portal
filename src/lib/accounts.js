import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { purgeTrashOf } from "./trash";
import { forgetMember } from "./sharing";
import { ATTACHMENT_KINDS, purgeFiles } from "./attachments";
import { pruneOrphanConversations, purgeMessagePhotos } from "./chat";
import { uploadedFileOf } from "./avatar-presets";
import { deleteStoredFile } from "./uploads";
import { notify } from "./notifications";

/**
 * Deleting an account, by its owner (Security page, the iPhone app) or by an administrator (Users). Everything that is
 * only theirs goes: their profiles with all that is inside (projects, people, tasks, requirements, events, draw
 * boards, the Info vault, the recycle bin), the files of all of it, their chat messages and the photos and files in
 * them, their sessions, passkeys, tokens and integrations. What they added to other people's shared profiles stays
 * there, as part of that profile. Members of profiles that go with the account are told.
 */

/** No portal without an administrator: the last active one cannot go. */
export async function isLastAdmin(userId) {
  const row = await queryOne("SELECT role, status FROM users WHERE id = ?", [userId]);
  if (row?.role !== "admin" || row.status !== "active") return false;
  const other = await queryOne("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [userId]);
  return Number(other?.n ?? 0) === 0;
}

/** What deleting the account would take with it, for the confirmation screen. */
export async function deletionSummary(userId) {
  const profiles = await query(
    `SELECT p.id, p.name, p.is_default,
       (SELECT COUNT(*) FROM profile_members pm WHERE pm.profile_id = p.id AND pm.status = 'active' AND pm.user_id <> p.user_id) AS members
     FROM profiles p WHERE p.user_id = ? ORDER BY p.is_default DESC, p.name`,
    [userId]
  );
  const count = async (sql) => Number((await queryOne(sql, [userId]))?.n ?? 0);
  const files = await Promise.all(Object.values(ATTACHMENT_KINDS).map((k) => count(`SELECT COUNT(*) AS n FROM ${k.table} a JOIN ${k.parentTable} p ON p.id = a.${k.parentCol} WHERE p.user_id = ?`)));
  return {
    last_admin: await isLastAdmin(userId),
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, is_default: Boolean(p.is_default), members: Number(p.members) })),
    counts: {
      projects: await count("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?"),
      tasks: await count("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?"),
      info_items: await count("SELECT COUNT(*) AS n FROM info_items WHERE user_id = ?"),
      chats: await count("SELECT COUNT(*) AS n FROM conversation_members WHERE user_id = ?"),
      messages: await count("SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?"),
      files: files.reduce((a, b) => a + b, 0) + (await count("SELECT COUNT(*) AS n FROM message_attachments a JOIN messages m ON m.id = a.message_id WHERE m.sender_id = ?")),
    },
  };
}

/** Delete the account. Throws 400 for the last administrator. Returns { id, name, email }. */
export async function deleteAccount(userId) {
  const user = await queryOne("SELECT id, name, email FROM users WHERE id = ?", [userId]);
  if (!user) throw new HttpError("User not found.", 404);
  if (await isLastAdmin(userId)) throw new HttpError("At least one active admin must remain.", 400);

  // who loses a shared profile with it (told once it is gone)
  const members = await query(
    `SELECT pm.user_id, p.id AS profile_id, p.name FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id
     WHERE p.user_id = ? AND pm.status = 'active' AND pm.user_id <> ?`,
    [userId, userId]
  );

  // files first: the rows that point at them go with the account
  await purgeTrashOf("p.user_id = ?", [userId]);
  for (const kind of Object.keys(ATTACHMENT_KINDS)) await purgeFiles(kind, "p.user_id = ?", [userId]);
  await purgeMessagePhotos("m.sender_id = ?", [userId]).catch(() => {});
  const pic = uploadedFileOf((await queryOne("SELECT avatar FROM users WHERE id = ?", [userId]))?.avatar);
  if (pic) await deleteStoredFile(pic).catch(() => {});

  // memberships carry no foreign key (see db/schema.sql): other people's in these profiles, and theirs elsewhere
  await execute("DELETE pm FROM profile_members pm JOIN profiles p ON p.id = pm.profile_id WHERE p.user_id = ?", [userId]);
  await forgetMember(userId);
  await execute("DELETE FROM mail_log WHERE to_email = ?", [user.email]).catch(() => {});
  await execute("DELETE FROM users WHERE id = ?", [userId]);
  await pruneOrphanConversations().catch(() => {});

  for (const m of members) {
    notify({ userId: m.user_id, type: "profile_removed", title: `“${m.name}” was deleted`, body: `${user.name} deleted their account, and the profile with it.`, href: "/", entityType: "profile", entityId: m.profile_id }).catch(() => {});
  }
  return user;
}
