import { handler, ok, requireId } from "@/lib/api-utils";
import { refreshTask } from "@/lib/pms-sync";

/** Ask Bitara PMS for the linked ticket's status now. */
export const POST = handler(async (_req, params, user) => ok({ link: await refreshTask(user, requireId(params.id)) }));
