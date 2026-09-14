import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { conversationFor, publish } from "@/lib/chat";

/** Mark messages up to { message_id } as read; the other side sees "Seen". */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  const upTo = Number((await readJson(request)).message_id) || 0;
  if (upTo > 0) {
    await execute("UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?", [upTo, id, user.id]);
    await execute("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = ? AND type = 'chat_message' AND entity_type = 'conversation' AND entity_id = ?", [user.id, id]);
    publish(convo.user_id, { type: "read", conversation_id: id, user_id: user.id, last_read_message_id: upTo });
  }
  return ok(await conversationFor(id, user.id));
});
