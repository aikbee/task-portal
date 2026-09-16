import { handler, ok, requireId } from "@/lib/api-utils";
import { callFor, shapeCall } from "@/lib/calls";

/** One call's current state, with the people in it (any member of the conversation). */
export const GET = handler(async (_request, params, user) => ok(await shapeCall(await callFor(requireId(params.id), user.id))));
