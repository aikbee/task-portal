import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { callFor, finishCall, leaveCall, shapeCall, isGroupCall, participantOf } from "@/lib/calls";

/**
 * Hang up. Direct calls: ends it for both (while it still rings, the caller hanging up means "no answer");
 * { reason: "failed" } records a call that could not connect. Group calls: the same as /leave for a participant.
 */
export const POST = handler(async (request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  const reason = String((await readJson(request).catch(() => ({}))).reason ?? "");
  if (!["ringing", "active"].includes(call.status)) return ok(await shapeCall(call));
  if (isGroupCall(call)) {
    const p = await participantOf(call.id, user.id);
    if (p?.status === "joined") return ok(await shapeCall(await leaveCall(call, user.id, { reason: reason === "failed" ? "failed" : "left" })));
    return ok(await shapeCall(call));
  }
  let status = "ended";
  if (reason === "failed") status = "failed";
  else if (call.status === "ringing") status = call.caller_id === user.id ? "missed" : "declined";
  return ok(await shapeCall(await finishCall(call, status, { by: user.id })));
});
