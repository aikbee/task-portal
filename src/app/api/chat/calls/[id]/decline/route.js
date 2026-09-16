import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { callFor, finishCall, shapeCall } from "@/lib/calls";

/** The person being called says no while it rings. */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (call.callee_id !== user.id) throw new HttpError("Only the person being called can decline.", 403);
  if (call.status !== "ringing") throw new HttpError("This call is no longer ringing.", 409);
  return ok(shapeCall(await finishCall(call, "declined", { by: user.id })));
});
