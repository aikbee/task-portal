import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { conversationFor, assertFriends, publish, PEER_FIELDS } from "@/lib/chat";
import { busyCallFor, shapeCall, callLabel, CALL_KINDS } from "@/lib/calls";
import { notify } from "@/lib/notifications";

/**
 * Start a call: { conversation_id, kind: "audio" | "video" } — direct chats between friends only, one call per person at a time.
 * The other person's open chat tabs get a "call" ring event; they also get a bell / push entry in case the chat is not open.
 */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const cid = Number(body.conversation_id);
  if (!Number.isInteger(cid) || cid <= 0) throw new HttpError("conversation_id is required.", 400);
  const kind = CALL_KINDS.includes(body.kind) ? body.kind : "audio";
  const convo = await conversationFor(cid, user.id);
  if (convo.kind !== "group" && !convo.user_id) throw new HttpError("There is nobody to call in this chat.", 400);
  if (convo.kind === "group") throw new HttpError("Calls work in direct chats only for now.", 400);
  await assertFriends(user.id, convo.user_id);
  if (await busyCallFor(user.id)) throw new HttpError("You are already in a call.", 409);
  if (await busyCallFor(convo.user_id)) throw new HttpError(`${convo.name} is in another call.`, 409);
  const r = await execute("INSERT INTO calls (conversation_id, caller_id, callee_id, kind) VALUES (?, ?, ?, ?)", [cid, user.id, convo.user_id, kind]);
  const call = shapeCall(await queryOne("SELECT * FROM calls WHERE id = ?", [r.insertId]));
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  publish(convo.user_id, { type: "call", action: "ring", call, from: me });
  notify({ userId: convo.user_id, type: "chat_call", title: `${me.name} is calling you (${callLabel(kind)})`, body: "Open the chat to answer.", href: `/chat?c=${cid}`, entityType: "conversation", entityId: cid, actorId: user.id, dedupeKey: `call:${call.id}`, tag: `call-${call.id}` }).catch(() => {});
  return ok({ ...call, peer: { id: convo.user_id, name: convo.name, avatar: convo.avatar, avatar_color: convo.avatar_color } }, { status: 201 });
});
