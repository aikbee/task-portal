import { handler, ok, requireId } from "@/lib/api-utils";
import { purgeOne } from "@/lib/trash";

/** Delete one entry for good, files included. */
export const DELETE = handler(async (_request, params, user) => ok({ purged: await purgeOne(user, requireId(params.id)) }));
