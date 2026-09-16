import { handler, ok, requireId } from "@/lib/api-utils";
import { callFor, leaveCall, shapeCall } from "@/lib/calls";

/** Leave a group call; the last person out ends it. (For a direct call, /end hangs up for both.) */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  return ok(await shapeCall(await leaveCall(call, user.id)));
});
