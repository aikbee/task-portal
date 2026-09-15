import crypto from "node:crypto";
import { deleteStoredFile, readStoredFile, saveBuffer } from "./uploads";
import { uploadedFileOf } from "./avatar-presets";
import QRCode from "qrcode";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { notify } from "./notifications";

/* ---------- live events: one in-process bus per user (a single pm2 process serves the app) ---------- */
const bus = globalThis.__chatBus ?? (globalThis.__chatBus = new Map());
/* presence: a user is online while at least one live stream is open; offline 30 s after the last one drops */
const presence = globalThis.__chatPresence ?? (globalThis.__chatPresence = new Map()); // userId -> { count, timer }
const OFFLINE_GRACE_MS = 30000;
export const isOnline = (userId) => (presence.get(userId)?.count ?? 0) > 0;
async function contactsOf(userId) {
  const rows = await query("SELECT DISTINCT m2.user_id FROM conversation_members m1 JOIN conversation_members m2 ON m2.conversation_id = m1.conversation_id AND m2.user_id <> m1.user_id WHERE m1.user_id = ?", [userId]);
  return rows.map((r) => r.user_id);
}
async function announcePresence(userId, online) {
  const at = new Date().toISOString();
  for (const id of await contactsOf(userId).catch(() => [])) publish(id, { type: "presence", user_id: userId, online, last_seen_at: at });
}
function presenceConnect(userId) {
  const st = presence.get(userId) ?? { count: 0, timer: null };
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }
  st.count += 1;
  presence.set(userId, st);
  if (st.count === 1) {
    execute("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [userId]).catch(() => {});
    announcePresence(userId, true).catch(() => {});
  }
}
function presenceDisconnect(userId) {
  const st = presence.get(userId);
  if (!st) return;
  st.count = Math.max(0, st.count - 1);
  if (st.count > 0) return;
  st.timer = setTimeout(() => {
    if (st.count > 0) return;
    presence.delete(userId);
    execute("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [userId]).catch(() => {});
    announcePresence(userId, false).catch(() => {});
  }, OFFLINE_GRACE_MS);
}
export function subscribe(userId, fn) {
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(fn);
  presenceConnect(userId);
  return () => {
    set.delete(fn);
    if (!set.size) bus.delete(userId);
    presenceDisconnect(userId);
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

export const PEER_FIELDS = "u.id, u.name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, u.email";
/** Same person columns for conversation rows, where `id` is the conversation and the person is `user_id`. */
export const CONVO_PEER = "u.id AS user_id, u.name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, u.email";
export const MESSAGE_MAX = 4000;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTOS_PER_MESSAGE = 8;
export const VOICE_MAX_MS = 5 * 60 * 1000;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENTS_PER_MESSAGE = 8;
export const MESSAGE_MAX_BYTES = 25 * 1024 * 1024; // all files of one message together
/** Types a browser may open in a tab straight from the file route; anything else is served as a download. */
export const INLINE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "video/mp4", "video/webm", "application/pdf", "text/plain"]);
export const cleanMime = (m) => (/^[\w.+-]+\/[\w.+-]+$/.test(String(m || "")) ? String(m).toLowerCase().slice(0, 120) : "application/octet-stream");

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

/* ---------- group roles and invite links ---------- */
export const ROLE_RANK = { owner: 3, admin: 2, member: 1 };
/** Owner and admins manage a group (rename, picture, invite link, removing people, deleting any message). */
export const canManage = (convo) => convo?.kind === "group" && (ROLE_RANK[convo.my_role] ?? 0) >= 2;
export function assertManager(convo, what) {
  if (convo.kind !== "group") throw new HttpError("Only group chats have that.", 400);
  if (!canManage(convo)) throw new HttpError(`Only the group owner or an admin can ${what}.`, 403);
}
export async function rotateInviteCode(conversationId) {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      await execute("UPDATE conversations SET invite_code = ? WHERE id = ?", [code, conversationId]);
      return code;
    } catch (e) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw new HttpError("Could not generate an invite link.", 500);
}
export const inviteLink = (origin, code) => `${origin}/chat?join=${encodeURIComponent(code)}`;
export const inviteQr = (origin, code) => QRCode.toDataURL(inviteLink(origin, code), { margin: 1, width: 220, errorCorrectionLevel: "M" });
/** The group behind an invite code (null when the code is unknown or revoked). */
export async function groupByInviteCode(code) {
  const pretty = normaliseCode(code);
  if (!pretty) return null;
  return queryOne(
    `SELECT c.id, c.title, c.avatar_color, c.avatar, (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS member_count
     FROM conversations c WHERE c.kind = 'group' AND c.invite_code = ?`,
    [pretty]
  );
}
/** When the owner goes, the longest-standing admin takes over, else the longest-standing member. Returns the heir's id. */
export async function handOver(conversationId) {
  const heir = await queryOne("SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY (role <> 'admin'), joined_at, user_id LIMIT 1", [conversationId]);
  if (!heir) return null;
  await execute("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?", [conversationId, heir.user_id]);
  return heir.user_id;
}

/* ---------- retention (disappearing messages) ---------- */
export const RETENTION_CHOICES = [1, 7, 30, 90, 365];
/** Instance-wide chat settings (admins): { max_retention_days } caps every conversation's history. */
export async function readChatSettings() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'chat'");
  const raw = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {};
  const cap = Number(raw?.max_retention_days);
  return { max_retention_days: Number.isInteger(cap) && cap > 0 ? cap : null };
}
export async function saveChatSettings(value, userId) {
  await execute("INSERT INTO app_settings (name, value, updated_by) VALUES ('chat', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [JSON.stringify(value), userId]);
}
/**
 * Hard-delete messages older than their conversation's retention (or the instance cap), files included, and tell
 * the members live so open threads drop them. Returns how many rows went.
 */
export async function purgeExpired({ conversationId = null } = {}) {
  const { max_retention_days: cap } = await readChatSettings();
  const args = [];
  if (conversationId) args.push(conversationId);
  if (cap) args.push(cap);
  const rows = await query(
    `SELECT x.id, x.conversation_id FROM messages x JOIN conversations c ON c.id = x.conversation_id
     WHERE ${conversationId ? "c.id = ? AND" : ""} ((c.retention_days IS NOT NULL AND x.created_at < NOW() - INTERVAL c.retention_days DAY)${cap ? " OR x.created_at < NOW() - INTERVAL ? DAY" : ""})
     ORDER BY x.id LIMIT 5000`,
    args
  );
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => "?").join(",");
  await purgeMessagePhotos(`m.id IN (${marks})`, ids).catch(() => {});
  await execute(`DELETE FROM messages WHERE id IN (${marks})`, ids);
  const byConvo = new Map();
  for (const r of rows) byConvo.set(r.conversation_id, [...(byConvo.get(r.conversation_id) ?? []), r.id]);
  for (const [cid, gone] of byConvo) {
    const members = await query("SELECT user_id FROM conversation_members WHERE conversation_id = ?", [cid]);
    for (const m of members) publish(m.user_id, { type: "purged", conversation_id: cid, ids: gone });
  }
  return ids.length;
}
const SWEEP_EVERY_MS = 10 * 60 * 1000;
/** Opportunistic purge (at most every 10 minutes per process) so retention holds even without the nightly cron. */
export async function sweepRetention({ force = false } = {}) {
  const last = globalThis.__chatSweepAt ?? 0;
  if (!force && Date.now() - last < SWEEP_EVERY_MS) return null;
  globalThis.__chatSweepAt = Date.now();
  return purgeExpired().catch(() => 0);
}

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
    `SELECT m.conversation_id, m.role, m.last_read_message_id, m.delivered_message_id, u.last_seen_at, ${PEER_FIELDS}
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
function shapeConversation(row, members, statuses, me, settings) {
  const mine = members.find((x) => x.id === me);
  const myRole = mine?.role ?? "member";
  const base = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    my_role: myRole,
    invite_code: row.kind === "group" && (ROLE_RANK[myRole] ?? 0) >= 2 ? row.invite_code ?? null : null,
    retention_days: row.retention_days ?? null,
    retention_cap: settings?.max_retention_days ?? null,
    members: members.map(({ id, name, avatar_color, avatar, email, role, last_read_message_id, delivered_message_id, last_seen_at }) => ({ id, name, avatar_color, avatar, email, role, last_read_message_id, delivered_message_id, online: isOnline(id), last_seen_at })),
    member_count: members.length,
    online_count: members.filter((x) => x.id !== me && isOnline(x.id)).length,
    muted: Boolean(row.muted),
    pinned_at: row.pinned_at ?? null,
    archived_at: row.archived_at ?? null,
    hidden_before_id: row.hidden_before_id ?? null,
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
    last_files: Number(row.last_files ?? 0),
    mention_unread: Number(row.mention_unread ?? 0),
    last_file_name: row.last_file_name ?? null,
  };
  if (row.kind === "group") return { ...base, name: row.title, avatar_color: row.group_color, avatar: row.group_avatar ?? null, email: null, user_id: null, friend_status: null, peer_last_read: null };
  const peer = members.find((x) => x.id !== me);
  return {
    ...base,
    name: peer?.name ?? "Deleted account",
    avatar_color: peer?.avatar_color ?? "#94a3b8",
    avatar: peer?.avatar ?? "initials",
    email: peer?.email ?? null,
    user_id: peer?.id ?? null,
    friend_status: peer ? (statuses.get(peer.id) ?? null) : null,
    peer_last_read: peer?.last_read_message_id ?? null,
    peer_delivered: peer?.delivered_message_id ?? null,
    online: peer ? isOnline(peer.id) : false,
    last_seen_at: peer?.last_seen_at ?? null,
  };
}
async function loadConversations(userId, onlyId = null, { includeHidden = false } = {}) {
  const rows = await query(
    `SELECT c.id, c.kind, c.title, c.avatar_color AS group_color, c.avatar AS group_avatar, c.invite_code, c.retention_days, m.last_read_message_id, m.muted, m.pinned_at, m.archived_at, m.hidden_before_id,
       (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.sender_id <> ? AND x.kind = 'text' AND x.deleted_at IS NULL AND x.id > GREATEST(COALESCE(m.last_read_message_id, 0), COALESCE(m.hidden_before_id, 0))) AS unread,
       lm.id AS last_id, lm.kind AS last_kind, lm.body AS last_body, lm.deleted_at AS last_deleted, lm.sender_id AS last_sender_id, lm.created_at AS last_at, ls.name AS last_sender_name,
       (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = lm.id AND a.kind = 'image') AS last_photos,
       (SELECT a.duration_ms FROM message_attachments a WHERE a.message_id = lm.id AND a.kind = 'audio' LIMIT 1) AS last_voice,
       (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = lm.id AND a.kind = 'file') AS last_files,
       (SELECT a.original_name FROM message_attachments a WHERE a.message_id = lm.id AND a.kind = 'file' ORDER BY a.sort_order, a.id LIMIT 1) AS last_file_name,
       (SELECT COUNT(*) FROM message_mentions mm JOIN messages x ON x.id = mm.message_id WHERE x.conversation_id = c.id AND mm.user_id = ? AND x.deleted_at IS NULL AND x.id > GREATEST(COALESCE(m.last_read_message_id, 0), COALESCE(m.hidden_before_id, 0))) AS mention_unread
     FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
     LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id AND id > COALESCE(m.hidden_before_id, 0))
     LEFT JOIN users ls ON ls.id = lm.sender_id
     WHERE ${includeHidden ? "1 = 1" : "(m.hidden_before_id IS NULL OR lm.id IS NOT NULL)"} ${onlyId ? "AND c.id = ?" : ""}
     ORDER BY (m.pinned_at IS NULL), m.pinned_at DESC, COALESCE(lm.created_at, c.created_at) DESC`,
    onlyId ? [userId, userId, userId, onlyId] : [userId, userId, userId]
  );
  const members = await membersOf(rows.map((r) => r.id));
  const peerIds = rows.filter((r) => r.kind === "direct").flatMap((r) => (members.get(r.id) ?? []).filter((x) => x.id !== userId).map((x) => x.id));
  const statuses = await friendStatuses(userId, peerIds);
  const settings = await readChatSettings();
  return rows.map((r) => shapeConversation(r, members.get(r.id) ?? [], statuses, userId, settings));
}
export const conversationsOf = (userId) => loadConversations(userId);
/** A conversation the user belongs to (404 otherwise) — even one they "deleted" on their side. */
export async function conversationFor(conversationId, userId) {
  const [c] = await loadConversations(userId, conversationId, { includeHidden: true });
  if (!c) throw new HttpError("Conversation not found.", 404);
  return c;
}
export const recipientsOf = (convo, me) => convo.members.map((m) => m.id).filter((id) => id !== me);
/** Members who muted this chat: they still get live events, but no bell or push. */
export async function mutedMemberIds(conversationId) {
  return (await query("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND muted = 1", [conversationId])).map((r) => r.user_id);
}
/** A new message brings an archived chat back for everyone else. */
export function unarchiveFor(conversationId, senderId) {
  return execute("UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = ? AND user_id <> ? AND archived_at IS NOT NULL", [conversationId, senderId]);
}
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
      (SELECT COUNT(*) FROM messages x JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ? WHERE m.muted = 0 AND x.sender_id <> ? AND x.kind = 'text' AND x.deleted_at IS NULL AND x.id > GREATEST(COALESCE(m.last_read_message_id, 0), COALESCE(m.hidden_before_id, 0))) AS unread,
      (SELECT COUNT(*) FROM friendships f WHERE f.addressee_id = ? AND f.status = 'pending') AS pending`,
    [userId, userId, userId]
  );
  return { unread: Number(row?.unread ?? 0), pending: Number(row?.pending ?? 0) };
}

/* ---------- messages ---------- */
export const MESSAGE_SELECT = "x.id, x.conversation_id, x.sender_id, x.kind, x.body, x.created_at, x.edited_at, x.deleted_at, x.reply_to_id, x.forwarded, s.name AS sender_name, s.avatar_color AS sender_color, COALESCE(s.avatar, 'preset:pro') AS sender_avatar";
export const MESSAGE_FROM = "messages x LEFT JOIN users s ON s.id = x.sender_id";
const photoOf = (a) => ({
  id: a.id,
  kind: a.kind || ((a.mime_type || "").startsWith("audio/") ? "audio" : "image"),
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
    `SELECT id, message_id, kind, original_name, mime_type, size_bytes, width, height, duration_ms FROM message_attachments WHERE message_id IN (${ids.map(() => "?").join(",")}) ORDER BY message_id, sort_order, id`,
    ids
  );
  const byMessage = new Map();
  for (const a of photos) byMessage.set(a.message_id, [...(byMessage.get(a.message_id) ?? []), photoOf(a)]);
  const reactions = await reactionsOf(ids);
  const quotes = await quotesOf([...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))]);
  const mentionRows = await query(`SELECT message_id, user_id FROM message_mentions WHERE message_id IN (${ids.map(() => "?").join(",")})`, ids);
  const mentions = new Map();
  for (const r of mentionRows) mentions.set(r.message_id, [...(mentions.get(r.message_id) ?? []), r.user_id]);
  return rows.map((r) => ({ ...r, forwarded: Boolean(r.forwarded), attachments: byMessage.get(r.id) ?? [], reactions: reactions.get(r.id) ?? [], reply_to: r.reply_to_id ? quotes.get(r.reply_to_id) ?? null : null, mentions: mentions.get(r.id) ?? [] }));
}

/* ---------- mentions (groups only) ---------- */
/** Parse { mentions: [ids], mention_all } from JSON or form fields. */
export function readMentions(src) {
  let ids = src.mentions;
  if (typeof ids === "string") {
    try { ids = JSON.parse(ids); } catch { ids = []; }
  }
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const all = src.mention_all === true || src.mention_all === "1" || src.mention_all === "true";
  return { ids: list, all };
}
/** The member ids a message mentions (everyone but the sender for @everyone); 400 when an id is not a member. */
export function mentionTargets(convo, senderId, { ids, all }) {
  if (convo.kind !== "group") return [];
  const memberIds = new Set(convo.members.map((m) => m.id));
  if (all) return convo.members.map((m) => m.id).filter((id) => id !== senderId);
  const stranger = ids.find((id) => !memberIds.has(id));
  if (stranger != null) throw new HttpError("You can only mention members of this group.", 400);
  return ids.filter((id) => id !== senderId);
}
export async function saveMentions(messageId, ids) {
  await execute("DELETE FROM message_mentions WHERE message_id = ?", [messageId]);
  if (ids.length) await execute(`INSERT INTO message_mentions (message_id, user_id) VALUES ${ids.map(() => "(?, ?)").join(", ")}`, ids.flatMap((id) => [messageId, id]));
}
/** "Ann mentioned you in Group: …" — replaces the plain new-message entry for that chat. */
export async function notifyMention(recipientId, sender, convo, body) {
  await execute("DELETE FROM notifications WHERE user_id = ? AND type IN ('chat_message', 'chat_mention') AND entity_type = 'conversation' AND entity_id = ? AND read_at IS NULL", [recipientId, convo.id]);
  const text = body ? (body.length > 90 ? `${body.slice(0, 90)}…` : body) : "";
  await notify({
    userId: recipientId,
    type: "chat_mention",
    title: `${sender.name} mentioned you in ${convo.title}${text ? `: ${text}` : ""}`,
    body: null,
    href: `/chat?c=${convo.id}`,
    entityType: "conversation",
    entityId: convo.id,
    actorId: sender.id,
    tag: `chat-${convo.id}`,
  });
}
/** Short quotes of the messages being replied to: who wrote it, a snippet, or what kind of attachment it was. */
export async function quotesOf(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await query(
    `SELECT x.id, x.sender_id, x.body, x.deleted_at, s.name AS sender_name,
       (SELECT a.kind FROM message_attachments a WHERE a.message_id = x.id ORDER BY a.sort_order, a.id LIMIT 1) AS att_kind,
       (SELECT COUNT(*) FROM message_attachments a WHERE a.message_id = x.id) AS att_count,
       (SELECT a.original_name FROM message_attachments a WHERE a.message_id = x.id ORDER BY a.sort_order, a.id LIMIT 1) AS att_name
     FROM messages x LEFT JOIN users s ON s.id = x.sender_id WHERE x.id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      sender_id: r.sender_id,
      sender_name: r.sender_name,
      body: r.deleted_at ? "" : String(r.body ?? "").slice(0, 200),
      deleted: Boolean(r.deleted_at),
      attachment: r.att_kind && !r.deleted_at ? { kind: r.att_kind, count: Number(r.att_count), name: r.att_name } : null,
    });
  }
  return map;
}
/** Copy a message's attachments (rows and files) onto another message. */
export async function copyAttachments(fromId, toId) {
  const rows = await query("SELECT * FROM message_attachments WHERE message_id = ? ORDER BY sort_order, id", [fromId]);
  const copied = [];
  for (const a of rows) {
    const buf = await readStoredFile(a.stored_name).catch(() => null);
    if (!buf) continue;
    const { storedName } = await saveBuffer(buf, a.original_name);
    await execute(
      "INSERT INTO message_attachments (message_id, kind, stored_name, original_name, mime_type, size_bytes, width, height, duration_ms, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [toId, a.kind, storedName, a.original_name, a.mime_type, a.size_bytes, a.width, a.height, a.duration_ms, a.sort_order]
    );
    copied.push({ ...a, stored_name: storedName });
  }
  return copied;
}
export async function messageById(id) {
  const row = await queryOne(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.id = ?`, [id]);
  return row ? (await withExtras([row]))[0] : null;
}
/** A system line ("added", "removed", "left", "renamed", "owner", "created", "admin", "joined", "retention"…) that every member sees live. */
export async function systemMessage(convo, actorId, event, extra = {}) {
  const r = await execute("INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES (?, ?, 'system', ?)", [convo.id, actorId, JSON.stringify({ event, ...extra })]);
  const message = await messageById(r.insertId);
  broadcast(convo, { type: "message", conversation_id: convo.id, message });
  return message;
}
/**
 * A message the user may edit or delete: their own (any kind but system), or — for deleting only —
 * any message in a group they own or administer. Returns the row with `convo_kind`, `my_role`.
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
  const manager = row.convo_kind === "group" && (ROLE_RANK[row.my_role] ?? 0) >= 2;
  if (row.sender_id !== userId && !(forDelete && manager)) throw new HttpError(forDelete ? "You can only delete your own messages." : "You can only edit your own messages.", 403);
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
export async function notifyMessage(recipientId, sender, convo, body, photos = 0, voiceMs = null, files = 0, fileName = "") {
  await execute("DELETE FROM notifications WHERE user_id = ? AND type IN ('chat_message', 'chat_mention') AND entity_type = 'conversation' AND entity_id = ? AND read_at IS NULL", [recipientId, convo.id]);
  const text = body
    ? body.length > 90 ? `${body.slice(0, 90)}…` : body
    : voiceMs != null ? `🎤 Voice message (${clockOf(voiceMs)})`
    : photos ? (photos > 1 ? `📷 ${photos} photos` : "📷 Photo") + (files ? ` + 📎 ${files}` : "")
    : files > 1 ? `📎 ${files} files` : `📎 ${fileName || "File"}`;
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
  const row = await queryOne("SELECT avatar FROM conversations WHERE id = ?", [id]);
  const pic = uploadedFileOf(row?.avatar);
  if (pic) await deleteStoredFile(pic).catch(() => {});
  await execute("DELETE FROM conversations WHERE id = ?", [id]);
}
/**
 * After an account is deleted: direct chats left with one member and empty groups go,
 * and a group whose owner is gone passes to its longest-standing admin, else member.
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
  for (const r of ownerless) await handOver(r.id);
  return orphans.length;
}
