import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

export const GET = handler(async (request, _params, user) => {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) return ok({ projects: [], employees: [], tasks: [], requirements: [], info: [] });
  const like = `%${q}%`;
  const owner = user.profile_id;
  const [projects, employees, tasks, requirements, info] = await Promise.all([
    query("SELECT id, name, code, color, status FROM projects WHERE profile_id = ? AND (name LIKE ? OR code LIKE ?) ORDER BY name LIMIT 5", [owner, like, like]),
    query(
      "SELECT id, first_name, last_name, email, job_title, avatar_color FROM employees WHERE profile_id = ? AND (CONCAT(first_name,' ',last_name) LIKE ? OR email LIKE ? OR job_title LIKE ?) ORDER BY first_name LIMIT 5",
      [owner, like, like, like]
    ),
    query(
      `SELECT t.id, t.title, t.status, t.priority, p.name AS project_name FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.profile_id = ? AND (t.title LIKE ? OR t.description LIKE ?) ORDER BY t.updated_at DESC LIMIT 6`,
      [owner, like, like]
    ),
    query(
      `SELECT r.id, r.code, r.title, r.status, r.priority, p.name AS project_name, p.color AS project_color FROM requirements r
       JOIN projects p ON p.id = r.project_id
       WHERE r.profile_id = ? AND (r.title LIKE ? OR r.code LIKE ? OR r.description LIKE ?) ORDER BY r.updated_at DESC LIMIT 5`,
      [owner, like, like, like]
    ),
    query(
      `SELECT id, title, category, tags, color FROM info_items WHERE profile_id = ? AND (title LIKE ? OR tags LIKE ? OR summary LIKE ?) ORDER BY pinned DESC, updated_at DESC LIMIT 5`,
      [owner, like, like, like]
    ),
  ]);
  return ok({ projects, employees, tasks, requirements, info });
});
