import { query, queryOne, execute, withTransaction } from "@/lib/db";
import { moveToTrash } from "@/lib/trash";
import { attachAssignees } from "@/lib/task-assignees";
import { handler, ok, readJson, pick, requireId, HttpError } from "@/lib/api-utils";
import { nextSortOrder } from "@/lib/ordering";
import { REQ_FIELDS, REQ_SELECT, normaliseRequirement, assertRequirementRefs, nextRequirementCode, normaliseCode, assertCodeFree, bumpSequence } from "../route";
import { TASK_SELECT } from "../../tasks/route";
import { listAttachments } from "@/lib/attachments";
import { notifyInvolved } from "@/lib/notifications";
import { REQ_STATUS } from "@/lib/constants";

export async function getRequirement(id, owner) {
  const req = await queryOne(`${REQ_SELECT} WHERE r.id = ? AND r.profile_id = ?`, [id, owner]);
  if (!req) throw new HttpError("Requirement not found.", 404);
  req.tasks = await attachAssignees(await query(`${TASK_SELECT} WHERE t.requirement_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.sort_order`, [id]));
  req.attachments = await listAttachments("requirement", id);
  return req;
}

export const GET = handler(async (_req, params, user) => ok(await getRequirement(requireId(params.id), user.profile_id)));

export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  const existing = await getRequirement(id, owner);
  const body = await readJson(request);
  const data = normaliseRequirement(pick(body, REQ_FIELDS));
  if (data.title === null) throw new HttpError("Title is required.", 400);
  if (data.project_id === null) throw new HttpError("Project is required.", 400);
  await assertRequirementRefs(owner, data);

  let customCode = null;
  if ("code" in body) {
    customCode = normaliseCode(body.code);
    if (!customCode) throw new HttpError("Code is required.", 400);
  }
  const movingProject = data.project_id && data.project_id !== existing.project_id;
  const targetProject = movingProject ? data.project_id : existing.project_id;
  if (customCode && customCode !== existing.code) {
    await assertCodeFree(targetProject, customCode, id);
    await bumpSequence(targetProject, customCode);
    data.code = customCode;
  } else if (customCode && movingProject) {
    await assertCodeFree(targetProject, customCode, id);
    data.code = customCode;
  }
  await withTransaction(async (conn) => {
    if (movingProject) {
      if (!data.code) data.code = await nextRequirementCode(data.project_id);
      data.sort_order = await nextSortOrder("requirements", data.project_id);
      await conn.execute("UPDATE tasks SET requirement_id = NULL WHERE requirement_id = ?", [id]);
    }
    const cols = Object.keys(data);
    if (cols.length) await conn.execute(`UPDATE requirements SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...cols.map((c) => data[c]), id, owner]);
  });
  const after = await getRequirement(id, owner);
  if (data.status && data.status !== existing.status) {
    notifyInvolved(user, {
      type: after.status === "done" ? "requirement_done" : "requirement_status",
      title: after.status === "done" ? `Requirement delivered: ${after.code} ${after.title}` : `${after.code} ${after.title} is now ${REQ_STATUS[after.status]?.label ?? after.status}`,
      body: after.project_name,
      href: `/requirements/${id}`,
      entityType: "requirement",
      entityId: id,
    }, { employeeIds: [after.employee_id], managers: true });
  }
  return ok(after);
});

/** To the recycle bin with its files; linked tasks lose the link and get it back on restore. */
export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  const { trash_id } = await moveToTrash(user, "requirement", id);
  return ok({ id, trash_id });
});
