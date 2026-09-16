import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { publish, broadcast, messageById, conversationFor } from "./chat";
import { notify } from "./notifications";

/**
 * One-to-one voice and video calls. The browsers talk WebRTC directly; the server only rings the other person,
 * relays the SDP / ICE signals over the live stream, and writes a "call" line into the chat when it is over.
 */
export const CALL_KINDS = ["audio", "video"];
export const CALL_RING_MS = 45000;
const STALE_MS = 3 * 60 * 60 * 1000; // a call left ringing/active this long is treated as over

export const callLabel = (kind) => (kind === "video" ? "video call" : "voice call");

/** Public STUN plus an optional TURN server from the admin settings. */
export function iceServersFor(settings) {
  const list = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (settings?.turn_url) list.push({ urls: settings.turn_url, username: settings.turn_username || undefined, credential: settings.turn_credential || undefined });
  return list;
}

export async function callFor(id, userId) {
  const call = await queryOne("SELECT * FROM calls WHERE id = ?", [id]);
  if (!call || (call.caller_id !== userId && call.callee_id !== userId)) throw new HttpError("Call not found.", 404);
  return call;
}
export const otherOf = (call, userId) => (call.caller_id === userId ? call.callee_id : call.caller_id);

/** A ringing or active call this user is part of (ignoring stale rows), or null. */
export async function busyCallFor(userId) {
  return queryOne("SELECT * FROM calls WHERE (caller_id = ? OR callee_id = ?) AND status IN ('ringing', 'active') AND created_at > ? ORDER BY id DESC LIMIT 1", [userId, userId, new Date(Date.now() - STALE_MS)]);
}

const shape = (c) => ({ id: c.id, conversation_id: c.conversation_id, caller_id: c.caller_id, callee_id: c.callee_id, kind: c.kind, status: c.status, created_at: c.created_at, answered_at: c.answered_at, ended_at: c.ended_at });
export { shape as shapeCall };

/**
 * Close a call: status ended | missed | declined | failed, write the chat line, tell both sides, and turn a
 * missed call into a bell/push notification for the person who was called.
 */
export async function finishCall(call, status, { by = null } = {}) {
  if (!["ended", "missed", "declined", "failed"].includes(status)) throw new HttpError("Bad call status.", 400);
  const fresh = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  if (!fresh || !["ringing", "active"].includes(fresh.status)) return fresh;
  await execute("UPDATE calls SET status = ?, ended_at = NOW() WHERE id = ?", [status, call.id]);
  const done = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  const duration = done.answered_at && done.ended_at ? Math.max(0, Math.round((new Date(done.ended_at) - new Date(done.answered_at)) / 1000)) : 0;
  const body = JSON.stringify({ call_id: done.id, kind: done.kind, status, duration });
  const r = await execute("INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES (?, ?, 'call', ?)", [done.conversation_id, done.caller_id, body]);
  await execute("UPDATE calls SET message_id = ? WHERE id = ?", [r.insertId, done.id]);
  // the caller has read their own line
  await execute("UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?", [r.insertId, done.conversation_id, done.caller_id]);
  const message = await messageById(r.insertId);
  const convo = await conversationFor(done.conversation_id, done.caller_id);
  broadcast(convo, { type: "message", conversation_id: done.conversation_id, message });
  for (const uid of [done.caller_id, done.callee_id]) publish(uid, { type: "call", action: "ended", call_id: done.id, status, by, duration });
  // the "is calling you" bell entry is over; a missed call gets its own
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_call' AND dedupe_key = ?", [done.callee_id, `call:${done.id}`]);
  if (status === "missed") {
    const caller = await queryOne("SELECT name FROM users WHERE id = ?", [done.caller_id]);
    await notify({ userId: done.callee_id, type: "chat_call", title: `Missed ${callLabel(done.kind)} from ${caller?.name ?? "someone"}`, body: null, href: `/chat?c=${done.conversation_id}`, entityType: "conversation", entityId: done.conversation_id, actorId: done.caller_id, dedupeKey: `missed:${done.id}`, tag: `call-${done.id}` }).catch(() => {});
  }
  return done;
}

/** Calls of one conversation (for exports and the admin overview). */
export const callsOf = (conversationId) => query("SELECT * FROM calls WHERE conversation_id = ? ORDER BY id", [conversationId]);
