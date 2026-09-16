import { execute, query, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";

/** Report someone else's message to the administrators: { reason }. One open report per person and message. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const msg = await queryOne(
    `SELECT x.id, x.conversation_id, x.sender_id, x.kind, x.body, x.deleted_at, c.kind AS convo_kind, c.title, s.name AS sender_name
     FROM messages x JOIN conversations c ON c.id = x.conversation_id
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     LEFT JOIN users s ON s.id = x.sender_id WHERE x.id = ?`,
    [user.id, id]
  );
  if (!msg) throw new HttpError("Message not found.", 404);
  if (msg.sender_id === user.id) throw new HttpError("You cannot report your own message.", 400);
  if (msg.kind === "system" || msg.kind === "call" || msg.deleted_at) throw new HttpError("There is nothing to report on this message.", 400);
  const reason = String((await readJson(request)).reason ?? "").trim().slice(0, 500);
  if (!reason) throw new HttpError("Say what is wrong with the message.", 400);
  const dup = await queryOne("SELECT id FROM message_reports WHERE message_id = ? AND reporter_id = ? AND status = 'open'", [id, user.id]);
  if (dup) throw new HttpError("You already reported this message; an administrator will look at it.", 409);
  const files = await query("SELECT original_name FROM message_attachments WHERE message_id = ? ORDER BY sort_order, id", [id]);
  const peer = msg.convo_kind === "direct" ? await queryOne("SELECT u.name FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? AND m.user_id <> ? LIMIT 1", [msg.conversation_id, user.id]) : null;
  const snapshot = {
    body: msg.kind === "location" ? "📍 Location" : String(msg.body ?? "").slice(0, 4000),
    sender_name: msg.sender_name ?? "Deleted account",
    reporter_name: user.name,
    conversation: msg.convo_kind === "group" ? msg.title : `${user.name} ↔ ${peer?.name ?? "Deleted account"}`,
    attachments: files.map((f) => f.original_name),
  };
  const r = await execute("INSERT INTO message_reports (conversation_id, message_id, reporter_id, sender_id, reason, snapshot) VALUES (?, ?, ?, ?, ?, ?)", [msg.conversation_id, id, user.id, msg.sender_id, reason, JSON.stringify(snapshot)]);
  return ok({ id: r.insertId, message_id: id, status: "open" }, { status: 201 });
});
