import { execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { callFor, finishCall, shapeCall, isGroupCall } from "@/lib/calls";

/** Say no while it rings. In a direct call that ends it; in a group it only stops your own ringing. */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (isGroupCall(call)) {
    await execute("UPDATE call_participants SET status = 'declined' WHERE call_id = ? AND user_id = ? AND status = 'ringing'", [call.id, user.id]);
    await execute("DELETE FROM notifications WHERE user_id = ? AND type = 'chat_call' AND dedupe_key = ?", [user.id, `call:${call.id}`]);
    return ok(await shapeCall(call));
  }
  if (call.callee_id !== user.id) throw new HttpError("Only the person being called can decline.", 403);
  if (call.status !== "ringing") throw new HttpError("This call is no longer ringing.", 409);
  return ok(await shapeCall(await finishCall(call, "declined", { by: user.id })));
});
