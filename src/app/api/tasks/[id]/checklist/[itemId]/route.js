import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { applyOrder } from "@/lib/ordering";
import { logTask } from "@/lib/task-activity";
import { listChecklist } from "../../route";
import { ITEM_MAX } from "../route";

async function find(taskId, itemId, profileId) {
  const row = await queryOne("SELECT k.* FROM task_checklist k JOIN tasks t ON t.id = k.task_id WHERE k.id = ? AND k.task_id = ? AND t.profile_id = ?", [itemId, taskId, profileId]);
  if (!row) throw new HttpError("Checklist item not found.", 404);
  return row;
}

/** { title?, done? }: rename or tick off a subtask. */
export const PUT = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  const item = await find(taskId, requireId(params.itemId), user.profile_id);
  const body = await readJson(request);
  if ("title" in body) {
    const title = String(body.title ?? "").trim().slice(0, ITEM_MAX);
    if (!title) throw new HttpError("A checklist item needs a title.", 400);
    await execute("UPDATE task_checklist SET title = ? WHERE id = ?", [title, item.id]);
  }
  if ("done" in body && Boolean(body.done) !== Boolean(item.done)) {
    const done = Boolean(body.done);
    await execute("UPDATE task_checklist SET done = ?, done_by = ?, done_at = ? WHERE id = ?", [done ? 1 : 0, done ? user.id : null, done ? new Date() : null, item.id]);
    await logTask(user, taskId, { action: done ? "checklist_done" : "checklist_undone", next: body.title ? String(body.title).trim().slice(0, ITEM_MAX) : item.title });
  }
  return ok(await listChecklist(taskId));
});

export const DELETE = handler(async (_request, params, user) => {
  const taskId = requireId(params.id);
  const item = await find(taskId, requireId(params.itemId), user.profile_id);
  await execute("DELETE FROM task_checklist WHERE id = ?", [item.id]);
  await applyOrder("task_checklist", taskId, []);
  await logTask(user, taskId, { action: "checklist_removed", old: item.title });
  return ok(await listChecklist(taskId));
});
