import { execute, query, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { editableMessage, messageById, memberIdsOf, publish, purgeMessagePhotos, conversationFor, readMentions, mentionTargets, saveMentions, notifyMention, MESSAGE_MAX, PEER_FIELDS } from "@/lib/chat";

async function announce(conversationId, userId, message) {
  const ids = await memberIdsOf(conversationId, userId);
  for (const uid of ids) publish(uid, { type: "message_updated", conversation_id: conversationId, message });
}

/** Edit the text of your own message: { body }. Photos and voice notes keep their files; only the text changes. */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const msg = await editableMessage(id, user.id);
  const json = await readJson(request);
  const body = String(json.body ?? "").replace(/\r\n/g, "\n").trim();
  const hasFiles = (await query("SELECT 1 AS x FROM message_attachments WHERE message_id = ? LIMIT 1", [id])).length > 0;
  if (!body && !hasFiles) throw new HttpError("Message is empty.", 400);
  if (body.length > MESSAGE_MAX) throw new HttpError(`Messages can be up to ${MESSAGE_MAX} characters.`, 400);
  if (body !== msg.body) await execute("UPDATE messages SET body = ?, edited_at = NOW() WHERE id = ?", [body, id]);
  // mentions follow the edited text; people mentioned for the first time are told
  const convo = await conversationFor(msg.conversation_id, user.id);
  if (convo.kind === "group") {
    const before = new Set((await query("SELECT user_id FROM message_mentions WHERE message_id = ?", [id])).map((r) => r.user_id));
    const ids = mentionTargets(convo, user.id, readMentions(json));
    await saveMentions(id, ids);
    const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
    for (const uid of ids) if (!before.has(uid)) notifyMention(uid, me, convo, body).catch(() => {});
  }
  const message = await messageById(id);
  await announce(msg.conversation_id, user.id, message);
  return ok(message);
});

/**
 * Delete a message (yours, or anyone's in a group you own). The row stays as a placeholder so the thread
 * keeps its shape; the text, photos, voice note and reactions are removed.
 */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const msg = await editableMessage(id, user.id, { forDelete: true });
  await purgeMessagePhotos("m.id = ?", [id]).catch(() => {});
  await execute("DELETE FROM message_attachments WHERE message_id = ?", [id]);
  await execute("DELETE FROM message_reactions WHERE message_id = ?", [id]);
  await execute("DELETE FROM message_mentions WHERE message_id = ?", [id]);
  await execute("UPDATE messages SET body = '', deleted_at = NOW(), edited_at = NULL WHERE id = ?", [id]);
  const message = await messageById(id);
  await announce(msg.conversation_id, user.id, message);
  return ok(message);
});
