import { query, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf } from "@/lib/api-utils";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { nextSortOrder } from "@/lib/ordering";
import { assertTaskRefs, assertTaskRequirement } from "@/lib/ownership";
import { notifyOwner } from "@/lib/notifications";

export const TASK_FIELDS = ["title", "description", "project_id", "employee_id", "requirement_id", "status", "priority", "due_date"];

export const TASK_SELECT = `
  SELECT t.*, p.name AS project_name, p.color AS project_color, p.code AS project_code,
    CONCAT(e.first_name, ' ', e.last_name) AS assignee_name, e.avatar_color, e.job_title AS assignee_title,
    r.code AS requirement_code, r.title AS requirement_title,
    (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id) AS attachment_count,
    (SELECT COUNT(*) FROM task_outputs o WHERE o.task_id = t.id) AS output_count
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
  return data;
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const where = ["t.profile_id = ?"];
  const args = [user.profile_id];
  for (const f of ["project_id", "employee_id", "status", "priority"]) {
    const v = sp.get(f);
    if (v) { where.push(`t.${f} = ?`); args.push(v); }
  }
  const q = sp.get("q");
  if (q) { where.push("(t.title LIKE ? OR t.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  const dueFrom = sp.get("due_from");
  const dueTo = sp.get("due_to");
  if (dueFrom) { where.push("t.due_date >= ?"); args.push(dueFrom); }
  if (dueTo) { where.push("t.due_date <= ?"); args.push(dueTo); }
  if (sp.get("has_due") === "1") where.push("t.due_date IS NOT NULL");
  return ok(await query(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.updated_at DESC`, args));
});

export const POST = handler(async (request, _params, user) => {
  const owner = user.profile_id;
  const body = await readJson(request);
  const data = normaliseTask(pick(body, TASK_FIELDS));
  requireFields(data, ["title"]);
  await assertTaskRequirement(owner, data);
  await assertTaskRefs(owner, data);
  data.user_id = user.owner_id;
  data.profile_id = owner;
  data.sort_order = await nextSortOrder("tasks");
  const cols = Object.keys(data);
  const res = await execute(`INSERT INTO tasks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
  const [row] = await query(`${TASK_SELECT} WHERE t.id = ?`, [res.insertId]);
  notifyOwner(user, { type: "task_created", title: `New task: ${row.title}`, body: [row.project_name, row.assignee_name].filter(Boolean).join(" · ") || null, href: `/tasks/${row.id}`, entityType: "task", entityId: row.id });
  return ok(row, { status: 201 });
});
