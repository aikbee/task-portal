import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, HttpError } from "@/lib/api-utils";
import { sharedProfilesOf } from "@/lib/sharing";

export const PROFILE_SELECT = `
  SELECT p.id, p.user_id, p.name, p.description, p.color, p.is_default, p.created_at, p.updated_at,
    (SELECT COUNT(*) FROM projects x WHERE x.profile_id = p.id) AS project_count,
    (SELECT COUNT(*) FROM requirements x WHERE x.profile_id = p.id) AS requirement_count,
    (SELECT COUNT(*) FROM employees x WHERE x.profile_id = p.id) AS employee_count,
    (SELECT COUNT(*) FROM tasks x WHERE x.profile_id = p.id) AS task_count,
    (SELECT COUNT(*) FROM tasks x WHERE x.profile_id = p.id AND x.status <> 'done') AS open_task_count,
    (SELECT COUNT(*) FROM profile_members x JOIN users mu ON mu.id = x.user_id WHERE x.profile_id = p.id) AS member_count
  FROM profiles p`;

export const listProfiles = (ownerId) => query(`${PROFILE_SELECT} WHERE p.user_id = ? ORDER BY p.is_default DESC, p.name`, [ownerId]);

/** My profiles (admins: those of the workspace they switched into), the ones shared with me, and open invitations. */
export const GET = handler(async (_request, _params, user) =>
  ok({ items: await listProfiles(user.home_id), active_id: user.profile_id, shared: await sharedProfilesOf(user.id), invites: await sharedProfilesOf(user.id, "invited") })
);

export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const data = pick(body, ["name", "description", "color"]);
  requireFields(data, ["name"]);
  if (data.name.length > 80) throw new HttpError("Name is too long (max 80).", 400);
  const dup = await queryOne("SELECT id FROM profiles WHERE user_id = ? AND name = ?", [user.home_id, data.name]);
  if (dup) throw new HttpError("A profile with that name already exists.", 409);
  const res = await execute("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES (?, ?, ?, ?, 0)", [user.home_id, data.name, data.description ?? null, data.color || "#6366f1"]);
  const [row] = await query(`${PROFILE_SELECT} WHERE p.id = ?`, [res.insertId]);
  return ok(row, { status: 201 });
});
