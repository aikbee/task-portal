import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { memberIdsOf, publish, reactionsOf, REACTIONS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

/** Toggle an emoji reaction on a message: { emoji } (one of the quick reactions). Returns the message's reactions. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const emoji = String((await readJson(request)).emoji ?? "");
  if (!REACTIONS.includes(emoji)) throw new HttpError("Pick one of the quick reactions.", 400);
  const msg = await queryOne(
    `SELECT x.id, x.conversation_id, x.sender_id, x.kind, x.body, x.deleted_at, c.title, c.kind AS convo_kind
     FROM messages x JOIN conversations c ON c.id = x.conversation_id
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     WHERE x.id = ?`,
    [user.id, id]
  );
  if (!msg) throw new HttpError("Message not found.", 404);
  if (msg.kind === "system") throw new HttpError("System lines cannot be reacted to.", 400);
  if (msg.deleted_at) throw new HttpError("This message was deleted.", 400);
  const existing = await queryOne("SELECT 1 AS x FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [id, user.id, emoji]);
  if (existing) await execute("DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [id, user.id, emoji]);
  else await execute("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", [id, user.id, emoji]);
  const reactions = (await reactionsOf([id])).get(id) ?? [];
  const at = Date.now(); // lets clients drop a stale answer that arrives after a newer live event
  const members = await memberIdsOf(msg.conversation_id, user.id);
  for (const uid of members) publish(uid, { type: "reaction", conversation_id: msg.conversation_id, message_id: id, reactions, at });
  if (!existing && msg.sender_id !== user.id) {
    const preview = msg.body ? (msg.body.length > 60 ? `${msg.body.slice(0, 60)}…` : msg.body) : "📷 Photo";
    notify({
      userId: msg.sender_id,
      type: "chat_reaction",
      title: `${user.name} reacted ${emoji}${msg.convo_kind === "group" ? ` in ${msg.title}` : ""}`,
      body: preview,
      href: `/chat?c=${msg.conversation_id}`,
      entityType: "conversation",
      entityId: msg.conversation_id,
      actorId: user.id,
      dedupeKey: `reaction:${id}:${user.id}:${emoji}`,
      tag: `chat-${msg.conversation_id}`,
    }).catch(() => {});
  }
  return ok({ message_id: id, reactions, at, added: !existing });
});
