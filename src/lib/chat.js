import crypto from "node:crypto";
import { deleteStoredFile } from "./uploads";
import QRCode from "qrcode";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { notify } from "./notifications";

/* ---------- live events: one in-process bus per user (a single pm2 process serves the app) ---------- */
const bus = globalThis.__chatBus ?? (globalThis.__chatBus = new Map());
export function subscribe(userId, fn) {
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) bus.delete(userId);
  };
}
export function publish(userId, event) {
  const set = bus.get(userId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {}
  }
}

export const PEER_FIELDS = "u.id, u.name, u.avatar_color, u.email";
/** Same person columns for conversation rows, where `id` is the conversation and the person is `user_id`. */
export const CONVO_PEER = "u.id AS user_id, u.name, u.avatar_color, u.email";
export const MESSAGE_MAX = 4000;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTOS_PER_MESSAGE = 8;
export const VOICE_MAX_MS = 5 * 60 * 1000;

/* ---------- friend codes ---------- */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function generateCode() {
  const b = crypto.randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export function normaliseCode(code) {
  const n = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n.length === 12 ? `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}` : null;
}
export async function rotateFriendCode(userId) {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      await execute("UPDATE users SET friend_code = ? WHERE id = ?", [code, userId]);
      return code;
    } catch (e) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw new HttpError("Could not generate a friend code.", 500);
}
export async function ensureFriendCode(userId) {
  const row = await queryOne("SELECT friend_code FROM users WHERE id = ?", [userId]);
  return row?.friend_code || rotateFriendCode(userId);
}
export async function findByCode(code) {
  const pretty = normaliseCode(code);
  if (!pretty) return null;
  return queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.friend_code = ? AND u.status = 'active'`, [pretty]);
}
export const friendLink = (origin, code) => `${origin}/chat?add=${encodeURIComponent(code)}`;
export const friendQr = (origin, code) => QRCode.toDataURL(friendLink(origin, code), { margin: 1, width: 220, errorCorrectionLevel: "M" });

/* ---------- friendships ---------- */
export async function friendshipBetween(a, b) {
  return queryOne("SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", [a, b, b, a]);
}
export async function assertFriends(a, b) {
  const f = await friendshipBetween(a, b);
  if (!f || f.status !== "accepted") throw new HttpError("You can only chat with friends.", 403);
  return f;
}
export async function friendsOverview(userId) {
  const friends = await query(
    `SELECT f.id AS friendship_id, ${PEER_FIELDS}, f.responded_at AS since
     FROM friendships f JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
     WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted' ORDER BY u.name`,
    [userId, userId, userId]
  );
  const incoming = await query(`SELECT f.id AS request_id, ${PEER_FIELDS}, f.created_at FROM friendships f JOIN users u ON u.id = f.requester_id WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [userId]);
  const outgoing = await query(`SELECT f.id AS request_id, ${PEER_FIELDS}, f.created_at FROM friendships f JOIN users u ON u.id = f.addressee_id WHERE f.requester_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [userId]);
  const blocked = await query(
    `SELECT f.id AS friendship_id, ${PEER_FIELDS} FROM friendships f JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
     WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'blocked' AND f.blocked_by = ? ORDER BY u.name`,
    [userId, userId, userId, userId]
  );
  return { friends, incoming, outgoing, blocked };
}
/** The relationship between me and another user, for the add-friend preview. */
export function relationOf(f, me) {
  if (!f) return "none";
  if (f.status === "accepted") return "friends";
  if (f.status === "blocked") return f.blocked_by === me ? "blocked" : "unavailable";
  return f.requester_id === me ? "outgoing" : "incoming";
}

/* ---------- conversations (direct or group) ---------- */
export const GROUP_MAX_MEMBERS = 50;
export const GROUP_TITLE_MAX = 80;
const GROUP_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];
export const pickGroupColor = () => GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];

export async function directConversation(a, b, { create = false } = {}) {
  const row = await queryOne(
    `SELECT c.id FROM conversations c
     JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
     JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
     WHERE c.kind = 'direct' LIMIT 1`,
    [a, b]
  );
  if (row) return row.id;
  if (!create) return null;
  const r = await execute("INSERT INTO conversations (kind) VALUES ('direct')");
  await execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)", [r.insertId, a, r.insertId, b]);
  return r.insertId;
}

async function membersOf(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await query(
    `SELECT m.conversation_id, m.role, m.last_read_message_id, ${PEER_FIELDS}
     FROM conversation_members m JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id IN (${ids.map(() => "?").join(",")}) ORDER BY m.joined_at, u.id`,
    ids
  );
  for (const r of rows) map.set(r.conversation_id, [...(map.get(r.conversation_id) ?? []), r]);
  return map;
}
async function friendStatuses(me, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const marks = ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT requester_id, addressee_id, status FROM friendships WHERE (requester_id = ? AND addressee_id IN (${marks})) OR (addressee_id = ? AND requester_id IN (${marks}))`,
    [me, ...ids, me, ...ids]
  );
  for (const r of rows) map.set(r.requester_id === me ? r.addressee_id : r.requester_id, r.status);
  return map;
}
/** The row a client sees: `name` / `avatar_color` are the peer (direct) or the group title / colour. */
function shapeConversation(row, members, statuses, me) {
  const mine = members.find((x) => x.id === me);
  const base = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    my_role: mine?.role ?? "member",
    members: members.map(({ id, name, avatar_color, email, role, last_read_message_id }) => ({ id, name, avatar_color, email, role, last_read_message_id })),
    member_count: members.length,
    last_read_message_id: row.last_read_message_id,
    unread: Number(row.unread ?? 0),
    last_id: row.last_id,
    last_kind: row.last_kind,
    last_body: row.last_body,
    last_deleted: row.last_deleted ?? null,
    last_sender_id: row.last_sender_id,
    last_sender_name: row.last_sender_name,
    last_at: row.last_at,
    last_photos: Number(row.last_photos ?? 0),
    last_voice: row.last_voice ?? null,
  };
  if (row.kind === "group") return { ...base, name: row.title, avatar_color: row.group_color, email: null, user_id: null, friend_status: null, peer_last_read: null };
  const peer = members.find((x) => x.id !== me);
  return {
    ...base,
    name: peer?.name ?? "Deleted account",
    avatar_color: peer?.avatar_color ?? "#94a3b8",
    email: peer?.email ?? null,
    user_id: peer?.id ?? null,
    friend_status: peer ? (statuses.get(peer.id) ?? null) : null,
    peer_last_read: peer?.last_read_message_id ?? null,
  };
}
async function loadConversations(userId, onlyId = null) {
  const rows = await query(
    `SELECT c.id, c.kind, c.title, c.avatar_color AS group_color, m.last_read_message_id,
       (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.sender_id <> ? AND x.kind = 'text' AND x.deleted_at IS NULL AND x.id > COALESCE(m.last_read_message_id, 0)) AS unread,
       lm.id AS last_id, lm.kind AS last_kind, lm.body AS last_body, lm.deleted_at AS last_deleted, lm.sender_id AS last_sender_id, lm.created_at AS last_at, ls.name AS last_sender_name,
       (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = lm.id AND a.mime_type NOT LIKE 'audio/%') AS last_photos,
       (SELECT a.duration_ms FROM message_attachments a WHERE a.message_id = lm.id AND a.mime_type LIKE 'audio/%' LIMIT 1) AS last_voice
     FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id)
     LEFT JOIN users ls ON ls.id = lm.sender_id
     ${onlyId ? "WHERE c.id = ?" : ""}
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    onlyId ? [userId, userId, onlyId] : [userId, userId]
  );
  const members = await membersOf(rows.map((r) => r.id));
  const peerIds = rows.filter((r) => r.kind === "direct").flatMap((r) => (members.get(r.id) ?? []).filter((x) => x.id !== userId).map((x) => x.id));
  const statuses = await friendStatuses(userId, peerIds);
  return rows.map((r) => shapeConversation(r, members.get(r.id) ?? [], statuses, userId));
}
export const conversationsOf = (userId) => loadConversations(userId);
/** A conversation the user belongs to (404 otherwise). */
export async function conversationFor(conversationId, userId) {
  const [c] = await loadConversations(userId, conversationId);
  if (!c) throw new HttpError("Conversation not found.", 404);
  return c;
}
export const recipientsOf = (convo, me) => convo.members.map((m) => m.id).filter((id) => id !== me);
/** Member ids of a conversation the user belongs to (one query; 404 otherwise). */
export async function memberIdsOf(conversationId, userId) {
  const rows = await query("SELECT user_id FROM conversation_members WHERE conversation_id = ?", [conversationId]);
  const ids = rows.map((r) => r.user_id);
  if (!ids.includes(userId)) throw new HttpError("Conversation not found.", 404);
  return ids;
}
/** Send a live event to every member (optionally skipping one). */
export function broadcast(convo, event, { except = null } = {}) {
  for (const m of convo.members) if (m.id !== except) publish(m.id, event);
}
/** Which of `ids` are accepted friends of `userId`. */
export async function friendIdsAmong(userId, ids) {
  if (!ids.length) return new Set();
  const marks = ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT IF(requester_id = ?, addressee_id, requester_id) AS other FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id IN (${marks})) OR (addressee_id = ? AND requester_id IN (${marks})))`,
    [userId, userId, ...ids, userId, ...ids]
  );
  return new Set(rows.map((r) => r.other));
}
export async function chatBadge(userId) {
  const row = await queryOne(
    `SELECT
      (SELECT COUNT(*) FROM messages x JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ? WHERE x.sender_id <> ? AND x.kind = 'text' AND x.deleted_at IS NULL AND x.id > COALESCE(m.last_read_message_id, 0)) AS unread,
      (SELECT COUNT(*) FROM friendships f WHERE f.addressee_id = ? AND f.status = 'pending') AS pending`,
    [userId, userId, userId]
  );
  return { unread: Number(row?.unread ?? 0), pending: Number(row?.pending ?? 0) };
}

/* ---------- messages ---------- */
export const MESSAGE_SELECT = "x.id, x.conversation_id, x.sender_id, x.kind, x.body, x.created_at, x.edited_at, x.deleted_at, s.name AS sender_name, s.avatar_color AS sender_color";
export const MESSAGE_FROM = "messages x LEFT JOIN users s ON s.id = x.sender_id";
const photoOf = (a) => ({
  id: a.id,
  kind: (a.mime_type || "").startsWith("audio/") ? "audio" : "image",
  url: `/api/chat/photos/${a.id}`,
  name: a.original_name,
  mime: a.mime_type,
  size: a.size_bytes,
  width: a.width,
  height: a.height,
  duration: a.duration_ms,
});

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"];

/** Reactions per message: [{ emoji, count, user_ids, names }] in the order they first appeared. */
export async function reactionsOf(messageIds) {
  const map = new Map();
  if (!messageIds.length) return map;
  const rows = await query(
    `SELECT r.message_id, r.emoji, r.user_id, u.name FROM message_reactions r JOIN users u ON u.id = r.user_id
     WHERE r.message_id IN (${messageIds.map(() => "?").join(",")}) ORDER BY r.created_at, r.user_id`,
    messageIds
  );
  for (const r of rows) {
    const list = map.get(r.message_id) ?? [];
    let entry = list.find((e) => e.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, user_ids: [], names: [] };
      list.push(entry);
    }
    entry.count++;
    entry.user_ids.push(r.user_id);
    entry.names.push(r.name);
    map.set(r.message_id, list);
  }
  return map;
}
/** Attach each message's photos (attachments[]) and reactions[]. */
export async function withExtras(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const photos = await query(
    `SELECT id, message_id, original_name, mime_type, size_bytes, width, height, duration_ms FROM message_attachments WHERE message_id IN (${ids.map(() => "?").join(",")}) ORDER BY message_id, sort_order, id`,
    ids
  );
  const byMessage = new Map();
  for (const a of photos) byMessage.set(a.message_id, [...(byMessage.get(a.message_id) ?? []), photoOf(a)]);
  const reactions = await reactionsOf(ids);
  return rows.map((r) => ({ ...r, attachments: byMessage.get(r.id) ?? [], reactions: reactions.get(r.id) ?? [] }));
}
export async function messageById(id) {
  const row = await queryOne(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.id = ?`, [id]);
  return row ? (await withExtras([row]))[0] : null;
}
/** A system line in a group ("added", "removed", "left", "renamed", "owner", "created") that every member sees live. */
export async function systemMessage(convo, actorId, event, extra = {}) {
  const r = await execute("INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES (?, ?, 'system', ?)", [convo.id, actorId, JSON.stringify({ event, ...extra })]);
  const message = await messageById(r.insertId);
  broadcast(convo, { type: "message", conversation_id: convo.id, message });
  return message;
}
/**
 * A message the user may edit or delete: their own (any kind but system), or — for deleting only —
 * any message in a group they own. Returns the row with `convo_kind`, `my_role`.
 */
export async function editableMessage(messageId, userId, { forDelete = false } = {}) {
  const row = await queryOne(
    `SELECT x.id, x.conversation_id, x.sender_id, x.kind, x.body, x.deleted_at, c.kind AS convo_kind, m.role AS my_role
     FROM messages x JOIN conversations c ON c.id = x.conversation_id
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     WHERE x.id = ?`,
    [userId, messageId]
  );
  if (!row) throw new HttpError("Message not found.", 404);
  if (row.kind === "system") throw new HttpError("System lines cannot be changed.", 400);
  if (row.deleted_at) throw new HttpError("This message was deleted.", 400);
  const owner = row.convo_kind === "group" && row.my_role === "owner";
  if (row.sender_id !== userId && !(forDelete && owner)) throw new HttpError(forDelete ? "You can only delete your own messages." : "You can only edit your own messages.", 403);
  return row;
}

/** A photo the user may see: they are a member of its conversation. */
export async function photoFor(photoId, userId) {
  const row = await queryOne(
    `SELECT a.* FROM message_attachments a JOIN messages x ON x.id = a.message_id
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     WHERE a.id = ?`,
    [userId, photoId]
  );
  if (!row) throw new HttpError("Photo not found.", 404);
  return row;
}
/** Remove photo files for messages matched by a WHERE clause on messages m (rows go via FK cascade). */
export async function purgeMessagePhotos(whereSql, args) {
  const rows = await query(`SELECT a.stored_name FROM message_attachments a JOIN messages m ON m.id = a.message_id WHERE ${whereSql}`, args);
  await Promise.all(rows.map((r) => deleteStoredFile(r.stored_name).catch(() => {})));
  return rows.length;
}

/** One unread bell entry per conversation and recipient: the newest message replaces the previous unread one. */
export const clockOf = (ms) => `${Math.floor((ms || 0) / 60000)}:${String(Math.floor(((ms || 0) % 60000) / 1000)).padStart(2, "0")}`;
export async function notifyMessage(recipientId, sender, convo, body, photos = 0, voiceMs = null) {
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_message' AND entity_type = 'conversation' AND entity_id = ? AND read_at IS NULL", [recipientId, convo.id]);
  const text = body ? (body.length > 90 ? `${body.slice(0, 90)}…` : body) : voiceMs != null ? `🎤 Voice message (${clockOf(voiceMs)})` : photos > 1 ? `📷 ${photos} photos` : "📷 Photo";
  await notify({
    userId: recipientId,
    type: "chat_message",
    title: convo.kind === "group" ? `${sender.name} · ${convo.title}: ${text}` : `${sender.name}: ${text}`,
    body: null,
    href: `/chat?c=${convo.id}`,
    entityType: "conversation",
    entityId: convo.id,
    actorId: sender.id,
    tag: `chat-${convo.id}`,
  });
}

/** Delete a conversation with its photo files. */
export async function deleteConversation(id) {
  await purgeMessagePhotos("m.conversation_id = ?", [id]);
  await execute("DELETE FROM conversations WHERE id = ?", [id]);
}
/**
 * After an account is deleted: direct chats left with one member and empty groups go,
 * and a group whose owner is gone passes to its longest-standing member.
 */
export async function pruneOrphanConversations() {
  const orphans = await query(
    `SELECT c.id FROM conversations c LEFT JOIN conversation_members m ON m.conversation_id = c.id
     GROUP BY c.id, c.kind HAVING COUNT(m.user_id) < IF(c.kind = 'direct', 2, 1)`
  );
  for (const r of orphans) await deleteConversation(r.id);
  const ownerless = await query(
    `SELECT c.id FROM conversations c WHERE c.kind = 'group'
     AND NOT EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.role = 'owner')
     AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id)`
  );
  for (const r of ownerless) await execute("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? ORDER BY joined_at, user_id LIMIT 1", [r.id]);
  return orphans.length;
}
