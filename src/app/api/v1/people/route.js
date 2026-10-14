import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

/** Employees of the workspace, to pick who a task is assigned to (by email or id). */
export const GET = handler(async (_request, _params, user) => {
  const rows = await query(
    `SELECT e.id, CONCAT(e.first_name, ' ', e.last_name) AS name, COALESCE(e.email, u.email) AS email, e.job_title, e.department, e.status, e.linked_user_id IS NOT NULL AS has_account
     FROM employees e LEFT JOIN users u ON u.id = e.linked_user_id WHERE e.profile_id = ? ORDER BY e.first_name, e.last_name`,
    [user.profile_id]
  );
  return ok(rows.map((r) => ({ ...r, has_account: Boolean(r.has_account) })));
});
