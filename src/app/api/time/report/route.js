import { query } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const GROUPS = new Set(["person", "project", "task", "day"]);
const monthBounds = () => { const d = new Date(); const y = d.getUTCFullYear(), m = d.getUTCMonth(); return [new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)]; };

/**
 * Time logged in the active profile: ?from=&to= (default: this month), &group=person|project|task|day,
 * &project_id=, &user_id=. Answers the entries of the period (newest first, at most 5000), the totals per group,
 * a per-day series and the people who ever logged time here (for the filter).
 */
export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const [mFrom, mTo] = monthBounds();
  const from = sp.get("from") || mFrom;
  const to = sp.get("to") || mTo;
  if (!isDate(from) || !isDate(to)) throw new HttpError("from and to must be dates (YYYY-MM-DD).", 400);
  if (from > to) throw new HttpError("from is after to.", 400);
  const group = GROUPS.has(sp.get("group")) ? sp.get("group") : "person";
  const where = ["t.profile_id = ?", "e.started_at IS NULL", "e.spent_on BETWEEN ? AND ?"];
  const args = [user.profile_id, from, to];
  if (sp.get("project_id")) { where.push("t.project_id = ?"); args.push(Number(sp.get("project_id")) || 0); }
  if (sp.get("user_id")) { where.push("e.user_id = ?"); args.push(Number(sp.get("user_id")) || 0); }
  const entries = await query(
    `SELECT e.id, e.task_id, t.title AS task_title, t.status AS task_status, t.estimate_hours, t.project_id, p.name AS project_name, p.color AS project_color,
       e.user_id, COALESCE(u.name, e.user_name) AS user_name, u.avatar_color, COALESCE(u.avatar, 'preset:pro') AS avatar, e.minutes, e.spent_on, e.note
     FROM time_entries e JOIN tasks t ON t.id = e.task_id LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = e.user_id
     WHERE ${where.join(" AND ")} ORDER BY e.spent_on DESC, e.id DESC LIMIT 5000`,
    args
  );
  // estimates: the task's own, or every task of the project (so a project shows logged against planned)
  const projectEstimates = Object.fromEntries((await query("SELECT COALESCE(project_id, 0) AS pid, ROUND(SUM(estimate_hours) * 60) AS minutes FROM tasks WHERE profile_id = ? AND estimate_hours IS NOT NULL GROUP BY project_id", [user.profile_id])).map((r) => [r.pid, Number(r.minutes)]));
  const keyOf = { person: (e) => `u:${e.user_id}`, project: (e) => `p:${e.project_id ?? 0}`, task: (e) => `t:${e.task_id}`, day: (e) => e.spent_on }[group];
  const groups = new Map();
  for (const e of entries) {
    const k = keyOf(e);
    if (!groups.has(k)) {
      groups.set(k, {
        key: k, minutes: 0, entries: 0, people: new Set(), tasks: new Set(),
        label: group === "person" ? e.user_name : group === "project" ? e.project_name ?? "No project" : group === "task" ? e.task_title : e.spent_on,
        color: group === "person" ? e.avatar_color : group === "project" ? e.project_color : null,
        avatar: group === "person" ? e.avatar : null,
        id: group === "person" ? e.user_id : group === "project" ? e.project_id : group === "task" ? e.task_id : null,
        project_name: group === "task" ? e.project_name : null,
        estimate_minutes: group === "task" ? (e.estimate_hours != null ? Math.round(Number(e.estimate_hours) * 60) : null) : group === "project" ? projectEstimates[e.project_id ?? 0] ?? null : null,
      });
    }
    const g = groups.get(k);
    g.minutes += Number(e.minutes);
    g.entries += 1;
    g.people.add(e.user_id);
    g.tasks.add(e.task_id);
  }
  const total = entries.reduce((n, e) => n + Number(e.minutes), 0);
  const rows = [...groups.values()].map((g) => ({ ...g, people: g.people.size, tasks: g.tasks.size, share: total ? g.minutes / total : 0 })).sort((a, b) => (group === "day" ? (a.key < b.key ? 1 : -1) : b.minutes - a.minutes));
  const days = new Map();
  for (const e of entries) days.set(e.spent_on, (days.get(e.spent_on) ?? 0) + Number(e.minutes));
  const people = await query("SELECT DISTINCT e.user_id AS id, COALESCE(u.name, e.user_name) AS name FROM time_entries e JOIN tasks t ON t.id = e.task_id LEFT JOIN users u ON u.id = e.user_id WHERE t.profile_id = ? ORDER BY name", [user.profile_id]);
  return ok({
    from, to, group, total_minutes: total, entry_count: entries.length, people_count: new Set(entries.map((e) => e.user_id)).size, task_count: new Set(entries.map((e) => e.task_id)).size,
    groups: rows, days: [...days.entries()].map(([date, minutes]) => ({ date, minutes })).sort((a, b) => (a.date < b.date ? -1 : 1)), entries, people, truncated: entries.length >= 5000,
  });
});
