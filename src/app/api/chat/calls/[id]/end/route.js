import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { callFor, finishCall, shapeCall } from "@/lib/calls";

/**
 * Hang up (either side). While it still rings, the caller hanging up means "no answer" (missed for the other person);
 * { reason: "failed" } records a call that could not connect. Ending a call that is already over just returns it.
 */
export const POST = handler(async (request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  const reason = String((await readJson(request).catch(() => ({}))).reason ?? "");
  if (!["ringing", "active"].includes(call.status)) return ok(shapeCall(call));
  let status = "ended";
  if (reason === "failed") status = "failed";
  else if (call.status === "ringing") status = call.caller_id === user.id ? "missed" : "declined";
  return ok(shapeCall(await finishCall(call, status, { by: user.id })));
});
