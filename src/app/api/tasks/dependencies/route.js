import { handler, ok } from "@/lib/api-utils";
import { allDeps } from "@/lib/task-deps";

/** Every dependency pair of the active profile: [{ task_id, depends_on_id }] (the timeline draws them as arrows). */
export const GET = handler(async (_request, _params, user) => ok(await allDeps(user.profile_id)));
