import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf, HttpError } from "@/lib/api-utils";
import { REQ_TYPE, REQ_PRIORITY, REQ_STATUS } from "@/lib/constants";
import { nextSortOrder } from "@/lib/ordering";
import { notifyOwner } from "@/lib/notifications";

export const REQ_FIELDS = ["project_id", "title", "description", "acceptance_criteria", "type", "priority", "status", "employee_id"];

export const REQ_SELECT = `
  SELECT r.*, p.name AS project_name, p.code AS project_code, p.color AS project_color,
    CONCAT(e.first_name, ' ', e.last_name) AS stakeholder_name, e.avatar_color AS stakeholder_color, e.job_title AS stakeholder_title,
    (SELECT COUNT(*) FROM tasks t WHERE t.requirement_id = r.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.requirement_id = r.id AND t.status = 'done') AS done_count
  FROM requirements r
  JOIN projects p ON p.id = r.project_id
  LEFT JOIN employees e ON e.id = r.employee_id`;

export function normaliseRequirement(data) {
  if ("project_id" in data) data.project_id = data.project_id ? Number(data.project_id) : null;
  if ("employee_id" in data) data.employee_id = data.employee_id ? Number(data.employee_id) : null;
  oneOf(data.type, Object.keys(REQ_TYPE), "type");
  oneOf(data.priority, Object.keys(REQ_PRIORITY), "priority");
  oneOf(data.status, Object.keys(REQ_STATUS), "status");
  return data;
}

/** Validate project / stakeholder belong to the workspace. */
export async function assertRequirementRefs(owner, data) {
  if (data.project_id) {
    const p = await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [data.project_id, owner]);
    if (!p) throw new HttpError("Project not found in this workspace.", 400);
  }
  if (data.employee_id) {
    const e = await queryOne("SELECT id FROM employees WHERE id = ? AND profile_id = ?", [data.employee_id, owner]);
    if (!e) throw new HttpError("Employee not found in this workspace.", 400);
  }
}

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/** Normalise a user-supplied code (trim + uppercase); null when empty. */
export function normaliseCode(raw) {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!code) return null;
  if (!CODE_RE.test(code)) throw new HttpError("Code may only contain letters, digits, dots, dashes and underscores (max 32 characters).", 400);
  return code;
}

export async function assertCodeFree(projectId, code, exceptId = 0) {
  const row = await queryOne("SELECT id FROM requirements WHERE project_id = ? AND code = ? AND id <> ?", [projectId, code, exceptId]);
  if (row) throw new HttpError(`Code ${code} is already used in this project.`, 409);
}

/** A manual REQ-n code moves the automatic counter forward so later auto codes continue after it. */
export async function bumpSequence(projectId, code) {
  const m = /^REQ-(\d+)$/.exec(code);
  if (!m) return;
  await execute("UPDATE projects SET requirement_seq = GREATEST(requirement_seq, ?) WHERE id = ?", [Number(m[1]), projectId]);
}

/** Next REQ-nnn code within a project. Numbers come from a per-project counter, so a code is never reused after a delete. */
export async function nextRequirementCode(projectId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await execute("UPDATE projects SET requirement_seq = requirement_seq + 1 WHERE id = ?", [projectId]);
    const row = await queryOne("SELECT requirement_seq AS n FROM projects WHERE id = ?", [projectId]);
    const code = `REQ-${String(row.n).padStart(3, "0")}`;
    const taken = await queryOne("SELECT id FROM requirements WHERE project_id = ? AND code = ?", [projectId, code]);
    if (!taken) return code; // legacy rows may already hold this number; keep counting
  }
  throw new HttpError("Could not allocate a requirement code.", 500);
}

export function listRequirements(owner, { project_id, status, type, priority, q } = {}) {
  const where = ["r.profile_id = ?"];
  const args = [owner];
  if (project_id) { where.push("r.project_id = ?"); args.push(project_id); }
  if (status) { where.push("r.status = ?"); args.push(status); }
  if (type) { where.push("r.type = ?"); args.push(type); }
  if (priority) { where.push("r.priority = ?"); args.push(priority); }
  if (q) { where.push("(r.title LIKE ? OR r.code LIKE ? OR r.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return query(`${REQ_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.name, r.sort_order, r.id`, args);
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  return ok(await listRequirements(user.profile_id, { project_id: sp.get("project_id"), status: sp.get("status"), type: sp.get("type"), priority: sp.get("priority"), q: sp.get("q") }));
});

export const POST = handler(async (request, _params, user) => {
  const owner = user.profile_id;
  const body = await readJson(request);
  const data = normaliseRequirement(pick(body, REQ_FIELDS));
  requireFields(data, ["project_id", "title"]);
  await assertRequirementRefs(owner, data);
  data.user_id = user.owner_id;
  data.profile_id = owner;
  const custom = normaliseCode(body.code);
  if (custom) {
    await assertCodeFree(data.project_id, custom);
    await bumpSequence(data.project_id, custom);
    data.code = custom;
  } else {
    data.code = await nextRequirementCode(data.project_id);
  }
  data.sort_order = await nextSortOrder("requirements", data.project_id);
  const cols = Object.keys(data);
  const res = await execute(`INSERT INTO requirements (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
  const row = await queryOne(`${REQ_SELECT} WHERE r.id = ?`, [res.insertId]);
  notifyOwner(user, { type: "requirement_created", title: `New requirement ${row.code}: ${row.title}`, body: row.project_name, href: `/requirements/${row.id}`, entityType: "requirement", entityId: row.id });
  return ok(row, { status: 201 });
});
