import { execute, withTransaction } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { ownedEmployeeIds } from "@/lib/ownership";
import { getProject } from "../route";
import { notifyOwner } from "@/lib/notifications";

/** Add (or update the role of) members: { employee_id, role } or { employees: [{employee_id, role}] } */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getProject(id, owner);
  const body = await readJson(request);
  const list = Array.isArray(body.employees) ? body.employees : [body];
  const allowed = new Set(await ownedEmployeeIds(owner, list.map((m) => m.employee_id)));
  const rows = list.map((m) => [id, Number(m.employee_id), m.role?.trim() || null]).filter((r) => allowed.has(r[1]));
  if (!rows.length) throw new HttpError("No employees from this workspace were given.", 400);
  await withTransaction(async (conn) => {
    for (const r of rows) {
      await conn.execute("INSERT INTO project_employees (project_id, employee_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)", r);
    }
  });
  const project = await getProject(id, owner);
  const names = project.employees.filter((e) => rows.some((r) => r[1] === e.id)).map((e) => `${e.first_name} ${e.last_name}`);
  notifyOwner(user, { type: "project_member", title: `${names.join(", ")} added to ${project.name}`, body: null, href: `/projects/${id}`, entityType: "project", entityId: id });
  return ok(project);
});

/** Replace the whole member list: { employees: [{employee_id, role}] } */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getProject(id, owner);
  const body = await readJson(request);
  const list = Array.isArray(body.employees) ? body.employees : [];
  const allowed = new Set(await ownedEmployeeIds(owner, list.map((m) => m.employee_id)));
  await withTransaction(async (conn) => {
    await conn.execute("DELETE FROM project_employees WHERE project_id = ?", [id]);
    for (const m of list) {
      if (!allowed.has(Number(m.employee_id))) continue;
      await conn.execute("INSERT INTO project_employees (project_id, employee_id, role) VALUES (?, ?, ?)", [id, Number(m.employee_id), m.role || null]);
    }
  });
  return ok(await getProject(id, owner));
});

/** Remove a member: { employee_id } */
export const DELETE = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const owner = user.profile_id;
  await getProject(id, owner);
  const body = await readJson(request);
  const employeeId = requireId(body.employee_id);
  await execute("DELETE FROM project_employees WHERE project_id = ? AND employee_id = ?", [id, employeeId]);
  return ok(await getProject(id, owner));
});
