import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { saveBuffer } from "@/lib/uploads";
import { imageMeta, audioMeta } from "@/lib/images";
import { conversationFor, assertFriends, broadcast, recipientsOf, notifyMessage, withExtras, messageById, MESSAGE_SELECT, MESSAGE_FROM, MESSAGE_MAX, PHOTO_MAX_BYTES, PHOTOS_PER_MESSAGE, VOICE_MAX_MS, PEER_FIELDS } from "@/lib/chat";

/** Messages of a conversation, oldest first (?before=<id> for earlier pages, ?limit up to 100). */
export const GET = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await conversationFor(id, user.id);
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const before = Number(sp.get("before")) || null;
  const rows = await query(
    `SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.conversation_id = ? ${before ? "AND x.id < ?" : ""} ORDER BY x.id DESC LIMIT ${limit}`,
    before ? [id, before] : [id]
  );
  return ok(await withExtras(rows.reverse()));
});

/**
 * Send a message. JSON { body }, or multipart with "body" (optional caption) and either up to 8 photo
 * "files" (JPEG, PNG, GIF or WebP, 10 MB each) or one voice note (WebM, Ogg or MP4 audio, 10 MB, up to
 * 5 minutes, with its "duration" in ms). Files are checked by content. Direct chats need an accepted
 * friendship; group chats need membership.
 */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind === "direct") await assertFriends(user.id, convo.user_id);

  let text = "";
  const photos = [];
  let voice = null;
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await request.formData();
    text = String(form.get("body") ?? "");
    const files = form.getAll("files").filter((f) => typeof f === "object" && f.size > 0);
    if (files.length > PHOTOS_PER_MESSAGE) throw new HttpError(`Up to ${PHOTOS_PER_MESSAGE} photos per message.`, 400);
    for (const file of files) {
      if (file.size > PHOTO_MAX_BYTES) throw new HttpError(`${file.name} is larger than 10 MB.`, 413);
      const buf = Buffer.from(await file.arrayBuffer());
      const meta = imageMeta(buf);
      if (meta) {
        photos.push({ buf, meta, name: file.name || `photo.${meta.type}` });
        continue;
      }
      const audio = audioMeta(buf);
      if (!audio) throw new HttpError(`${file.name} is not a JPEG, PNG, GIF or WebP image, nor a voice recording.`, 400);
      if (voice) throw new HttpError("One voice message at a time.", 400);
      const duration = Math.round(Number(form.get("duration")) || 0);
      if (duration > VOICE_MAX_MS) throw new HttpError("Voice messages can be up to 5 minutes.", 400);
      voice = { buf, meta: audio, name: file.name || `voice.${audio.type}`, duration: duration > 0 ? duration : null };
    }
    if (voice && photos.length) throw new HttpError("Send photos and a voice message separately.", 400);
  } else {
    text = String((await readJson(request)).body ?? "");
  }
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body && !photos.length && !voice) throw new HttpError("Message is empty.", 400);
  if (body.length > MESSAGE_MAX) throw new HttpError(`Messages can be up to ${MESSAGE_MAX} characters.`, 400);

  const r = await execute("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)", [id, user.id, body]);
  let order = 1;
  for (const p of photos) {
    const { storedName, size } = await saveBuffer(p.buf, p.name);
    await execute(
      "INSERT INTO message_attachments (message_id, stored_name, original_name, mime_type, size_bytes, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [r.insertId, storedName, p.name.slice(0, 255), p.meta.mime, size, p.meta.width || null, p.meta.height || null, order++]
    );
  }
  if (voice) {
    const { storedName, size } = await saveBuffer(voice.buf, voice.name);
    await execute("INSERT INTO message_attachments (message_id, stored_name, original_name, mime_type, size_bytes, duration_ms, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1)", [
      r.insertId,
      storedName,
      voice.name.slice(0, 255),
      voice.meta.mime,
      size,
      voice.duration,
    ]);
  }
  const message = await messageById(r.insertId);
  // the sender has read their own message
  await execute("UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", [message.id, id, user.id]);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  broadcast(convo, { type: "message", conversation_id: id, message, from: me });
  for (const rid of recipientsOf(convo, user.id)) notifyMessage(rid, me, convo, body, photos.length, voice ? voice.duration ?? 0 : null).catch(() => {});
  return ok(message, { status: 201 });
});
