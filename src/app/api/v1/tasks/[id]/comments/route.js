import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { getTask } from "@/app/api/tasks/[id]/route";
import { addComment } from "@/app/api/tasks/[id]/comments/route";
import { listComments } from "@/lib/task-activity";
import { idempotent } from "@/lib/api-v1";

const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : v);
const shape = (c) => ({ id: c.id, body: c.body, author: c.author_name, via: c.via ?? null, created_at: iso(c.created_at), edited_at: iso(c.edited_at) });

/** The discussion on a task, oldest first. */
export const GET = handler(async (_request, params, user) => {
  const task = await getTask(requireId(params.id), user.profile_id);
  return ok((await listComments(task.id)).map(shape));
});

/** Comment on a task: { body } (Markdown; up to 5000 characters). People on the task are told. */
export const POST = handler(async (request, params, user) =>
  idempotent(request, user, async () => {
    const id = requireId(params.id);
    const { id: commentId } = await addComment(user, id, (await readJson(request)).body);
    const made = (await listComments(id)).find((c) => c.id === commentId);
    return ok(shape(made), { status: 201 });
  })
);
