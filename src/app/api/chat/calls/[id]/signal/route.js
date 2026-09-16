import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { publish } from "@/lib/chat";
import { callFor, otherOf, participantOf, isGroupCall } from "@/lib/calls";

const TYPES = new Set(["offer", "answer", "candidate"]);

/**
 * Relay one WebRTC signal ({ type: offer | answer | candidate, … }) to another participant of an active call:
 * { to: userId, signal } in a group (the target must be in the call); `to` may be left out in a direct call. Nothing is stored.
 */
export const POST = handler(async (request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (call.status !== "active") throw new HttpError("Signals can only be sent during an active call.", 409);
  const body = await readJson(request);
  const signal = body.signal;
  if (!signal || !TYPES.has(signal.type)) throw new HttpError("signal.type must be offer, answer or candidate.", 400);
  if (JSON.stringify(signal).length > 64 * 1024) throw new HttpError("Signal too large.", 413);
  const me = await participantOf(call.id, user.id);
  if (isGroupCall(call) && me?.status !== "joined") throw new HttpError("Join the call before signalling.", 409);
  const to = isGroupCall(call) ? Number(body.to) : Number(body.to) || otherOf(call, user.id);
  if (!Number.isInteger(to) || to <= 0 || to === user.id) throw new HttpError("to must name another participant.", 400);
  const target = await participantOf(call.id, to);
  if (!target || (isGroupCall(call) ? target.status !== "joined" : false)) throw new HttpError("That person is not in the call.", 404);
  publish(to, { type: "call", action: "signal", call_id: call.id, from: user.id, signal });
  return ok({ relayed: true, to });
});
