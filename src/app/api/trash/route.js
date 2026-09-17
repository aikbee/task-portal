import { handler, ok } from "@/lib/api-utils";
import { listTrash, emptyTrash, TRASH_DAYS } from "@/lib/trash";

/** What is in the recycle bin of the active profile (owner and managers; Info entries only for the owner). */
export const GET = handler(async (_request, _params, user) => ok({ items: await listTrash(user), days: TRASH_DAYS }));

/** Empty the bin: everything I can see in it is deleted for good, files included. */
export const DELETE = handler(async (_request, _params, user) => ok({ purged: await emptyTrash(user) }));
