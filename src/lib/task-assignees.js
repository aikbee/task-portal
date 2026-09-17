import { query, execute, withTransaction } from "./db";
import { HttpError } from "./http-error";
import { ownedEmployeeIds } from "./ownership";

/**
 * Several people on one task. `task_assignees` holds everybody in order; position 0 is the lead and is mirrored
 * in `tasks.employee_id`, which older code (board columns, reports, joins) keeps reading.
 */
export const MAX_ASSIGNEES = 12;

/** Add `assignees` ([{ id, name, avatar_color, job_title, linked_user_id }], lead first) and `assignee_names` to task rows. */
export async function attachAssignees(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return rows;
  const found = await query(
    `SELECT a.task_id, e.id, CONCAT(e.first_name, ' ', e.last_name) AS name, e.avatar_color, e.job_title, e.linked_user_id
     FROM task_assignees a JOIN employees e ON e.id = a.employee_id WHERE a.task_id IN (?) ORDER BY a.position, a.created_at, e.id`,
    [list.map((t) => t.id)]
  );
  const by = new Map();
  for (const r of found) {
    const { task_id, ...person } = r;
    if (!by.has(task_id)) by.set(task_id, []);
    by.get(task_id).push(person);
  }
  for (const t of list) {
    t.assignees = by.get(t.id) ?? [];
    t.assignee_names = t.assignees.map((p) => p.name).join(", ") || null;
  }
  return rows;
}

export const assigneeIdsOf = async (taskId) => (await query("SELECT employee_id FROM task_assignees WHERE task_id = ? ORDER BY position, created_at, employee_id", [taskId])).map((r) => r.employee_id);

/** Replace everybody on a task. `ids` in order, the first is the lead. Unknown or foreign employees are refused. */
export async function setAssignees(taskId, profileId, ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (wanted.length > MAX_ASSIGNEES) throw new HttpError(`A task takes up to ${MAX_ASSIGNEES} assignees.`, 400);
  const owned = new Set(await ownedEmployeeIds(profileId, wanted));
  if (wanted.some((id) => !owned.has(id))) throw new HttpError("Employee not found in this workspace.", 400);
  await withTransaction(async (conn) => {
    await conn.execute("DELETE FROM task_assignees WHERE task_id = ?", [taskId]);
    if (wanted.length) await conn.query("INSERT INTO task_assignees (task_id, employee_id, position) VALUES ?", [wanted.map((id, i) => [taskId, id, i])]);
    await conn.execute("UPDATE tasks SET employee_id = ? WHERE id = ?", [wanted[0] ?? null, taskId]);
  });
  return wanted;
}

/**
 * What a request means for the list of assignees, or null when it does not touch them:
 *   assignee_ids: [...]   the new list, lead first
 *   employee_id: X        (older callers, board columns) X becomes the lead, the others stay
 *   employee_id: null     nobody is assigned any more
 */
export function nextAssignees(body, current = []) {
  if (Array.isArray(body.assignee_ids)) return body.assignee_ids;
  if (!("employee_id" in body)) return null;
  const lead = body.employee_id ? Number(body.employee_id) : null;
  if (!lead) return [];
  return [lead, ...current.slice(1).filter((id) => id !== lead)];
}

/** An employee was deleted: tasks that lost their lead get the next person in line. */
export const repairLeads = (profileId) =>
  execute(
    `UPDATE tasks t SET t.employee_id = (SELECT a.employee_id FROM task_assignees a WHERE a.task_id = t.id ORDER BY a.position, a.created_at LIMIT 1)
     WHERE t.profile_id = ? AND t.employee_id IS NULL AND EXISTS (SELECT 1 FROM task_assignees x WHERE x.task_id = t.id)`,
    [profileId]
  );
