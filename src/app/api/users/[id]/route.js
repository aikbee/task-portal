import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, oneOf, requireId, HttpError } from "@/lib/api-utils";
import { hashPassword, PASSWORD_MIN } from "@/lib/password";
import { USER_ROLES, USER_STATUS } from "@/lib/constants";
import { USER_SELECT } from "../route";
import { notifyAdmins } from "@/lib/notifications";
import { purgeFiles } from "@/lib/attachments";

async function find(id) {
  const row = await queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
  if (!row) throw new HttpError("User not found.", 404);
  return row;
}

async function assertNotLastAdmin(id) {
  const [{ n }] = [await queryOne("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [id])];
  if (n === 0) throw new HttpError("At least one active admin must remain.", 400);
}

export const GET = handler(async (_req, params) => ok(await find(requireId(params.id))), { role: "admin" });

export const PUT = handler(
  async (request, params, me) => {
    const id = requireId(params.id);
    const existing = await find(id);
    const body = await readJson(request);
    const data = pick(body, ["name", "email", "role", "status", "avatar_color", "employee_id"]);
    oneOf(data.role, Object.keys(USER_ROLES), "role");
    oneOf(data.status, Object.keys(USER_STATUS), "status");
    if (data.name === null) throw new HttpError("Name is required.", 400);
    if (data.email) data.email = String(data.email).toLowerCase();
    if ("employee_id" in data) data.employee_id = data.employee_id ? Number(data.employee_id) : null;

    const losesAdmin = existing.role === "admin" && ((data.role && data.role !== "admin") || (data.status && data.status !== "active"));
    if (losesAdmin) await assertNotLastAdmin(id);
    if (id === me.id && ((data.role && data.role !== "admin") || (data.status && data.status !== "active"))) {
      throw new HttpError("You cannot remove your own admin access or disable yourself.", 400);
    }
    if (body.password != null && body.password !== "") {
      if (String(body.password).length < PASSWORD_MIN) throw new HttpError(`Password must be at least ${PASSWORD_MIN} characters.`, 400);
      data.password_hash = hashPassword(String(body.password));
    }
    const cols = Object.keys(data);
    if (cols.length) await execute(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => data[c]), id]);
    if (data.password_hash || data.status === "disabled") await execute("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [id, me.session_id]);
    const row = await find(id);
    const changes = [data.role && data.role !== existing.role ? `role → ${data.role}` : null, data.status && data.status !== existing.status ? `status → ${data.status}` : null, data.password_hash ? "password reset" : null].filter(Boolean);
    if (changes.length) notifyAdmins(me, { type: "user_updated", title: `Account changed: ${row.name}`, body: changes.join(", "), href: "/users", entityType: "user", entityId: id });
    return ok(row);
  },
  { role: "admin" }
);

export const DELETE = handler(
  async (_req, params, me) => {
    const id = requireId(params.id);
    if (id === me.id) throw new HttpError("You cannot delete your own account.", 400);
    const existing = await find(id);
    if (existing.role === "admin") await assertNotLastAdmin(id);
    await purgeFiles("task", "p.user_id = ?", [id]);
    await purgeFiles("requirement", "p.user_id = ?", [id]);
    await execute("DELETE FROM users WHERE id = ?", [id]);
    notifyAdmins(me, { type: "user_deleted", title: `Account removed: ${existing.name}`, body: existing.email, href: "/users", entityType: "user", entityId: id });
    return ok({ id });
  },
  { role: "admin" }
);
