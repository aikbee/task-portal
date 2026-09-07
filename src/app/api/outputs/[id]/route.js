import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { setPosition, applyOrder } from "@/lib/ordering";
import { listOutputs } from "../../tasks/[id]/route";
import { blockPatch } from "@/lib/block-body";

async function find(id, owner) {
  const out = await queryOne("SELECT o.* FROM task_outputs o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND t.profile_id = ?", [id, owner]);
  if (!out) throw new HttpError("Output not found.", 404);
  return out;
}

/** Update: { title?, content?, position? } → ordered list for the task */
export const PUT = handler(async (request, params, user) => {
  const out = await find(requireId(params.id), user.profile_id);
  const body = await readJson(request);
  const patch = blockPatch(body, out);
  const keys = Object.keys(patch);
  if (keys.length) await execute(`UPDATE task_outputs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => patch[k]), out.id]);
  if (body.position != null) await setPosition("task_outputs", out.task_id, out.id, body.position);
  return ok(await listOutputs(out.task_id));
});

export const DELETE = handler(async (_req, params, user) => {
  const out = await find(requireId(params.id), user.profile_id);
  await execute("DELETE FROM task_outputs WHERE id = ?", [out.id]);
  await applyOrder("task_outputs", out.task_id, []);
  return ok(await listOutputs(out.task_id));
});
