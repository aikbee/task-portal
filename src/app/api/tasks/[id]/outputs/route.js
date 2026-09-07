import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { applyOrder, nextSortOrder } from "@/lib/ordering";
import { ownedTask } from "@/lib/ownership";
import { listOutputs } from "../route";
import { blockPatch } from "@/lib/block-body";

/** Create an output: { title, content } → { items, created_id } */
export const POST = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  await ownedTask(user.profile_id, taskId);
  const body = await readJson(request);
  const order = await nextSortOrder("task_outputs", taskId);
  const b = blockPatch({ title: body.title ?? "", content: body.content ?? null, format: body.format ?? "text" });
  const res = await execute("INSERT INTO task_outputs (task_id, title, content, format, sort_order) VALUES (?, ?, ?, ?, ?)", [taskId, b.title, b.content, b.format, order]);
  return ok({ items: await listOutputs(taskId), created_id: res.insertId }, { status: 201 });
});

/** Reorder: { order: [outputId, ...] } */
export const PUT = handler(async (request, params, user) => {
  const taskId = requireId(params.id);
  await ownedTask(user.profile_id, taskId);
  const body = await readJson(request);
  if (!Array.isArray(body.order)) throw new HttpError("order must be an array of ids.", 400);
  await applyOrder("task_outputs", taskId, body.order);
  return ok(await listOutputs(taskId));
});
