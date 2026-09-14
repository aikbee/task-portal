import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, friendIdsAmong, systemMessage, broadcast, GROUP_MAX_MEMBERS, PEER_FIELDS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

/** Add friends of yours to a group: { user_ids[] }. Any member can add people. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Only group chats have members to add.", 400);
  const body = await readJson(request);
  const ids = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n !== user.id);
  if (!ids.length) throw new HttpError("Pick at least one friend.", 400);
  const already = ids.find((x) => convo.members.some((m) => m.id === x));
  if (already != null) throw new HttpError(`${convo.members.find((m) => m.id === already).name} is already in the group.`, 409);
  if (convo.members.length + ids.length > GROUP_MAX_MEMBERS) throw new HttpError(`Groups can have up to ${GROUP_MAX_MEMBERS} members.`, 400);
  const friends = await friendIdsAmong(user.id, ids);
  const stranger = ids.find((x) => !friends.has(x));
  if (stranger != null) {
    const exists = await queryOne("SELECT id FROM users WHERE id = ? AND status = 'active'", [stranger]);
    throw new HttpError(exists ? "You can only add your friends to a group." : "User not found.", exists ? 403 : 404);
  }
  await execute(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap((x) => [id, x]));
  const updated = await conversationFor(id, user.id);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  await systemMessage(updated, user.id, "added", { names: updated.members.filter((m) => ids.includes(m.id)).map((m) => m.name) });
  broadcast(updated, { type: "conversation", conversation_id: id, action: "updated" });
  for (const x of ids) {
    notify({ userId: x, type: "chat_group", title: `${me.name} added you to “${updated.title}”`, body: null, href: `/chat?c=${id}`, entityType: "conversation", entityId: id, actorId: user.id }).catch(() => {});
  }
  return ok(updated, { status: 201 });
});
