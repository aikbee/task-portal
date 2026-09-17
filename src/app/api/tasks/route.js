import { query, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf, HttpError } from "@/lib/api-utils";
import { normaliseTags } from "@/lib/tags";
import { REPEAT_RULES } from "@/lib/recurrence";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { nextSortOrder } from "@/lib/ordering";
import { assertTaskRefs, assertTaskRequirement } from "@/lib/ownership";
import { notifyInvolved } from "@/lib/notifications";
import { logTask } from "@/lib/task-activity";
import { attachAssignees, setAssignees, nextAssignees } from "@/lib/task-assignees";

export const TASK_FIELDS = ["title", "description", "project_id", "employee_id", "requirement_id", "status", "priority", "start_date", "due_date", "estimate_hours", "tags", "repeat_rule", "repeat_until"];

export const TASK_SELECT = `
  SELECT t.*, p.name AS project_name, p.color AS project_color, p.code AS project_code,
    CONCAT(e.first_name, ' ', e.last_name) AS assignee_name, e.avatar_color, e.job_title AS assignee_title,
    r.code AS requirement_code, r.title AS requirement_title,
    (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id) AS attachment_count,
    (SELECT COUNT(*) FROM task_outputs o WHERE o.task_id = t.id) AS output_count,
    (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count,
    (SELECT COUNT(*) FROM task_checklist k WHERE k.task_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM task_checklist k WHERE k.task_id = t.id AND k.done = 1) AS checklist_done,
    (SELECT COUNT(*) FROM task_dependencies d WHERE d.task_id = t.id) AS dependency_count,
    (SELECT COALESCE(SUM(x.minutes), 0) FROM time_entries x WHERE x.task_id = t.id) AS minutes_logged,
    (SELECT COUNT(*) FROM task_dependencies d JOIN tasks bt ON bt.id = d.depends_on_id WHERE d.task_id = t.id AND bt.status <> 'done') AS blocked_by_open
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN employees e ON e.id = t.employee_id
  LEFT JOIN requirements r ON r.id = t.requirement_id`;

export function normaliseTask(data) {
  if ("project_id" in data) data.project_id = data.project_id ? Number(data.project_id) : null;
  if ("employee_id" in data) data.employee_id = data.employee_id ? Number(data.employee_id) : null;
  if ("requirement_id" in data) data.requirement_id = data.requirement_id ? Number(data.requirement_id) : null;
  oneOf(data.status, Object.keys(TASK_STATUS), "status");
  oneOf(data.priority, Object.keys(TASK_PRIORITY), "priority");
  if ("tags" in data) data.tags = normaliseTags(data.tags);
  if ("estimate_hours" in data && data.estimate_hours != null) {
    const n = Number(data.estimate_hours);
    if (!Number.isFinite(n) || n < 0 || n > 9999) throw new HttpError("The estimate must be between 0 and 9999 hours.", 400);
    data.estimate_hours = Math.round(n * 100) / 100;
  }
  if ("repeat_rule" in data && data.repeat_rule != null && !REPEAT_RULES[data.repeat_rule]) throw new HttpError(`Unknown repeat rule: ${data.repeat_rule}.`, 400);
  for (const f of ["start_date", "due_date", "repeat_until"]) if (data[f] != null && !/^\d{4}-\d{2}-\d{2}$/.test(data[f])) throw new HttpError(`${f} must be a date (YYYY-MM-DD).`, 400);
  return data;
}
/** A task cannot start after it is due. `current` is the stored row when only one of the two dates is being changed. */
export function assertDateOrder(data, current = {}) {
  const start = "start_date" in data ? data.start_date : current.start_date;
  const due = "due_date" in data ? data.due_date : current.due_date;
  if (start && due && start > due) throw new HttpError("The start date is after the due date.", 400);
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const where = ["t.profile_id = ?"];
  const args = [user.profile_id];
  for (const f of ["project_id", "status", "priority"]) {
    const v = sp.get(f);
    if (v) { where.push(`t.${f} = ?`); args.push(v); }
  }
  // anyone on the task counts, not only its lead
  if (sp.get("employee_id")) { where.push("EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.employee_id = ?)"); args.push(sp.get("employee_id")); }
  const q = sp.get("q");
  if (q) { where.push("(t.title LIKE ? OR t.description LIKE ? OR t.tags LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (sp.get("tag")) { where.push("FIND_IN_SET(?, t.tags)"); args.push(String(sp.get("tag")).toLowerCase()); }
  const dueFrom = sp.get("due_from");
  const dueTo = sp.get("due_to");
  if (dueFrom) { where.push("t.due_date >= ?"); args.push(dueFrom); }
  if (dueTo) { where.push("t.due_date <= ?"); args.push(dueTo); }
  if (sp.get("has_due") === "1") where.push("t.due_date IS NOT NULL");
  return ok(await attachAssignees(await query(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.updated_at DESC`, args)));
});

export const POST = handler(async (request, _params, user) => {
  const owner = user.profile_id;
  const body = await readJson(request);
  const data = normaliseTask(pick(body, TASK_FIELDS));
  requireFields(data, ["title"]);
  assertDateOrder(data);
  await assertTaskRequirement(owner, data);
  await assertTaskRefs(owner, data);
  if (Array.isArray(body.assignee_ids)) data.employee_id = null; // set together with the list, after the insert
  data.user_id = user.owner_id;
  data.profile_id = owner;
  data.sort_order = await nextSortOrder("tasks");
  const cols = Object.keys(data);
  const res = await execute(`INSERT INTO tasks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
  const people = nextAssignees(body, []);
  if (people?.length) await setAssignees(res.insertId, owner, people);
  const [row] = await attachAssignees(await query(`${TASK_SELECT} WHERE t.id = ?`, [res.insertId]));
  await logTask(user, row.id, { action: "created" });
  notifyInvolved(user, { type: "task_created", title: `New task: ${row.title}`, body: [row.project_name, row.assignee_names].filter(Boolean).join(" · ") || null, href: `/tasks/${row.id}`, entityType: "task", entityId: row.id }, { taskIds: [row.id], forAssignee: { type: "task_assigned", title: `${user.name} assigned you: ${row.title}` } });
  return ok(row, { status: 201 });
});
