import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { conversationFor, friendIdsAmong, systemMessage, broadcast, pickGroupColor, GROUP_MAX_MEMBERS, GROUP_TITLE_MAX, PEER_FIELDS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

const cleanIds = (list, me) => [...new Set((Array.isArray(list) ? list : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n !== me);

/** Create a group chat: { title, member_ids[] } — everyone added must be a friend of yours. */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const title = String(body.title ?? "").trim();
  if (!title) throw new HttpError("Give the group a name.", 400);
  if (title.length > GROUP_TITLE_MAX) throw new HttpError(`Group names can be up to ${GROUP_TITLE_MAX} characters.`, 400);
  const ids = cleanIds(body.member_ids, user.id);
  if (!ids.length) throw new HttpError("Add at least one friend.", 400);
  if (ids.length + 1 > GROUP_MAX_MEMBERS) throw new HttpError(`Groups can have up to ${GROUP_MAX_MEMBERS} members.`, 400);
  const friends = await friendIdsAmong(user.id, ids);
  const stranger = ids.find((id) => !friends.has(id));
  if (stranger != null) {
    const exists = await queryOne("SELECT id FROM users WHERE id = ? AND status = 'active'", [stranger]);
    throw new HttpError(exists ? "You can only add your friends to a group." : "User not found.", exists ? 403 : 404);
  }
  const r = await execute("INSERT INTO conversations (kind, title, avatar_color, created_by) VALUES ('group', ?, ?, ?)", [title, pickGroupColor(), user.id]);
  const values = [[r.insertId, user.id, "owner"], ...ids.map((id) => [r.insertId, id, "member"])];
  await execute(`INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ${values.map(() => "(?, ?, ?)").join(", ")}`, values.flat());
  const convo = await conversationFor(r.insertId, user.id);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  await systemMessage(convo, user.id, "created", { title });
  await systemMessage(convo, user.id, "added", { names: convo.members.filter((m) => m.id !== user.id).map((m) => m.name) });
  broadcast(convo, { type: "conversation", conversation_id: convo.id, action: "updated" });
  for (const id of ids) {
    notify({ userId: id, type: "chat_group", title: `${me.name} added you to “${title}”`, body: null, href: `/chat?c=${convo.id}`, entityType: "conversation", entityId: convo.id, actorId: user.id }).catch(() => {});
  }
  return ok(await conversationFor(convo.id, user.id), { status: 201 });
});
