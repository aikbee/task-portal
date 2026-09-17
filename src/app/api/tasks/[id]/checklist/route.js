import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { applyOrder, nextSortOrder } from "@/lib/ordering";
import { logTask } from "@/lib/task-activity";
import { getTask, listChecklist } from "../route";

export const ITEM_MAX = 300;
const LIST_MAX = 100;

/** { title } adds a subtask; a title with several lines (a pasted list) adds one per line. */
export const POST = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  await getTask(taskId, user.profile_id);
  const { title } = await readJson(request);
  const titles = String(title ?? "").split(/\r?\n/).map((t) => t.replace(/^\s*(?:[-*•]\s+)?(?:\d+[.)]\s+)?(?:\[[ xX]?\]\s*)?/, "").trim()).filter(Boolean).map((t) => t.slice(0, ITEM_MAX));
  if (!titles.length) throw new HttpError("Write what needs doing first.", 400);
  const existing = (await listChecklist(taskId)).length;
  if (existing + titles.length > LIST_MAX) throw new HttpError(`A checklist holds up to ${LIST_MAX} items.`, 400);
  let order = await nextSortOrder("task_checklist", taskId);
  for (const t of titles) await execute("INSERT INTO task_checklist (task_id, title, sort_order) VALUES (?, ?, ?)", [taskId, t, order++]);
  await logTask(user, taskId, titles.map((t) => ({ action: "checklist_added", next: t })));
  return ok(await listChecklist(taskId), { status: 201 });
});

/** Reorder: { order: [itemId, …] } */
export const PUT = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  await getTask(taskId, user.profile_id);
  const body = await readJson(request);
  if (!Array.isArray(body.order)) throw new HttpError("order must be an array of ids.", 400);
  await applyOrder("task_checklist", taskId, body.order);
  return ok(await listChecklist(taskId));
});
