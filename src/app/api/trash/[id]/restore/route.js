import { handler, ok, requireId } from "@/lib/api-utils";
import { restoreFromTrash } from "@/lib/trash";

/** Put the record back: same id, everything that was attached to it, and the links other records had to it. */
export const POST = handler(async (_request, params, user) => ok(await restoreFromTrash(user, requireId(params.id))));
