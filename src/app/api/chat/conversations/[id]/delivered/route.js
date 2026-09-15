import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, broadcast } from "@/lib/chat";

/** My device has received messages up to { message_id }: the senders' ticks turn to "delivered". */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  const upTo = Number((await readJson(request)).message_id) || 0;
  if (upTo <= 0) throw new HttpError("message_id is required.", 400);
  const inThread = await queryOne("SELECT 1 AS x FROM messages WHERE id = ? AND conversation_id = ?", [upTo, id]);
  if (!inThread) throw new HttpError("Message not found in this conversation.", 404);
  await execute("UPDATE conversation_members SET delivered_message_id = GREATEST(COALESCE(delivered_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?", [upTo, id, user.id]);
  const row = await queryOne("SELECT delivered_message_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [id, user.id]);
  broadcast(convo, { type: "delivered", conversation_id: id, user_id: user.id, delivered_message_id: row.delivered_message_id }, { except: user.id });
  return ok({ delivered_message_id: row.delivered_message_id });
});
