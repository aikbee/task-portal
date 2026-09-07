import { query, withTransaction } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf } from "@/lib/api-utils";
import { EMPLOYEE_STATUS } from "@/lib/constants";
import { ownedProjectIds } from "@/lib/ownership";

const FIELDS = ["first_name", "last_name", "email", "phone", "job_title", "department", "status", "avatar_color", "hired_at"];

export async function listEmployees(owner, { status, department, project_id, q, id } = {}) {
  const where = ["e.profile_id = ?"];
  const args = [owner];
  if (id) { where.push("e.id = ?"); args.push(id); }
  if (status) { where.push("e.status = ?"); args.push(status); }
  if (department) { where.push("e.department = ?"); args.push(department); }
  if (project_id) { where.push("EXISTS (SELECT 1 FROM project_employees pe WHERE pe.employee_id = e.id AND pe.project_id = ?)"); args.push(project_id); }
  if (q) { where.push("(CONCAT(e.first_name,' ',e.last_name) LIKE ? OR e.email LIKE ? OR e.job_title LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT e.*,
      (SELECT COUNT(*) FROM project_employees pe WHERE pe.employee_id = e.id) AS project_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = e.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = e.id AND t.status <> 'done') AS open_task_count
     FROM employees e WHERE ${where.join(" AND ")}
     ORDER BY e.first_name, e.last_name`,
    args
  );
  if (rows.length) {
    const links = await query(
      `SELECT pe.employee_id, p.id, p.name, p.code, p.color FROM project_employees pe JOIN projects p ON p.id = pe.project_id
       WHERE pe.employee_id IN (?) ORDER BY p.name`,
      [rows.map((r) => r.id)]
    );
    const by = {};
    for (const l of links) (by[l.employee_id] ??= []).push({ id: l.id, name: l.name, code: l.code, color: l.color });
    for (const r of rows) r.projects = by[r.id] ?? [];
  }
  return rows;
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  return ok(await listEmployees(user.profile_id, { status: sp.get("status"), department: sp.get("department"), project_id: sp.get("project_id"), q: sp.get("q") }));
});

export const POST = handler(async (request, _params, user) => {
  const owner = user.profile_id;
  const body = await readJson(request);
  const data = pick(body, FIELDS);
  requireFields(data, ["first_name", "last_name", "email"]);
  oneOf(data.status, Object.keys(EMPLOYEE_STATUS), "status");
  data.user_id = user.owner_id;
  data.profile_id = owner;
  const projectIds = await ownedProjectIds(owner, body.project_ids);
  const id = await withTransaction(async (conn) => {
    const cols = Object.keys(data);
    const [res] = await conn.execute(`INSERT INTO employees (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
    if (projectIds.length) await conn.query("INSERT IGNORE INTO project_employees (project_id, employee_id) VALUES ?", [projectIds.map((p) => [p, res.insertId])]);
    return res.insertId;
  });
  const [row] = await listEmployees(owner, { id });
  return ok(row, { status: 201 });
});
