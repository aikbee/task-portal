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

/**
 * Leave a group (the owner hands it to the longest-standing member; the last member leaving deletes it),
 * or — for a direct chat — delete it on your side only: the history up to now disappears for you, the
 * other person keeps theirs, and the chat comes back if either of you sends a new message.
 */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind === "direct") {
    await execute(
      "UPDATE conversation_members SET hidden_before_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?), archived_at = NULL, pinned_at = NULL WHERE conversation_id = ? AND user_id = ?",
      [id, id, user.id]
    );
    return ok({ id, hidden: true });
  }
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
