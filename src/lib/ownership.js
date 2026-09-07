import { query, queryOne } from "./db";
import { HttpError } from "./http-error";

/** Keep only the employee ids that belong to the active profile (`owner` = profile id). */
export async function ownedEmployeeIds(owner, ids) {
  const wanted = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!wanted.length) return [];
  const rows = await query("SELECT id FROM employees WHERE profile_id = ? AND id IN (?)", [owner, wanted]);
  return rows.map((r) => r.id);
}

/** Keep only the project ids that belong to the owner's workspace. */
export async function ownedProjectIds(owner, ids) {
  const wanted = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!wanted.length) return [];
  const rows = await query("SELECT id FROM projects WHERE profile_id = ? AND id IN (?)", [owner, wanted]);
  return rows.map((r) => r.id);
}

/** A task may only reference a project / employee from the same workspace. */
export async function assertTaskRefs(owner, data) {
  if (data.project_id) {
    const p = await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [data.project_id, owner]);
    if (!p) throw new HttpError("Project not found in this workspace.", 400);
  }
  if (data.employee_id) {
    const e = await queryOne("SELECT id FROM employees WHERE id = ? AND profile_id = ?", [data.employee_id, owner]);
    if (!e) throw new HttpError("Employee not found in this workspace.", 400);
  }
}

/** A task may link to a requirement of the same workspace; the task then belongs to that requirement's project. */
export async function assertTaskRequirement(owner, data) {
  if (!data.requirement_id) return;
  const r = await queryOne("SELECT id, project_id FROM requirements WHERE id = ? AND profile_id = ?", [data.requirement_id, owner]);
  if (!r) throw new HttpError("Requirement not found in this workspace.", 400);
  if (data.project_id && Number(data.project_id) !== r.project_id) throw new HttpError("The requirement belongs to a different project.", 400);
  if (!("project_id" in data) || data.project_id == null) data.project_id = r.project_id;
}

/** Task row scoped to the owner (404 otherwise). */
export async function ownedTask(owner, taskId) {
  const t = await queryOne("SELECT id FROM tasks WHERE id = ? AND profile_id = ?", [taskId, owner]);
  if (!t) throw new HttpError("Task not found.", 404);
  return t;
}
