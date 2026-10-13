import { handler, ok, requireId } from "@/lib/api-utils";
import { unlinkTask } from "@/lib/pms-sync";

/** Unlink the task from its ticket here; the ticket stays in Bitara PMS. */
export const DELETE = handler(async (_req, params, user) => ok({ link: await unlinkTask(user, requireId(params.id)) }));
