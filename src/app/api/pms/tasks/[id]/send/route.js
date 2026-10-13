import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { sendTask } from "@/lib/pms-sync";

/** Send what was picked to the task's ticket, or ({ dry_run: true }) show exactly what would go. */
export const POST = handler(async (request, params, user) => ok(await sendTask(user, requireId(params.id), await readJson(request))));
