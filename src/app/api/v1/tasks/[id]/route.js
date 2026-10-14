import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { getTask, updateTask } from "@/app/api/tasks/[id]/route";
import { moveToTrash } from "@/lib/trash";
import { emit } from "@/lib/webhooks";
import { taskBody, tasksOut, assertExternalFree } from "@/lib/api-v1";

/** One task. */
export const GET = handler(async (_request, params, user) => ok((await tasksOut([await getTask(requireId(params.id), user.profile_id)]))[0]));

/** Change a task: any field of POST /tasks, plus add_assignees / remove_assignees. Only what is sent changes. */
export const PATCH = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const current = await getTask(id, user.profile_id);
  const body = await taskBody(user, await readJson(request), { current });
  if ("external_id" in body) await assertExternalFree(user, body.external_id, id);
  const { after } = await updateTask(user, id, body);
  return ok((await tasksOut([after]))[0]);
});

/** Move a task to the recycle bin (restorable for 30 days in the app). */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  const { trash_id, title } = await moveToTrash(user, "task", id);
  emit(user, "task.deleted", { id, title, trash_id });
  return ok({ id, deleted: true, trash_id });
});
