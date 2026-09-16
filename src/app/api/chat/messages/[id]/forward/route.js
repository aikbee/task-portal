import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, assertFriends, broadcast, recipientsOf, notifyMessage, messageById, copyAttachments, mutedMemberIds, unarchiveFor, PEER_FIELDS } from "@/lib/chat";

const MAX_TARGETS = 5;

/** Forward a message (text and attachments copied) into up to 5 chats you belong to: { conversation_ids: [] }. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const msg = await queryOne(
    `SELECT x.id, x.kind, x.body, x.deleted_at FROM messages x
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     WHERE x.id = ?`,
    [user.id, id]
  );
  if (!msg) throw new HttpError("Message not found.", 404);
  if (msg.kind === "system" || msg.kind === "call") throw new HttpError("System lines cannot be forwarded.", 400);
  if (msg.deleted_at) throw new HttpError("That message was deleted.", 400);
  const raw = (await readJson(request)).conversation_ids;
  const targets = [...new Set((Array.isArray(raw) ? raw : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!targets.length) throw new HttpError("Pick at least one chat.", 400);
  if (targets.length > MAX_TARGETS) throw new HttpError(`Pick up to ${MAX_TARGETS} chats.`, 400);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  const created = [];
  for (const cid of targets) {
    const convo = await conversationFor(cid, user.id);
    if (convo.kind === "direct") await assertFriends(user.id, convo.user_id);
    const r = await execute("INSERT INTO messages (conversation_id, sender_id, kind, body, forwarded) VALUES (?, ?, ?, ?, 1)", [cid, user.id, msg.kind, msg.body]);
    const copied = await copyAttachments(id, r.insertId);
    await execute("UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", [r.insertId, cid, user.id]);
    const message = await messageById(r.insertId);
    await unarchiveFor(cid, user.id);
    broadcast(convo, { type: "message", conversation_id: cid, message, from: me });
    const photos = copied.filter((a) => a.kind === "image").length;
    const voice = copied.find((a) => a.kind === "audio");
    const files = copied.filter((a) => a.kind === "file");
    const muted = new Set(await mutedMemberIds(cid));
    for (const rid of recipientsOf(convo, user.id).filter((x) => !muted.has(x))) notifyMessage(rid, me, convo, msg.body, photos, voice ? voice.duration_ms ?? 0 : null, files.length, files[0]?.original_name ?? "").catch(() => {});
    created.push(message);
  }
  return ok(created, { status: 201 });
});
