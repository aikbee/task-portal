import { query, queryOne, execute, withTransaction } from "@/lib/db";
import { handler, ok, readJson, pick, oneOf, requireId, HttpError } from "@/lib/api-utils";
import { EMPLOYEE_STATUS } from "@/lib/constants";
import { ownedProjectIds } from "@/lib/ownership";

const FIELDS = ["first_name", "last_name", "email", "phone", "job_title", "department", "status", "avatar_color", "hired_at"];

export async function getEmployee(id, owner) {
  const employee = await queryOne("SELECT * FROM employees WHERE id = ? AND profile_id = ?", [id, owner]);
  if (!employee) throw new HttpError("Employee not found.", 404);
  employee.projects = await query(
    `SELECT p.id, p.name, p.code, p.color, p.status, p.end_date, pe.role, pe.assigned_at,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.employee_id = ?) AS my_task_count,
       (SELECT COUNT(*) FROM project_employees x WHERE x.project_id = p.id) AS member_count
     FROM project_employees pe JOIN projects p ON p.id = pe.project_id
     WHERE pe.employee_id = ? ORDER BY p.name`,
    [id, id]
  );
  employee.tasks = await query(
    `SELECT t.*, p.name AS project_name, p.color AS project_color, p.code AS project_code,
       (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id) AS attachment_count,
       (SELECT COUNT(*) FROM task_outputs o WHERE o.task_id = t.id) AS output_count
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.employee_id = ? ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, t.sort_order`,
    [id]
  );
  return employee;
}

export const GET = handler(async (_req, params, user) => ok(await getEmployee(requireId(params.id), user.profile_id)));

export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getEmployee(id, owner);
  const body = await readJson(request);
  const data = pick(body, FIELDS);
  oneOf(data.status, Object.keys(EMPLOYEE_STATUS), "status");
  for (const f of ["first_name", "last_name", "email"]) if (data[f] === null) throw new HttpError(`${f} is required.`, 400);

  await withTransaction(async (conn) => {
    const cols = Object.keys(data);
    if (cols.length) await conn.execute(`UPDATE employees SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...cols.map((c) => data[c]), id, owner]);
    if (Array.isArray(body.project_ids)) {
      const ids = await ownedProjectIds(owner, body.project_ids);
      await conn.execute("DELETE FROM project_employees WHERE employee_id = ?" + (ids.length ? ` AND project_id NOT IN (${ids.map(() => "?").join(",")})` : ""), [id, ...ids]);
      if (ids.length) await conn.query("INSERT IGNORE INTO project_employees (project_id, employee_id) VALUES ?", [ids.map((p) => [p, id])]);
    }
  });
  return ok(await getEmployee(id, owner));
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  const res = await execute("DELETE FROM employees WHERE id = ? AND profile_id = ?", [id, user.profile_id]);
  if (!res.affectedRows) throw new HttpError("Employee not found.", 404);
  return ok({ id });
});
