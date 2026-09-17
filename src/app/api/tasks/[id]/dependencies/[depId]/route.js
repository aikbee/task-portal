import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { listDeps } from "@/lib/task-deps";
import { logTask } from "@/lib/task-activity";
import { getTask } from "../../route";

/** This task no longer waits for :depId. */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const depId = requireId(params.depId);
  await getTask(id, user.profile_id);
  const other = await queryOne("SELECT t.title FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id WHERE d.task_id = ? AND d.depends_on_id = ?", [id, depId]);
  if (!other) throw new HttpError("That dependency does not exist.", 404);
  await execute("DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?", [id, depId]);
  await logTask(user, id, { action: "dependency_removed", old: other.title });
  return ok(await listDeps(id));
});
