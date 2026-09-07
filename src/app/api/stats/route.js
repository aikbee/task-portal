import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

/** Dashboard numbers for the current workspace (owner). */
export const GET = handler(async (_request, _params, user) => {
  const o = user.profile_id;
  const [counts] = await query(
    `SELECT
      (SELECT COUNT(*) FROM projects WHERE profile_id = ?) AS projects,
      (SELECT COUNT(*) FROM projects WHERE profile_id = ? AND status = 'active') AS active_projects,
      (SELECT COUNT(*) FROM employees WHERE profile_id = ?) AS employees,
      (SELECT COUNT(*) FROM employees WHERE profile_id = ? AND status = 'active') AS active_employees,
      (SELECT COUNT(*) FROM tasks WHERE profile_id = ?) AS tasks,
      (SELECT COUNT(*) FROM requirements WHERE profile_id = ?) AS requirements,
      (SELECT COUNT(*) FROM info_items WHERE profile_id = ?) AS info,
      (SELECT COUNT(*) FROM requirements WHERE profile_id = ? AND status = 'done') AS requirements_done,
      (SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND status <> 'done') AS open_tasks,
      (SELECT COUNT(*) FROM tasks WHERE profile_id = ? AND status <> 'done' AND due_date IS NOT NULL AND due_date < CURDATE()) AS overdue_tasks,
      (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS notes,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM task_attachments a JOIN tasks t ON t.id = a.task_id WHERE t.profile_id = ?) AS attachments,
      (SELECT COUNT(*) FROM task_outputs x JOIN tasks t ON t.id = x.task_id WHERE t.profile_id = ?) AS outputs`,
    [o, o, o, o, o, o, o, o, o, o, user.id, o, o]
  );

  const tasksByStatus = await query("SELECT status, COUNT(*) AS n FROM tasks WHERE profile_id = ? GROUP BY status", [o]);
  const tasksByPriority = await query("SELECT priority, COUNT(*) AS n FROM tasks WHERE profile_id = ? GROUP BY priority", [o]);

  const projects = await query(
    `SELECT p.id, p.name, p.code, p.color, p.status, p.end_date,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
      (SELECT COUNT(*) FROM project_employees pe WHERE pe.project_id = p.id) AS member_count
    FROM projects p
    WHERE p.profile_id = ? AND p.status IN ('active','planning','on_hold')
    ORDER BY p.status = 'active' DESC, p.updated_at DESC
    LIMIT 6`,
    [o]
  );

  const workload = await query(
    `SELECT e.id, e.first_name, e.last_name, e.avatar_color, e.job_title,
      SUM(t.status <> 'done') AS open_count,
      SUM(t.status = 'done') AS done_count,
      COUNT(t.id) AS total
    FROM employees e
    LEFT JOIN tasks t ON t.employee_id = e.id
    WHERE e.profile_id = ? AND e.status = 'active'
    GROUP BY e.id
    ORDER BY open_count DESC, total DESC
    LIMIT 8`,
    [o]
  );

  const recentTasks = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.updated_at,
      p.name AS project_name, p.color AS project_color,
      CONCAT(e.first_name, ' ', e.last_name) AS assignee_name, e.avatar_color
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN employees e ON e.id = t.employee_id
    WHERE t.profile_id = ?
    ORDER BY t.updated_at DESC
    LIMIT 8`,
    [o]
  );

  const upcoming = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date,
      p.name AS project_name, p.color AS project_color,
      CONCAT(e.first_name, ' ', e.last_name) AS assignee_name, e.avatar_color
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN employees e ON e.id = t.employee_id
    WHERE t.profile_id = ? AND t.status <> 'done' AND t.due_date IS NOT NULL
    ORDER BY t.due_date ASC
    LIMIT 8`,
    [o]
  );

  return ok({ counts, tasksByStatus, tasksByPriority, projects, workload, recentTasks, upcoming });
});
