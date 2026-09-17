import { query } from "./db";

/**
 * The history of a task: who changed what. Values are stored as the text a person would read (names, codes,
 * dates), except status and priority, which keep their keys so the page can translate them.
 */
const clip = (v) => (v == null || v === "" ? null : String(v).slice(0, 255));

/** entries: [{ action, field?, old?, next? }]. Never throws: history must not break the change itself. */
export async function logTask(user, taskId, entries) {
  const rows = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  if (!rows.length) return;
  try {
    await query("INSERT INTO task_activity (task_id, user_id, actor_name, action, field, old_value, new_value) VALUES ?", [
      rows.map((e) => [taskId, user?.id ?? null, user?.name ?? null, e.action, e.field ?? null, clip(e.old), clip(e.next)]),
    ]);
  } catch (err) {
    console.error("[task-activity]", err.message);
  }
}

/** What changed between two loads of a task (rows of TASK_SELECT). */
export function diffTask(before, after) {
  const out = [];
  const changed = (field, a, b) => { if ((a ?? null) !== (b ?? null)) out.push({ action: "updated", field, old: a, next: b }); };
  changed("title", before.title, after.title);
  if ((before.description ?? "") !== (after.description ?? "")) out.push({ action: "updated", field: "description" });
  changed("status", before.status, after.status);
  changed("priority", before.priority, after.priority);
  changed("start_date", before.start_date, after.start_date);
  changed("due_date", before.due_date, after.due_date);
  if ((before.estimate_hours ?? null) !== (after.estimate_hours ?? null)) changed("estimate", before.estimate_hours == null ? null : `${before.estimate_hours} h`, after.estimate_hours == null ? null : `${after.estimate_hours} h`);
  if ((before.employee_id ?? null) !== (after.employee_id ?? null)) out.push({ action: "updated", field: "assignee", old: before.assignee_name, next: after.assignee_name });
  if ((before.project_id ?? null) !== (after.project_id ?? null)) out.push({ action: "updated", field: "project", old: before.project_name, next: after.project_name });
  if ((before.requirement_id ?? null) !== (after.requirement_id ?? null)) out.push({ action: "updated", field: "requirement", old: before.requirement_code, next: after.requirement_code });
  changed("tags", before.tags, after.tags);
  return out;
}

export const listHistory = (taskId) =>
  query(
    `SELECT a.id, a.user_id, COALESCE(u.name, a.actor_name) AS actor_name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, a.action, a.field, a.old_value, a.new_value, a.created_at
     FROM task_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = ? ORDER BY a.id`,
    [taskId]
  );

export const listComments = (taskId) =>
  query(
    `SELECT c.id, c.task_id, c.user_id, COALESCE(u.name, c.author_name) AS author_name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, c.body, c.edited_at, c.created_at
     FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id`,
    [taskId]
  );

