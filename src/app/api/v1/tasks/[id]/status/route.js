import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { getTask, updateTask } from "@/app/api/tasks/[id]/route";
import { V1_STATUSES } from "@/lib/api-v1";
import { TASK_STATUS } from "@/lib/constants";
import { HttpError } from "@/lib/http-error";

const shape = (t) => ({ id: t.id, status: t.status, label: TASK_STATUS[t.status]?.label ?? t.status, done: t.status === "done", updated_at: t.updated_at instanceof Date ? t.updated_at.toISOString() : t.updated_at });

/** Just the status of a task: cheap to poll. */
export const GET = handler(async (_request, params, user) => ok(shape(await getTask(requireId(params.id), user.profile_id))));

/** Move a task to another status: { status }. */
export const PUT = handler(async (request, params, user) => {
  const { status } = await readJson(request);
  if (!V1_STATUSES.includes(status)) throw new HttpError(`status must be one of: ${V1_STATUSES.join(", ")}.`, 400);
  const { after } = await updateTask(user, requireId(params.id), { status });
  return ok(shape(after));
});
