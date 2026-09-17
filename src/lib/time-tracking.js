import { query, queryOne, execute } from "./db";

/** Time entries of a task, newest first; a running timer carries `elapsed_seconds`. */
export async function listTime(taskId, user) {
  const rows = await query(
    `SELECT e.id, e.task_id, e.user_id, COALESCE(u.name, e.user_name) AS user_name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, e.minutes, e.spent_on, e.note, e.started_at,
       IF(e.started_at IS NULL, NULL, TIMESTAMPDIFF(SECOND, e.started_at, NOW())) AS elapsed_seconds
     FROM time_entries e LEFT JOIN users u ON u.id = e.user_id WHERE e.task_id = ? ORDER BY e.started_at IS NULL, e.spent_on DESC, e.id DESC`,
    [taskId]
  );
  const entries = rows.map((r) => ({ ...r, running: r.started_at != null, mine: r.user_id === user.id }));
  return { entries, total_minutes: entries.reduce((n, e) => n + Number(e.minutes), 0), running: entries.find((e) => e.running && e.mine) ?? null };
}

/** My running timer, wherever it is (any profile I can or could open): { id, task_id, task_title, profile_id, elapsed_seconds }. */
export const runningFor = (userId) =>
  queryOne(
    `SELECT e.id, e.task_id, t.title AS task_title, t.profile_id, e.started_at, TIMESTAMPDIFF(SECOND, e.started_at, NOW()) AS elapsed_seconds
     FROM time_entries e JOIN tasks t ON t.id = e.task_id WHERE e.user_id = ? AND e.started_at IS NOT NULL ORDER BY e.id DESC LIMIT 1`,
    [userId]
  );

/** Stop my running timer: at least a minute, at most a day (a forgotten timer must not log a week). */
export async function stopRunning(userId) {
  const run = await runningFor(userId);
  if (!run) return null;
  const minutes = Math.min(24 * 60, Math.max(1, Math.round(Number(run.elapsed_seconds) / 60)));
  await execute("UPDATE time_entries SET minutes = ?, started_at = NULL WHERE id = ?", [minutes, run.id]);
  return { ...run, minutes };
}
