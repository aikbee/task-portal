import { handler, ok, requireId } from "@/lib/api-utils";
import { callFor, shapeCall } from "@/lib/calls";

/** One call's current state (either participant). */
export const GET = handler(async (_request, params, user) => ok(shapeCall(await callFor(requireId(params.id), user.id))));
