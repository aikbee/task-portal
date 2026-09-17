import { query, queryOne, execute } from "./db";
import { nextOccurrence } from "./recurrence";
import { nextSortOrder } from "./ordering";
import { logTask } from "./task-activity";
import { notifyInvolved } from "./notifications";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * A repeating task was completed: make the next one, once. It takes the title, description, project, assignee,
 * requirement, priority, tags, estimate, the repeat settings and the checklist (unticked); comments, files,
 * outputs, time and dependencies stay with the finished task. Returns { id, title, start_date, due_date } or null.
 */
export async function spawnNext(user, done, { today = todayIso() } = {}) {
  if (!done.repeat_rule || done.repeat_next_id) return null;
  const dates = nextOccurrence(done, today);
  if (!dates) return null;
  const series = done.repeat_series_id ?? done.id;
  const res = await execute(
    `INSERT INTO tasks (user_id, profile_id, title, description, project_id, employee_id, requirement_id, status, priority, start_date, due_date, estimate_hours, tags, repeat_rule, repeat_until, repeat_series_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [done.user_id, done.profile_id, done.title, done.description ?? null, done.project_id ?? null, done.employee_id ?? null, done.requirement_id ?? null, done.priority, dates.start_date, dates.due_date, done.estimate_hours ?? null, done.tags ?? null, done.repeat_rule, done.repeat_until ?? null, series, await nextSortOrder("tasks")]
  );
  const nextId = res.insertId;
  // only the first finisher links the successor: a second request that raced us keeps its own row out of the series
  const linked = await execute("UPDATE tasks SET repeat_next_id = ?, repeat_series_id = ? WHERE id = ? AND repeat_next_id IS NULL", [nextId, series, done.id]);
  if (!linked.affectedRows) {
    await execute("DELETE FROM tasks WHERE id = ?", [nextId]);
    return null;
  }
  // everybody who was on the finished task is on the next one, in the same order
  await execute("INSERT INTO task_assignees (task_id, employee_id, position) SELECT ?, employee_id, position FROM task_assignees WHERE task_id = ?", [nextId, done.id]);
  const items = await query("SELECT title, sort_order FROM task_checklist WHERE task_id = ? ORDER BY sort_order, id", [done.id]);
  if (items.length) await query("INSERT INTO task_checklist (task_id, title, sort_order) VALUES ?", [items.map((k) => [nextId, k.title, k.sort_order])]);
  const when = dates.due_date ?? dates.start_date;
  await logTask(user, nextId, { action: "created_from_repeat", old: `#${done.id}` });
  await logTask(user, done.id, { action: "repeat_spawned", next: when });
  const next = await queryOne("SELECT id, title, start_date, due_date, employee_id FROM tasks WHERE id = ?", [nextId]);
  notifyInvolved(user, { type: "task_created", title: `Next in the series: ${next.title}`, body: when ? `Due ${when}` : null, href: `/tasks/${nextId}`, entityType: "task", entityId: nextId }, { taskIds: [nextId] });
  return { id: next.id, title: next.title, start_date: next.start_date, due_date: next.due_date };
}
