import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, systemMessage, broadcast, deleteConversation, GROUP_TITLE_MAX } from "@/lib/chat";

/** One conversation with its members and read positions. */
export const GET = handler(async (_request, params, user) => ok(await conversationFor(requireId(params.id), user.id)));

/** Rename a group (owner only): { title }. */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Only group chats can be renamed.", 400);
  if (convo.my_role !== "owner") throw new HttpError("Only the group owner can rename it.", 403);
  const title = String((await readJson(request)).title ?? "").trim();
  if (!title) throw new HttpError("Give the group a name.", 400);
  if (title.length > GROUP_TITLE_MAX) throw new HttpError(`Group names can be up to ${GROUP_TITLE_MAX} characters.`, 400);
  if (title !== convo.title) {
    await execute("UPDATE conversations SET title = ? WHERE id = ?", [title, id]);
    await systemMessage({ ...convo, title }, user.id, "renamed", { title });
    broadcast(convo, { type: "conversation", conversation_id: id, action: "updated" });
  }
  return ok(await conversationFor(id, user.id));
});

/** Leave a group. The owner hands the group to its longest-standing member; the last member leaving deletes it. */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Direct chats cannot be left.", 400);
  const others = convo.members.filter((m) => m.id !== user.id);
  if (!others.length) {
    await deleteConversation(id);
    return ok({ id, deleted: true });
  }
  await execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [id, user.id]);
  const remaining = { ...convo, members: others };
  await systemMessage(remaining, user.id, "left");
  if (convo.my_role === "owner") {
    const heir = await queryOne("SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at, user_id LIMIT 1", [id]);
    if (heir) {
      await execute("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?", [id, heir.user_id]);
      await systemMessage(remaining, user.id, "owner", { names: [others.find((m) => m.id === heir.user_id)?.name].filter(Boolean) });
    }
  }
  broadcast(remaining, { type: "conversation", conversation_id: id, action: "updated" });
  return ok({ id, left: true });
});
