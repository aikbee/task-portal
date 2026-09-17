import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

/**
 * Tasks assigned to me, across every profile I can open: my own and the ones shared with me. "Me" is any
 * employee record linked to my account. `?open=1` leaves finished tasks out.
 */
export const GET = handler(async (request, _params, user) => {
  const openOnly = request.nextUrl.searchParams.get("open") === "1";
  const rows = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.updated_at, t.profile_id,
       pr.name AS profile_name, pr.color AS profile_color, pr.user_id AS profile_owner_id, o.name AS profile_owner_name,
       p.id AS project_id, p.name AS project_name, p.code AS project_code, p.color AS project_color,
       CONCAT(e.first_name, ' ', e.last_name) AS assignee_name,
       CASE WHEN pr.user_id = ? THEN 'owner' ELSE pm.role END AS access
     FROM tasks t
     JOIN task_assignees ta ON ta.task_id = t.id
     JOIN employees e ON e.id = ta.employee_id AND e.linked_user_id = ?
     JOIN profiles pr ON pr.id = t.profile_id
     JOIN users o ON o.id = pr.user_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN profile_members pm ON pm.profile_id = pr.id AND pm.user_id = ? AND pm.status = 'active'
     WHERE (pr.user_id = ? OR pm.user_id IS NOT NULL) ${openOnly ? "AND t.status <> 'done'" : ""}
     ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date, FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.id DESC
     LIMIT 500`,
    [user.id, user.id, user.id, user.id]
  );
  return ok(rows);
});
