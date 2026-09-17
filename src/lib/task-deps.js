import { query } from "./db";
import { notifyInvolved } from "./notifications";

/** Task dependencies: "task_id waits for depends_on_id". */
const LIGHT = `t.id, t.title, t.status, t.priority, t.start_date, t.due_date, p.code AS project_code, p.color AS project_color, CONCAT(e.first_name, ' ', e.last_name) AS assignee_name`;
const JOINS = "LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN employees e ON e.id = t.employee_id";

export async function listDeps(taskId) {
  const [blocked_by, blocking] = await Promise.all([
    query(`SELECT ${LIGHT} FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id ${JOINS} WHERE d.task_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.id`, [taskId]),
    query(`SELECT ${LIGHT} FROM task_dependencies d JOIN tasks t ON t.id = d.task_id ${JOINS} WHERE d.depends_on_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.id`, [taskId]),
  ]);
  return { blocked_by, blocking, open: blocked_by.filter((t) => t.status !== "done").length };
}

/** Every pair inside a profile (for the timeline's arrows). */
export const allDeps = (profileId) => query("SELECT d.task_id, d.depends_on_id FROM task_dependencies d JOIN tasks t ON t.id = d.task_id WHERE t.profile_id = ?", [profileId]);

/** Would "taskId waits for dependsOnId" close a loop? True when dependsOnId already waits, directly or not, for taskId. */
export async function wouldCycle(taskId, dependsOnId) {
  const seen = new Set([dependsOnId]);
  let frontier = [dependsOnId];
  for (let depth = 0; frontier.length && depth < 200; depth++) {
    const rows = await query("SELECT depends_on_id FROM task_dependencies WHERE task_id IN (?)", [frontier]);
    frontier = [];
    for (const r of rows) {
      if (r.depends_on_id === taskId) return true;
      if (!seen.has(r.depends_on_id)) {
        seen.add(r.depends_on_id);
        frontier.push(r.depends_on_id);
      }
    }
  }
  return false;
}

/** A task was finished: tell the people behind every task that was only waiting for this one. Never throws. */
export async function announceUnblocked(user, doneTask) {
  try {
    const freed = await query(
      `SELECT t.id, t.title, t.employee_id FROM task_dependencies d JOIN tasks t ON t.id = d.task_id
       WHERE d.depends_on_id = ? AND t.status <> 'done'
         AND NOT EXISTS (SELECT 1 FROM task_dependencies o JOIN tasks ot ON ot.id = o.depends_on_id WHERE o.task_id = t.id AND ot.status <> 'done')`,
      [doneTask.id]
    );
    for (const t of freed) {
      notifyInvolved(user, { type: "task_unblocked", title: `${t.title} is no longer blocked`, body: `${doneTask.title} is done`, href: `/tasks/${t.id}`, entityType: "task", entityId: t.id }, { taskIds: [t.id] });
    }
  } catch {}
}
