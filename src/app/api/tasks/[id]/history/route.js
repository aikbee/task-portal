import { handler, ok, requireId } from "@/lib/api-utils";
import { listHistory } from "@/lib/task-activity";
import { getTask } from "../route";

/** Who changed what on this task, oldest first. */
export const GET = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  return ok(await listHistory(id));
});
