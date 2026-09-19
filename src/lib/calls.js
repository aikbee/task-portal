import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { publish, broadcast, messageById, conversationFor, onUserOffline, PEER_FIELDS } from "./chat";
import { notify } from "./notifications";

/**
 * Voice and video calls. Direct chats ring one person; groups ring every member and anyone can join while the call
 * is on (a mesh: each browser connects to every other, capped at GROUP_CALL_MAX people). The browsers talk WebRTC
 * directly; the server rings, relays the SDP / ICE signals over the live stream, tracks who is in the call and
 * writes a "call" line into the chat when it is over.
 */
export const CALL_KINDS = ["audio", "video"];
export const CALL_RING_MS = 45000;
export const GROUP_CALL_MAX = 8;
const STALE_MS = 3 * 60 * 60 * 1000; // a call left ringing/active this long is treated as over

export const callLabel = (kind) => (kind === "video" ? "video call" : "voice call");
export const isGroupCall = (call) => call.callee_id == null;

/** Public STUN plus the relay from the admin settings: see turn.js. */
export { iceServersForUser } from "./turn";

export async function callFor(id, userId) {
  const call = await queryOne("SELECT * FROM calls WHERE id = ?", [id]);
  if (!call) throw new HttpError("Call not found.", 404);
  const member = await queryOne("SELECT 1 AS x FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [call.conversation_id, userId]);
  if (!member) throw new HttpError("Call not found.", 404);
  return call;
}
export const otherOf = (call, userId) => (call.caller_id === userId ? call.callee_id : call.caller_id);

/** People in the call (joined), with their names. */
export async function joinedOf(callId) {
  return query(`SELECT p.status, p.joined_at, ${PEER_FIELDS} FROM call_participants p JOIN users u ON u.id = p.user_id WHERE p.call_id = ? AND p.status = 'joined' ORDER BY p.joined_at, u.id`, [callId]);
}
export async function participantOf(callId, userId) {
  return queryOne("SELECT * FROM call_participants WHERE call_id = ? AND user_id = ?", [callId, userId]);
}

/** A call this user is busy with: joined, or (direct calls) being rung. Stale rows are ignored. */
export async function busyCallFor(userId) {
  return queryOne(
    `SELECT c.* FROM calls c JOIN call_participants p ON p.call_id = c.id AND p.user_id = ?
     WHERE c.status IN ('ringing', 'active') AND c.created_at > ? AND (p.status = 'joined' OR (c.callee_id IS NOT NULL AND p.status = 'ringing'))
     ORDER BY c.id DESC LIMIT 1`,
    [userId, new Date(Date.now() - STALE_MS)]
  );
}

export async function shapeCall(c) {
  const joined = await joinedOf(c.id);
  return {
    id: c.id,
    conversation_id: c.conversation_id,
    caller_id: c.caller_id,
    callee_id: c.callee_id,
    group: isGroupCall(c),
    kind: c.kind,
    status: c.status,
    created_at: c.created_at,
    answered_at: c.answered_at,
    ended_at: c.ended_at,
    participants: joined.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, avatar_color: p.avatar_color, joined_at: p.joined_at })),
  };
}

/** Every member of the call's conversation hears about it (banners, counts), not only the people in it. */
async function memberIdsOfCall(call) {
  return (await query("SELECT user_id FROM conversation_members WHERE conversation_id = ?", [call.conversation_id])).map((r) => r.user_id);
}
export async function tellMembers(call, event) {
  for (const uid of await memberIdsOfCall(call)) publish(uid, { type: "call", ...event });
}

/** Someone joins a group call (or the callee picks up a direct one). Returns the shaped call with the people already in it. */
export async function joinCall(call, user) {
  const fresh = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  if (!fresh || !["ringing", "active"].includes(fresh.status)) throw new HttpError("This call is over.", 409);
  const already = await participantOf(call.id, user.id);
  if (already?.status === "joined") return shapeCall(fresh);
  const joined = await joinedOf(call.id);
  if (isGroupCall(fresh) && joined.length >= GROUP_CALL_MAX) throw new HttpError(`Group calls take up to ${GROUP_CALL_MAX} people.`, 409);
  const elsewhere = await busyCallFor(user.id);
  if (elsewhere && elsewhere.id !== call.id) throw new HttpError("You are already in a call.", 409);
  await execute(
    "INSERT INTO call_participants (call_id, user_id, status, joined_at) VALUES (?, ?, 'joined', NOW()) AS new ON DUPLICATE KEY UPDATE status = 'joined', joined_at = NOW(), left_at = NULL",
    [call.id, user.id]
  );
  if (fresh.status === "ringing") await execute("UPDATE calls SET status = 'active', answered_at = COALESCE(answered_at, NOW()) WHERE id = ?", [call.id]);
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_call' AND dedupe_key = ?", [user.id, `call:${call.id}`]);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  const shaped = await shapeCall(await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]));
  // group members (in the call or not) learn who joined; a direct call announces the pick-up with "accepted" instead
  if (isGroupCall(fresh)) await tellMembers(fresh, { action: "participant_joined", call_id: call.id, user: me, count: shaped.participants.length });
  return shaped;
}

/** Someone leaves; the last person out ends the call. */
export async function leaveCall(call, userId, { reason = "left" } = {}) {
  const fresh = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  if (!fresh || !["ringing", "active"].includes(fresh.status)) return fresh;
  const p = await participantOf(call.id, userId);
  if (!p || p.status !== "joined") return fresh;
  await execute("UPDATE call_participants SET status = 'left', left_at = NOW() WHERE call_id = ? AND user_id = ?", [call.id, userId]);
  const left = await joinedOf(call.id);
  if (!isGroupCall(fresh) || left.length === 0) {
    const everJoined = await queryOne("SELECT COUNT(*) AS n FROM call_participants WHERE call_id = ? AND joined_at IS NOT NULL", [call.id]);
    const status = reason === "failed" ? "failed" : isGroupCall(fresh) ? (Number(everJoined.n) > 1 ? "ended" : "missed") : fresh.status === "ringing" ? (fresh.caller_id === userId ? "missed" : "declined") : "ended";
    return finishCall(fresh, status, { by: userId });
  }
  await tellMembers(fresh, { action: "participant_left", call_id: call.id, user_id: userId, count: left.length });
  return fresh;
}

/**
 * Close a call: status ended | missed | declined | failed, write the chat line, tell every member, and turn a
 * missed direct call into a bell/push notification for the person who was called.
 */
export async function finishCall(call, status, { by = null } = {}) {
  if (!["ended", "missed", "declined", "failed"].includes(status)) throw new HttpError("Bad call status.", 400);
  const fresh = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  if (!fresh || !["ringing", "active"].includes(fresh.status)) return fresh;
  await execute("UPDATE calls SET status = ?, ended_at = NOW() WHERE id = ?", [status, call.id]);
  await execute("UPDATE call_participants SET status = 'left', left_at = NOW() WHERE call_id = ? AND status = 'joined'", [call.id]);
  await execute("UPDATE call_participants SET status = 'missed' WHERE call_id = ? AND status = 'ringing'", [call.id]);
  const done = await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]);
  const duration = done.answered_at && done.ended_at ? Math.max(0, Math.round((new Date(done.ended_at) - new Date(done.answered_at)) / 1000)) : 0;
  const joined = Number((await queryOne("SELECT COUNT(*) AS n FROM call_participants WHERE call_id = ? AND joined_at IS NOT NULL", [call.id])).n);
  const body = JSON.stringify({ call_id: done.id, kind: done.kind, status, duration, ...(isGroupCall(done) ? { group: true, joined } : {}) });
  const r = await execute("INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES (?, ?, 'call', ?)", [done.conversation_id, done.caller_id, body]);
  await execute("UPDATE calls SET message_id = ? WHERE id = ?", [r.insertId, done.id]);
  // the person who started it has read their own line
  await execute("UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?", [r.insertId, done.conversation_id, done.caller_id]);
  const message = await messageById(r.insertId);
  const convo = await conversationFor(done.conversation_id, done.caller_id).catch(() => null);
  if (convo) broadcast(convo, { type: "message", conversation_id: done.conversation_id, message });
  await tellMembers(done, { action: "ended", call_id: done.id, status, by, duration });
  // the "is calling you" bell entries are over; a missed direct call gets its own
  await execute("DELETE FROM notifications WHERE type = 'chat_call' AND dedupe_key = ?", [`call:${done.id}`]);
  if (status === "missed" && !isGroupCall(done)) {
    const caller = await queryOne("SELECT name FROM users WHERE id = ?", [done.caller_id]);
    // same tag as the ringing banner, so on the phone "is calling you" turns into "missed call"
    await notify({ userId: done.callee_id, type: "chat_call", title: `Missed ${callLabel(done.kind)} from ${caller?.name ?? "someone"}`, body: null, href: `/chat?c=${done.conversation_id}`, entityType: "conversation", entityId: done.conversation_id, actorId: done.caller_id, tag: `call-${done.id}`, push: { urgency: "high", data: { missed: true, call_id: done.id } } }).catch(() => {});
  }
  if (isGroupCall(done)) {
    // members who were rung and never joined: their "started a call" banner is out of date now
    const missedBy = await query("SELECT user_id FROM call_participants WHERE call_id = ? AND status = 'missed'", [done.id]);
    if (missedBy.length) {
      const caller = await queryOne("SELECT name FROM users WHERE id = ?", [done.caller_id]);
      for (const m of missedBy) await notify({ userId: m.user_id, type: "chat_call", title: `Missed group ${callLabel(done.kind)}${convo?.title ? ` in “${convo.title}”` : ""}`, body: caller?.name ? `Started by ${caller.name}` : null, href: `/chat?c=${done.conversation_id}`, entityType: "conversation", entityId: done.conversation_id, actorId: done.caller_id, tag: `call-${done.id}`, push: { urgency: "high", data: { missed: true, call_id: done.id } } }).catch(() => {});
    }
  }
  return done;
}

/** A browser that went away without hanging up (offline after the presence grace) leaves its calls. */
export async function leaveAllCalls(userId) {
  const rows = await query(
    "SELECT c.* FROM calls c JOIN call_participants p ON p.call_id = c.id AND p.user_id = ? AND p.status = 'joined' WHERE c.status IN ('ringing', 'active')",
    [userId]
  );
  for (const c of rows) await leaveCall(c, userId).catch(() => {});
}
onUserOffline((userId) => leaveAllCalls(userId).catch(() => {}));

/** Calls of one conversation (for exports and the admin overview). */
export const callsOf = (conversationId) => query("SELECT * FROM calls WHERE conversation_id = ? ORDER BY id", [conversationId]);
