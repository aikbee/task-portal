import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { listDeps, wouldCycle } from "@/lib/task-deps";
import { logTask } from "@/lib/task-activity";
import { getTask } from "../route";

const MAX_DEPS = 25;

/** { blocked_by: [...], blocking: [...], open } */
export const GET = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  return ok(await listDeps(id));
});

/** { depends_on_id }: this task waits for that one. Same profile only, no loops. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  const dependsOn = Number((await readJson(request)).depends_on_id);
  if (!Number.isInteger(dependsOn) || dependsOn <= 0) throw new HttpError("Pick the task this one waits for.", 400);
  if (dependsOn === id) throw new HttpError("A task cannot wait for itself.", 400);
  const other = await queryOne("SELECT id, title FROM tasks WHERE id = ? AND profile_id = ?", [dependsOn, user.profile_id]);
  if (!other) throw new HttpError("That task is not in this profile.", 404);
  if (await queryOne("SELECT 1 AS x FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?", [id, dependsOn])) throw new HttpError("That dependency already exists.", 409);
  const current = await listDeps(id);
  if (current.blocked_by.length >= MAX_DEPS) throw new HttpError(`A task can wait for up to ${MAX_DEPS} others.`, 400);
  if (await wouldCycle(id, dependsOn)) throw new HttpError(`That would make a loop: "${other.title}" already waits for this task.`, 409);
  await execute("INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)", [id, dependsOn]);
  await logTask(user, id, { action: "dependency_added", next: other.title });
  return ok(await listDeps(id), { status: 201 });
});
