import { query, withTransaction } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf } from "@/lib/api-utils";
import { PROJECT_STATUS } from "@/lib/constants";
import { ownedEmployeeIds } from "@/lib/ownership";
import { notifyOwner } from "@/lib/notifications";

const FIELDS = ["name", "code", "description", "status", "color", "start_date", "end_date", "budget"];

/** Projects in a profile (owner = profile id), with counts and member avatars. */
export async function listProjects(owner, { status, employee_id, q, id } = {}) {
  const where = ["p.profile_id = ?"];
  const args = [owner];
  if (id) { where.push("p.id = ?"); args.push(id); }
  if (status) { where.push("p.status = ?"); args.push(status); }
  if (employee_id) { where.push("EXISTS (SELECT 1 FROM project_employees pe WHERE pe.project_id = p.id AND pe.employee_id = ?)"); args.push(employee_id); }
  if (q) { where.push("(p.name LIKE ? OR p.code LIKE ? OR p.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT p.*,
      (SELECT COUNT(*) FROM project_employees pe WHERE pe.project_id = p.id) AS member_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
     FROM projects p WHERE ${where.join(" AND ")}
     ORDER BY p.updated_at DESC`,
    args
  );
  if (rows.length) {
    const members = await query(
      `SELECT pe.project_id, e.id, CONCAT(e.first_name, ' ', e.last_name) AS name, e.avatar_color AS color
       FROM project_employees pe JOIN employees e ON e.id = pe.employee_id
       WHERE pe.project_id IN (?) ORDER BY e.first_name`,
      [rows.map((r) => r.id)]
    );
    const byProject = {};
    for (const m of members) (byProject[m.project_id] ??= []).push({ id: m.id, name: m.name, color: m.color });
    for (const r of rows) r.members = byProject[r.id] ?? [];
  }
  return rows;
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  return ok(await listProjects(user.profile_id, { status: sp.get("status"), employee_id: sp.get("employee_id"), q: sp.get("q") }));
});

export const POST = handler(async (request, _params, user) => {
  const owner = user.profile_id;
  const body = await readJson(request);
  const data = pick(body, FIELDS);
  requireFields(data, ["name", "code"]);
  oneOf(data.status, Object.keys(PROJECT_STATUS), "status");
  if (data.budget != null) data.budget = Number(data.budget);
  data.code = String(data.code).toUpperCase();
  data.user_id = user.owner_id;
  data.profile_id = owner;

  const employeeIds = await ownedEmployeeIds(owner, body.employee_ids);
  const id = await withTransaction(async (conn) => {
    const cols = Object.keys(data);
    const [res] = await conn.execute(`INSERT INTO projects (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
    if (employeeIds.length) await conn.query("INSERT IGNORE INTO project_employees (project_id, employee_id) VALUES ?", [employeeIds.map((e) => [res.insertId, e])]);
    return res.insertId;
  });
  const [row] = await listProjects(owner, { id });
  notifyOwner(user, { type: "project_created", title: `New project: ${row.name}`, body: row.code, href: `/projects/${row.id}`, entityType: "project", entityId: row.id });
  return ok(row, { status: 201 });
});
