import { query, queryOne, execute, withTransaction } from "@/lib/db";
import { handler, ok, readJson, pick, oneOf, requireId, HttpError } from "@/lib/api-utils";
import { PROJECT_STATUS } from "@/lib/constants";
import { ownedEmployeeIds } from "@/lib/ownership";
import { listRequirements } from "../../requirements/route";
import { purgeFiles } from "@/lib/attachments";
import { notifyOwner } from "@/lib/notifications";

const FIELDS = ["name", "code", "description", "status", "color", "start_date", "end_date", "budget"];

export async function getProject(id, owner) {
  const project = await queryOne(
    `SELECT p.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
     FROM projects p WHERE p.id = ? AND p.profile_id = ?`,
    [id, owner]
  );
  if (!project) throw new HttpError("Project not found.", 404);
  project.employees = await query(
    `SELECT e.id, e.first_name, e.last_name, e.email, e.job_title, e.department, e.status, e.avatar_color, pe.role, pe.assigned_at,
       (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = e.id AND t.project_id = ?) AS task_count
     FROM project_employees pe JOIN employees e ON e.id = pe.employee_id
     WHERE pe.project_id = ? ORDER BY e.first_name, e.last_name`,
    [id, id]
  );
  project.tasks = await query(
    `SELECT t.*, CONCAT(e.first_name, ' ', e.last_name) AS assignee_name, e.avatar_color,
       (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = t.id) AS attachment_count,
       (SELECT COUNT(*) FROM task_outputs o WHERE o.task_id = t.id) AS output_count
     FROM tasks t LEFT JOIN employees e ON e.id = t.employee_id
     WHERE t.project_id = ? ORDER BY t.sort_order, t.id`,
    [id]
  );
  project.requirements = await listRequirements(owner, { project_id: id });
  return project;
}

export const GET = handler(async (_req, params, user) => ok(await getProject(requireId(params.id), user.profile_id)));

export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  const before = await getProject(id, owner);
  const body = await readJson(request);
  const data = pick(body, FIELDS);
  oneOf(data.status, Object.keys(PROJECT_STATUS), "status");
  if ("budget" in data && data.budget != null) data.budget = Number(data.budget);
  if (data.code) data.code = String(data.code).toUpperCase();
  if (data.name === null) throw new HttpError("Name is required.", 400);

  await withTransaction(async (conn) => {
    const cols = Object.keys(data);
    if (cols.length) await conn.execute(`UPDATE projects SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...cols.map((c) => data[c]), id, owner]);
    if (Array.isArray(body.employee_ids)) {
      const ids = await ownedEmployeeIds(owner, body.employee_ids);
      await conn.execute("DELETE FROM project_employees WHERE project_id = ?" + (ids.length ? ` AND employee_id NOT IN (${ids.map(() => "?").join(",")})` : ""), [id, ...ids]);
      if (ids.length) await conn.query("INSERT IGNORE INTO project_employees (project_id, employee_id) VALUES ?", [ids.map((e) => [id, e])]);
    }
  });
  const after = await getProject(id, owner);
  if (data.status && data.status !== before.status) {
    notifyOwner(user, {
      type: after.status === "completed" ? "project_completed" : "project_status",
      title: after.status === "completed" ? `Project completed: ${after.name}` : `${after.name} is now ${PROJECT_STATUS[after.status]?.label ?? after.status}`,
      body: after.code,
      href: `/projects/${id}`,
      entityType: "project",
      entityId: id,
    });
  }
  return ok(after);
});

export const DELETE = handler(async (_req, params, user) => {
  const id = requireId(params.id);
  await purgeFiles("requirement", "p.project_id = ? AND p.profile_id = ?", [id, user.profile_id]); // requirements cascade with the project
  const res = await execute("DELETE FROM projects WHERE id = ? AND profile_id = ?", [id, user.profile_id]);
  if (!res.affectedRows) throw new HttpError("Project not found.", 404);
  return ok({ id });
});
