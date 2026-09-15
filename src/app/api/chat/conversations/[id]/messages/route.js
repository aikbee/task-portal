import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { saveBuffer } from "@/lib/uploads";
import { imageMeta, audioMeta } from "@/lib/images";
import { conversationFor, assertFriends, broadcast, recipientsOf, notifyMessage, withExtras, messageById, cleanMime, MESSAGE_SELECT, MESSAGE_FROM, MESSAGE_MAX, PHOTO_MAX_BYTES, FILE_MAX_BYTES, ATTACHMENTS_PER_MESSAGE, MESSAGE_MAX_BYTES, VOICE_MAX_MS, PEER_FIELDS } from "@/lib/chat";

/**
 * Messages of a conversation, oldest first: the newest page (?limit up to 100), earlier pages (?before=<id>),
 * or a window around one message (?around=<id>: up to 30 before it, the message, up to 30 after) for search jumps.
 */
export const GET = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await conversationFor(id, user.id);
  const sp = request.nextUrl.searchParams;
  const around = Number(sp.get("around")) || null;
  if (around) {
    const older = await query(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.conversation_id = ? AND x.id <= ? ORDER BY x.id DESC LIMIT 31`, [id, around]);
    const newer = await query(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.conversation_id = ? AND x.id > ? ORDER BY x.id ASC LIMIT 30`, [id, around]);
    return ok(await withExtras([...older.reverse(), ...newer]));
  }
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const before = Number(sp.get("before")) || null;
  const rows = await query(
    `SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.conversation_id = ? ${before ? "AND x.id < ?" : ""} ORDER BY x.id DESC LIMIT ${limit}`,
    before ? [id, before] : [id]
  );
  return ok(await withExtras(rows.reverse()));
});

/**
 * Send a message. JSON { body, reply_to? }, or multipart with "body" (optional caption), "reply_to" and attachments:
 *  - "files": up to 8 photos (JPEG, PNG, GIF, WebP, 10 MB each, downscaled by the browser) and/or any
 *    other files (20 MB each, 25 MB per message in total);
 *  - "voice": one recorded note (WebM, Ogg or MP4 audio, up to 5 minutes) with its "duration" in ms.
 * Photos and voice notes are checked by content. Direct chats need an accepted friendship; group chats need membership.
 */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind === "direct") await assertFriends(user.id, convo.user_id);

  let text = "";
  let replyTo = 0;
  const items = []; // { buf, kind, name, mime, width, height, duration }
  let total = 0;
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
    // refuse oversized uploads before buffering them
    if (Number(request.headers.get("content-length")) > MESSAGE_MAX_BYTES + 1024 * 1024) throw new HttpError("One message can carry up to 25 MB of files.", 413);
    const form = await request.formData();
    text = String(form.get("body") ?? "");
    replyTo = Number(form.get("reply_to")) || 0;
    const files = form.getAll("files").filter((f) => typeof f === "object" && f.size > 0);
    const voices = form.getAll("voice").filter((f) => typeof f === "object" && f.size > 0);
    if (files.length > ATTACHMENTS_PER_MESSAGE) throw new HttpError(`Up to ${ATTACHMENTS_PER_MESSAGE} attachments per message.`, 400);
    if (voices.length > 1) throw new HttpError("One voice message at a time.", 400);
    if (voices.length && files.length) throw new HttpError("Send a voice message on its own.", 400);
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const meta = imageMeta(buf);
      if (meta) {
        if (file.size > PHOTO_MAX_BYTES) throw new HttpError(`${file.name} is larger than 10 MB.`, 413);
        items.push({ buf, kind: "image", name: file.name || `photo.${meta.type}`, mime: meta.mime, width: meta.width || null, height: meta.height || null });
      } else {
        if (file.size > FILE_MAX_BYTES) throw new HttpError(`${file.name} is larger than 20 MB.`, 413);
        items.push({ buf, kind: "file", name: (file.name || "file").slice(0, 255), mime: cleanMime(file.type) });
      }
      total += buf.length;
      if (total > MESSAGE_MAX_BYTES) throw new HttpError("One message can carry up to 25 MB of files.", 413);
    }
    for (const file of voices) {
      if (file.size > PHOTO_MAX_BYTES) throw new HttpError("Voice messages can be up to 10 MB.", 413);
      const buf = Buffer.from(await file.arrayBuffer());
      const audio = audioMeta(buf);
      if (!audio) throw new HttpError("That is not a voice recording.", 400);
      const duration = Math.round(Number(form.get("duration")) || 0);
      if (duration > VOICE_MAX_MS) throw new HttpError("Voice messages can be up to 5 minutes.", 400);
      items.push({ buf, kind: "audio", name: file.name || `voice.${audio.type}`, mime: audio.mime, duration: duration > 0 ? duration : null });
    }
  } else {
    const json = await readJson(request);
    text = String(json.body ?? "");
    replyTo = Number(json.reply_to) || 0;
  }
  if (replyTo) {
    const quoted = await queryOne("SELECT id, kind, deleted_at FROM messages WHERE id = ? AND conversation_id = ?", [replyTo, id]);
    if (!quoted) throw new HttpError("That message is not in this conversation.", 400);
    if (quoted.kind === "system") throw new HttpError("System lines cannot be replied to.", 400);
    if (quoted.deleted_at) throw new HttpError("That message was deleted.", 400);
  }
  const photos = items.filter((i) => i.kind === "image");
  const plain = items.filter((i) => i.kind === "file");
  const voice = items.find((i) => i.kind === "audio") ?? null;
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body && !items.length) throw new HttpError("Message is empty.", 400);
  if (body.length > MESSAGE_MAX) throw new HttpError(`Messages can be up to ${MESSAGE_MAX} characters.`, 400);

  const r = await execute("INSERT INTO messages (conversation_id, sender_id, body, reply_to_id) VALUES (?, ?, ?, ?)", [id, user.id, body, replyTo || null]);
  let order = 1;
  for (const it of items) {
    const { storedName, size } = await saveBuffer(it.buf, it.name);
    await execute(
      "INSERT INTO message_attachments (message_id, kind, stored_name, original_name, mime_type, size_bytes, width, height, duration_ms, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [r.insertId, it.kind, storedName, it.name.slice(0, 255), it.mime, size, it.width ?? null, it.height ?? null, it.duration ?? null, order++]
    );
  }
  const message = await messageById(r.insertId);
  // the sender has read their own message
  await execute("UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", [message.id, id, user.id]);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  broadcast(convo, { type: "message", conversation_id: id, message, from: me });
  for (const rid of recipientsOf(convo, user.id)) notifyMessage(rid, me, convo, body, photos.length, voice ? voice.duration ?? 0 : null, plain.length, plain[0]?.name ?? "").catch(() => {});
  return ok(message, { status: 201 });
});
