import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { publish } from "@/lib/chat";
import { callFor, otherOf } from "@/lib/calls";

const TYPES = new Set(["offer", "answer", "candidate"]);

/** Relay one WebRTC signal ({ type: offer | answer | candidate, ... }) to the other participant of an active call. Nothing is stored. */
export const POST = handler(async (request, params, user) => {
  const call = await callFor(requireId(params.id), user.id);
  if (call.status !== "active") throw new HttpError("Signals can only be sent during an active call.", 409);
  const signal = (await readJson(request)).signal;
  if (!signal || !TYPES.has(signal.type)) throw new HttpError("signal.type must be offer, answer or candidate.", 400);
  if (JSON.stringify(signal).length > 64 * 1024) throw new HttpError("Signal too large.", 413);
  publish(otherOf(call, user.id), { type: "call", action: "signal", call_id: call.id, from: user.id, signal });
  return ok({ relayed: true });
});
