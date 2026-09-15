import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, broadcast } from "@/lib/chat";

/** Mark messages up to { message_id } as read; the others see it as read on every message up to there. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  const upTo = Number((await readJson(request)).message_id) || 0;
  if (upTo > 0) {
    const inThread = await queryOne("SELECT 1 AS x FROM messages WHERE id = ? AND conversation_id = ?", [upTo, id]);
    if (!inThread) throw new HttpError("Message not found in this conversation.", 404);
    await execute("UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?", [upTo, id, user.id]);
    await execute("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = ? AND type IN ('chat_message', 'chat_group', 'chat_reaction', 'chat_mention') AND entity_type = 'conversation' AND entity_id = ?", [user.id, id]);
    broadcast(convo, { type: "read", conversation_id: id, user_id: user.id, last_read_message_id: upTo }, { except: user.id });
  }
  return ok(await conversationFor(id, user.id));
});
