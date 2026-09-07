import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireId, HttpError } from "@/lib/api-utils";
import { TASK_FIELDS, TASK_SELECT, normaliseTask } from "../route";
import { deleteStoredFile } from "@/lib/uploads";
import { listAttachments as listKind } from "@/lib/attachments";
import { notifyOwner } from "@/lib/notifications";
import { TASK_STATUS } from "@/lib/constants";
import { assertTaskRefs, assertTaskRequirement } from "@/lib/ownership";

export async function getTask(id, owner) {
  const task = await queryOne(`${TASK_SELECT} WHERE t.id = ? AND t.profile_id = ?`, [id, owner]);
  if (!task) throw new HttpError("Task not found.", 404);
  task.attachments = await listAttachments(id);
  task.outputs = await listOutputs(id);
  return task;
}

export function listAttachments(taskId) {
  return listKind("task", taskId);
}
export function listOutputs(taskId) {
  return query("SELECT * FROM task_outputs WHERE task_id = ? ORDER BY sort_order, id", [taskId]);
}

export const GET = handler(async (_req, params, user) => ok(await getTask(requireId(params.id), user.profile_id)));

export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getTask(id, owner);
  const body = await readJson(request);
  const data = normaliseTask(pick(body, TASK_FIELDS));
  if (data.title === null) throw new HttpError("Title is required.", 400);
  await assertTaskRequirement(owner, data);
  await assertTaskRefs(owner, data);
  // moving a task to another project drops a requirement link from the old project
  if ("project_id" in data && !("requirement_id" in data)) {
    const cur = await queryOne("SELECT requirement_id, project_id FROM tasks WHERE id = ?", [id]);
    if (cur?.requirement_id && cur.project_id !== data.project_id) data.requirement_id = null;
  }
  const before = await getTask(id, owner);
  const cols = Object.keys(data);
  if (cols.length) await execute(`UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...cols.map((c) => data[c]), id, owner]);
  const after = await getTask(id, owner);
  if (data.status && data.status !== before.status) {
    notifyOwner(user, {
      type: after.status === "done" ? "task_done" : "task_status",
      title: after.status === "done" ? `Task completed: ${after.title}` : `${after.title} moved to ${TASK_STATUS[after.status]?.label ?? after.status}`,
      body: [after.project_name, after.assignee_name].filter(Boolean).join(" · ") || null,
      href: `/tasks/${id}`,
      entityType: "task",
      entityId: id,
    });
  }
  if ("employee_id" in data && data.employee_id !== before.employee_id && after.assignee_name) {
    notifyOwner(user, { type: "task_assigned", title: `${after.title} assigned to ${after.assignee_name}`, body: after.project_name || null, href: `/tasks/${id}`, entityType: "task", entityId: id });
  }
  return ok(after);
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getTask(id, owner);
  const files = await listAttachments(id);
  const res = await execute("DELETE FROM tasks WHERE id = ? AND profile_id = ?", [id, owner]);
  if (!res.affectedRows) throw new HttpError("Task not found.", 404);
  await Promise.all(files.map((f) => deleteStoredFile(f.stored_name).catch(() => {})));
  return ok({ id });
});
