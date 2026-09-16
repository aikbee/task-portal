import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { callFor, joinCall, isGroupCall } from "@/lib/calls";

/**
 * Join a group call that is going on (any member of the group, while there is room). The answer lists who is already
 * in it: the newcomer sends each of them a WebRTC offer. For a direct call use /accept.
 */
export const POST = handler(async (_request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (!isGroupCall(call)) throw new HttpError("Use /accept to pick up a direct call.", 400);
  return ok(await joinCall(call, user));
});
