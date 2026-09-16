import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { publish } from "@/lib/chat";
import { callFor, joinCall, isGroupCall } from "@/lib/calls";

/** The person being called picks up a direct call: it becomes active and the caller starts the WebRTC offer. */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (isGroupCall(call)) throw new HttpError("Use /join for a group call.", 400);
  if (call.callee_id !== user.id) throw new HttpError("Only the person being called can accept.", 403);
  if (call.status !== "ringing") throw new HttpError("This call is no longer ringing.", 409);
  const shaped = await joinCall(call, user);
  for (const uid of [call.caller_id, call.callee_id]) publish(uid, { type: "call", action: "accepted", call_id: call.id, by: user.id });
  return ok(shaped);
});
