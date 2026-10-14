import { handler, ok, readJson } from "@/lib/api-utils";
import { TASK_SELECT, createTask } from "@/app/api/tasks/route";
import { attachAssignees } from "@/lib/task-assignees";
import { taskBody, tasksOut, listTasks, idempotent, assertExternalFree, page } from "@/lib/api-v1";
import { HttpError } from "@/lib/http-error";

/** Tasks of the workspace: filters, paging (limit, cursor), updated_since. See /developers. */
export const GET = handler(async (request, _params, user) => {
  const { rows, next_cursor } = await listTasks(user, request.nextUrl.searchParams, TASK_SELECT);
  return page(await tasksOut(await attachAssignees(rows)), next_cursor);
});

/** Create a task. Assignees by email or employee id; external_id to find it again; Idempotency-Key makes retries safe. */
export const POST = handler(async (request, _params, user) =>
  idempotent(request, user, async () => {
    const body = await taskBody(user, await readJson(request));
    if (!String(body.title ?? "").trim()) throw new HttpError("title is required.", 400);
    await assertExternalFree(user, body.external_id);
    const row = await createTask(user, body);
    return ok((await tasksOut([row]))[0], { status: 201 });
  })
);
