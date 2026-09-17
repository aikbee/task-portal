import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { listComments } from "@/lib/task-activity";
import { can } from "@/lib/sharing";
import { shapeComments, cleanBody } from "../route";

async function find(taskId, commentId, profileId) {
  const row = await queryOne("SELECT c.* FROM task_comments c JOIN tasks t ON t.id = c.task_id WHERE c.id = ? AND c.task_id = ? AND t.profile_id = ?", [commentId, taskId, profileId]);
  if (!row) throw new HttpError("Comment not found.", 404);
  return row;
}

/** { body }: only the author rewrites a comment; it is marked as edited. */
export const PUT = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  const c = await find(taskId, requireId(params.commentId), user.profile_id);
  if (c.user_id !== user.id) throw new HttpError("Only the author can edit a comment.", 403);
  const body = cleanBody((await readJson(request)).body);
  if (body !== c.body) await execute("UPDATE task_comments SET body = ?, edited_at = NOW() WHERE id = ?", [body, c.id]);
  return ok(shapeComments(await listComments(taskId), user));
});

/** The author removes their own comment; the owner and managers may remove anyone's. */
export const DELETE = handler(async (_request, params, user) => {
  const taskId = requireId(params.id);
  const c = await find(taskId, requireId(params.commentId), user.profile_id);
  if (c.user_id !== user.id && !can(user, "manager")) throw new HttpError("Only the author, the owner or a manager can delete this comment.", 403);
  await execute("DELETE FROM task_comments WHERE id = ?", [c.id]);
  return ok(shapeComments(await listComments(taskId), user));
});
