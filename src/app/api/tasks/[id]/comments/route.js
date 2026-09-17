import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { listComments } from "@/lib/task-activity";
import { notify } from "@/lib/notifications";
import { parseMentions, displayMentions } from "@/lib/mentions";
import { can } from "@/lib/sharing";

export const COMMENT_MAX = 5000;
export const shapeComments = (rows, user) => rows.map((c) => ({ ...c, mine: c.user_id === user.id, can_delete: c.user_id === user.id || can(user, "manager") }));

async function taskOf(id, profileId) {
  const task = await queryOne("SELECT t.id, t.title, t.employee_id, t.profile_id, p.user_id AS owner_id FROM tasks t JOIN profiles p ON p.id = t.profile_id WHERE t.id = ? AND t.profile_id = ?", [id, profileId]);
  if (!task) throw new HttpError("Task not found.", 404);
  return task;
}
export function cleanBody(raw) {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) throw new HttpError("Write something first.", 400);
  if (body.length > COMMENT_MAX) throw new HttpError(`A comment holds up to ${COMMENT_MAX} characters.`, 400);
  return body;
}

/** The discussion on a task, oldest first. Everyone who can see the task can read it. */
export const GET = handler(async (_request, params, user) => {
  const task = await taskOf(requireId(params.id), user.profile_id);
  return ok(shapeComments(await listComments(task.id), user));
});

/**
 * { body }: add a comment (editors and up; the central guard already refuses viewers). People tagged with
 * @[Name](employee:id) whose employee record is linked to an account get a "mentioned you" entry; the owner,
 * the linked assignee and everybody who commented before get "commented on".
 */
export const POST = handler(async (request, params, user) => {
  const task = await taskOf(requireId(params.id), user.profile_id);
  const body = cleanBody((await readJson(request)).body);
  const res = await execute("INSERT INTO task_comments (task_id, user_id, author_name, body) VALUES (?, ?, ?, ?)", [task.id, user.id, user.name, body]);

  // only people who can still open the profile hear about it
  const allowed = new Set([task.owner_id, ...(await query("SELECT user_id FROM profile_members WHERE profile_id = ? AND status = 'active'", [task.profile_id])).map((r) => r.user_id)]);
  const mentionedEmployees = parseMentions(body).filter((m) => m.type === "employee").map((m) => m.id);
  const linkedOf = async (ids) => (ids.length ? (await query("SELECT DISTINCT linked_user_id AS id FROM employees WHERE profile_id = ? AND id IN (?) AND linked_user_id IS NOT NULL", [task.profile_id, ids])).map((r) => r.id) : []);
  const mentioned = new Set((await linkedOf(mentionedEmployees)).filter((id) => allowed.has(id) && id !== user.id));
  const earlier = (await query("SELECT DISTINCT user_id FROM task_comments WHERE task_id = ?", [task.id])).map((r) => r.user_id);
  const followers = new Set([task.owner_id, ...(await linkedOf((await query("SELECT employee_id FROM task_assignees WHERE task_id = ?", [task.id])).map((r) => r.employee_id))), ...earlier].filter((id) => allowed.has(id) && id !== user.id && !mentioned.has(id)));
  const preview = displayMentions(body).replace(/\s+/g, " ").slice(0, 200);
  const base = { body: preview, href: `/tasks/${task.id}#activity`, entityType: "task", entityId: task.id, actorId: user.id, profileId: task.profile_id };
  await Promise.all([
    ...[...mentioned].map((userId) => notify({ ...base, userId, type: "task_mention", title: `${user.name} mentioned you on ${task.title}` }).catch(() => false)),
    ...[...followers].map((userId) => notify({ ...base, userId, type: "task_comment", title: `${user.name} commented on ${task.title}` }).catch(() => false)),
  ]);
  return ok({ created_id: res.insertId, items: shapeComments(await listComments(task.id), user) }, { status: 201 });
});
