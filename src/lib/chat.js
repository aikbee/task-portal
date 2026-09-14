import crypto from "node:crypto";
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

/* ---------- conversations ---------- */
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
export async function conversationsOf(userId) {
  const rows = await query(
    `SELECT c.id, ${CONVO_PEER}, m.last_read_message_id, pm.last_read_message_id AS peer_last_read,
       (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.sender_id <> ? AND x.id > COALESCE(m.last_read_message_id, 0)) AS unread,
       lm.id AS last_id, lm.body AS last_body, lm.sender_id AS last_sender_id, lm.created_at AS last_at,
       (SELECT f.status FROM friendships f WHERE (f.requester_id = ? AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = ?)) AS friend_status
     FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
     JOIN conversation_members pm ON pm.conversation_id = c.id AND pm.user_id <> ?
     JOIN users u ON u.id = pm.user_id
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id)
     WHERE c.kind = 'direct'
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    [userId, userId, userId, userId, userId]
  );
  return rows.map((r) => ({ ...r, unread: Number(r.unread) }));
}
export async function conversationFor(conversationId, userId) {
  const row = await queryOne(
    `SELECT c.id, ${CONVO_PEER}, m.last_read_message_id, pm.last_read_message_id AS peer_last_read
     FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
     JOIN conversation_members pm ON pm.conversation_id = c.id AND pm.user_id <> ?
     JOIN users u ON u.id = pm.user_id
     WHERE c.id = ?`,
    [userId, userId, conversationId]
  );
  if (!row) throw new HttpError("Conversation not found.", 404);
  return row;
}
export async function chatBadge(userId) {
  const row = await queryOne(
    `SELECT
      (SELECT COUNT(*) FROM messages x JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ? WHERE x.sender_id <> ? AND x.id > COALESCE(m.last_read_message_id, 0)) AS unread,
      (SELECT COUNT(*) FROM friendships f WHERE f.addressee_id = ? AND f.status = 'pending') AS pending`,
    [userId, userId, userId]
  );
  return { unread: Number(row?.unread ?? 0), pending: Number(row?.pending ?? 0) };
}

/** One unread bell entry per conversation: the newest message replaces the previous unread one. */
export async function notifyMessage(peerId, sender, conversationId, body) {
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_message' AND entity_type = 'conversation' AND entity_id = ? AND read_at IS NULL", [peerId, conversationId]);
  await notify({
    userId: peerId,
    type: "chat_message",
    title: `${sender.name}: ${body.length > 90 ? `${body.slice(0, 90)}…` : body}`,
    body: null,
    href: `/chat?c=${conversationId}`,
    entityType: "conversation",
    entityId: conversationId,
    actorId: sender.id,
    tag: `chat-${conversationId}`,
  });
}

/** Direct conversations left with a single member (the other account was deleted) are removed. */
export async function pruneOrphanConversations() {
  await execute(
    `DELETE FROM conversations WHERE kind = 'direct' AND id IN (
       SELECT id FROM (SELECT c.id FROM conversations c LEFT JOIN conversation_members m ON m.conversation_id = c.id GROUP BY c.id HAVING COUNT(m.user_id) < 2) x)`
  );
}
