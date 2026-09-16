import { execute, queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { publish } from "@/lib/chat";
import { callFor, shapeCall } from "@/lib/calls";

/** The person being called picks up: the call becomes active and the caller starts the WebRTC offer. */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (call.callee_id !== user.id) throw new HttpError("Only the person being called can accept.", 403);
  if (call.status !== "ringing") throw new HttpError("This call is no longer ringing.", 409);
  await execute("UPDATE calls SET status = 'active', answered_at = NOW() WHERE id = ?", [call.id]);
  await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_call' AND dedupe_key = ?", [user.id, `call:${call.id}`]);
  const fresh = shapeCall(await queryOne("SELECT * FROM calls WHERE id = ?", [call.id]));
  for (const uid of [call.caller_id, call.callee_id]) publish(uid, { type: "call", action: "accepted", call_id: call.id, by: user.id });
  return ok(fresh);
});
