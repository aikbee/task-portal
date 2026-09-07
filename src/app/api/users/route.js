import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf, HttpError } from "@/lib/api-utils";
import { hashPassword, PASSWORD_MIN } from "@/lib/password";
import { USER_ROLES, USER_STATUS } from "@/lib/constants";
import { notifyAdmins } from "@/lib/notifications";

export const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.status, u.avatar_color, u.employee_id, u.last_login_at, u.created_at, u.updated_at,
    CONCAT(e.first_name, ' ', e.last_name) AS employee_name, e.avatar_color AS employee_color,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions,
    (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count,
    (SELECT COUNT(*) FROM employees x WHERE x.user_id = u.id) AS employee_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count
  FROM users u LEFT JOIN employees e ON e.id = u.employee_id`;

export const GET = handler(async () => ok(await query(`${USER_SELECT} ORDER BY u.role = 'admin' DESC, u.name`)), { role: "admin" });

export const POST = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    const data = pick(body, ["name", "email", "role", "status", "avatar_color", "employee_id"]);
    requireFields(data, ["name", "email"]);
    oneOf(data.role, Object.keys(USER_ROLES), "role");
    oneOf(data.status, Object.keys(USER_STATUS), "status");
    data.email = String(data.email).toLowerCase();
    if ("employee_id" in data) data.employee_id = data.employee_id ? Number(data.employee_id) : null;
    const password = String(body.password ?? "");
    if (password.length < PASSWORD_MIN) throw new HttpError(`Password must be at least ${PASSWORD_MIN} characters.`, 400);
    data.password_hash = hashPassword(password);
    const cols = Object.keys(data);
    const res = await execute(`INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
    await execute("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES (?, 'Personal', 'Default profile', ?, 1)", [res.insertId, data.avatar_color || "#6366f1"]);
    const row = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [res.insertId]);
    notifyAdmins(user, { type: "user_created", title: `Account created: ${row.name}`, body: `${row.email} · ${USER_ROLES[row.role]?.label ?? row.role}`, href: "/users", entityType: "user", entityId: row.id });
    return ok(row, { status: 201 });
  },
  { role: "admin" }
);
