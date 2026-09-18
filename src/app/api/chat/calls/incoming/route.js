import { queryOne } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { shapeCall, CALL_RING_MS } from "@/lib/calls";
import { PEER_FIELDS } from "@/lib/chat";

/**
 * "Is somebody ringing me right now?" The ring itself is a live event that only open tabs see, so an app that is
 * opened from the call's push (or comes back to the foreground) asks here and shows the incoming call with the
 * time that is left. A direct call that is still ringing, or a group call that started less than a ring ago and
 * that I have neither joined nor dismissed. → { call, from, conversation_title, ms_left } or { call: null }.
 */
export const GET = handler(async (_request, _params, user) => {
  const since = new Date(Date.now() - CALL_RING_MS);
  const row =
    (await queryOne("SELECT * FROM calls WHERE callee_id = ? AND status = 'ringing' AND created_at > ? ORDER BY id DESC LIMIT 1", [user.id, since])) ??
    (await queryOne(
      "SELECT c.* FROM calls c JOIN call_participants p ON p.call_id = c.id AND p.user_id = ? AND p.status = 'ringing' WHERE c.callee_id IS NULL AND c.status = 'active' AND c.created_at > ? ORDER BY c.id DESC LIMIT 1",
      [user.id, since]
    ));
  if (!row) return ok({ call: null });
  const from = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [row.caller_id]);
  const convo = await queryOne("SELECT title FROM conversations WHERE id = ?", [row.conversation_id]);
  return ok({ call: await shapeCall(row), from, conversation_title: row.callee_id == null ? convo?.title ?? null : null, ms_left: Math.max(0, CALL_RING_MS - (Date.now() - new Date(row.created_at).getTime())) });
});
