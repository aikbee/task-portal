import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, assertFriends, publish, notifyMessage, MESSAGE_MAX, PEER_FIELDS } from "@/lib/chat";

/** Messages of a conversation, oldest first (?before=<id> for earlier pages, ?limit up to 100). */
export const GET = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await conversationFor(id, user.id);
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const before = Number(sp.get("before")) || null;
  const rows = await query(
    `SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT ${limit}`,
    before ? [id, before] : [id]
  );
  return ok(rows.reverse());
});

/** Send a message: { body }. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  await assertFriends(user.id, convo.user_id);
  const body = String((await readJson(request)).body ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new HttpError("Message is empty.", 400);
  if (body.length > MESSAGE_MAX) throw new HttpError(`Messages can be up to ${MESSAGE_MAX} characters.`, 400);
  const r = await execute("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)", [id, user.id, body]);
  const message = await queryOne("SELECT id, sender_id, body, created_at FROM messages WHERE id = ?", [r.insertId]);
  // the sender has read their own message
  await execute("UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", [message.id, id, user.id]);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  publish(convo.user_id, { type: "message", conversation_id: id, message, from: me });
  publish(user.id, { type: "message", conversation_id: id, message, from: me });
  notifyMessage(convo.user_id, me, id, body).catch(() => {});
  return ok(message, { status: 201 });
});
