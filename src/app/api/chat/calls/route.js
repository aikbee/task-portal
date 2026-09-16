import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { conversationFor, assertFriends, publish, PEER_FIELDS } from "@/lib/chat";
import { busyCallFor, shapeCall, callLabel, tellMembers, CALL_KINDS } from "@/lib/calls";
import { notify } from "@/lib/notifications";

/**
 * Start a call: { conversation_id, kind: "audio" | "video" }. A direct chat rings the other person (one call per
 * person at a time); a group rings every member and you are in the call straight away — others join while it is on.
 * Everyone rung gets a "call" ring event on their open tabs and a bell / push entry in case the portal is closed.
 */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const cid = Number(body.conversation_id);
  if (!Number.isInteger(cid) || cid <= 0) throw new HttpError("conversation_id is required.", 400);
  const kind = CALL_KINDS.includes(body.kind) ? body.kind : "audio";
  const convo = await conversationFor(cid, user.id);
  const group = convo.kind === "group";
  if (!group && !convo.user_id) throw new HttpError("There is nobody to call in this chat.", 400);
  if (!group) await assertFriends(user.id, convo.user_id);
  if (await busyCallFor(user.id)) throw new HttpError("You are already in a call.", 409);
  if (!group && (await busyCallFor(convo.user_id))) throw new HttpError(`${convo.name} is in another call.`, 409);
  if (group) {
    const running = await queryOne("SELECT id FROM calls WHERE conversation_id = ? AND status IN ('ringing', 'active') AND created_at > ? ORDER BY id DESC LIMIT 1", [cid, new Date(Date.now() - 3 * 60 * 60 * 1000)]);
    if (running) throw new HttpError("A call is already going on in this group — join it instead.", 409, { call_id: running.id });
  }
  const r = await execute("INSERT INTO calls (conversation_id, caller_id, callee_id, kind, status, answered_at) VALUES (?, ?, ?, ?, ?, ?)", [cid, user.id, group ? null : convo.user_id, kind, group ? "active" : "ringing", group ? new Date() : null]);
  const others = convo.members.filter((m) => m.id !== user.id).map((m) => m.id);
  const values = [[r.insertId, user.id, "joined", new Date()], ...others.map((id) => [r.insertId, id, "ringing", null])];
  await execute(`INSERT INTO call_participants (call_id, user_id, status, joined_at) VALUES ${values.map(() => "(?, ?, ?, ?)").join(", ")}`, values.flat());
  const call = await shapeCall(await queryOne("SELECT * FROM calls WHERE id = ?", [r.insertId]));
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  const ring = { type: "call", action: "ring", call, from: me, conversation_title: group ? convo.title : null };
  for (const id of others) publish(id, ring);
  if (group) await tellMembers({ conversation_id: cid }, { action: "started", call_id: call.id, kind, count: 1 });
  const title = group ? `${me.name} started a ${callLabel(kind)} in “${convo.title}”` : `${me.name} is calling you (${callLabel(kind)})`;
  for (const id of others) {
    notify({ userId: id, type: "chat_call", title, body: group ? "Open the group to join." : "Open the chat to answer.", href: `/chat?c=${cid}`, entityType: "conversation", entityId: cid, actorId: user.id, dedupeKey: `call:${call.id}`, tag: `call-${call.id}` }).catch(() => {});
  }
  return ok({ ...call, peer: group ? null : { id: convo.user_id, name: convo.name, avatar: convo.avatar, avatar_color: convo.avatar_color }, title: group ? convo.title : null }, { status: 201 });
});
