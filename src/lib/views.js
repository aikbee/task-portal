import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { can } from "./sharing";

/** Saved list views: personal by default, or shared with everyone in the profile. */
export const VIEW_MODULES = new Set(["tasks", "projects", "employees", "requirements", "info", "drawboards", "events"]);
const SELECT = "SELECT v.id, v.module, v.name, v.state, v.shared, v.is_default, v.user_id, v.created_at, v.updated_at, u.name AS owner_name FROM saved_views v LEFT JOIN users u ON u.id = v.user_id";
const parse = (row) => (row ? { ...row, state: typeof row.state === "string" ? JSON.parse(row.state) : row.state, shared: Boolean(row.shared), is_default: Boolean(row.is_default), mine: undefined } : row);

/** Mine (in this profile) plus the shared ones, mine first, `mine` set per row. */
export async function listViews(user, mod) {
  if (!VIEW_MODULES.has(mod)) throw new HttpError("Unknown module.", 400);
  const rows = await query(`${SELECT} WHERE v.profile_id = ? AND v.module = ? AND (v.user_id = ? OR v.shared = 1) ORDER BY (v.user_id = ?) DESC, v.name`, [user.profile_id, mod, user.id, user.id]);
  return rows.map((r) => ({ ...parse(r), mine: r.user_id === user.id, is_default: r.user_id === user.id && Boolean(r.is_default) }));
}

const cleanState = (raw) => {
  const s = raw && typeof raw === "object" ? raw : {};
  const filters = Object.fromEntries(Object.entries(s.filters ?? {}).filter(([k, v]) => /^[a-z_]{1,32}$/.test(k) && v !== "" && v != null).map(([k, v]) => [k, String(v).slice(0, 80)]));
  const sort = s.sort && typeof s.sort.key === "string" ? { key: s.sort.key.slice(0, 40), dir: s.sort.dir === "desc" ? "desc" : "asc" } : null;
  const date = s.date && typeof s.date.field === "string" && (s.date.from || s.date.to) ? { field: s.date.field.slice(0, 40), from: String(s.date.from ?? "").slice(0, 10), to: String(s.date.to ?? "").slice(0, 10) } : null;
  return { filters, query: String(s.query ?? "").slice(0, 120), sort, date };
};

export async function createView(user, body) {
  const mod = String(body.module ?? "");
  if (!VIEW_MODULES.has(mod)) throw new HttpError("Unknown module.", 400);
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError("Give the view a name.", 400);
  const shared = Boolean(body.shared);
  if (shared && !can(user, "editor")) throw new HttpError("Viewers keep their views to themselves.", 403);
  const n = await queryOne("SELECT COUNT(*) AS n FROM saved_views WHERE user_id = ? AND profile_id = ? AND module = ?", [user.id, user.profile_id, mod]);
  if (Number(n?.n) >= 30) throw new HttpError("That is enough views for one page: delete some first.", 400);
  if (body.is_default) await execute("UPDATE saved_views SET is_default = 0 WHERE user_id = ? AND profile_id = ? AND module = ?", [user.id, user.profile_id, mod]);
  const res = await execute("INSERT INTO saved_views (profile_id, user_id, module, name, state, shared, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)", [user.profile_id, user.id, mod, name, JSON.stringify(cleanState(body.state)), shared ? 1 : 0, body.is_default ? 1 : 0]);
  return res.insertId;
}

async function owned(user, id, { edit = false } = {}) {
  const row = await queryOne(`${SELECT} WHERE v.id = ? AND v.profile_id = ?`, [id, user.profile_id]);
  if (!row || (row.user_id !== user.id && !row.shared)) throw new HttpError("View not found.", 404);
  if (edit && row.user_id !== user.id && !can(user, "manager")) throw new HttpError("Only whoever saved this view, or a manager, can change it.", 403);
  return row;
}

/** { name?, state?, shared?, is_default? }. `is_default` is per person even on a shared view. */
export async function updateView(user, id, body) {
  const row = await owned(user, id, { edit: "name" in body || "state" in body || "shared" in body });
  const sets = [];
  const args = [];
  if ("name" in body) { const name = String(body.name ?? "").trim().slice(0, 80); if (!name) throw new HttpError("Give the view a name.", 400); sets.push("name = ?"); args.push(name); }
  if ("state" in body) { sets.push("state = ?"); args.push(JSON.stringify(cleanState(body.state))); }
  if ("shared" in body) { if (body.shared && !can(user, "editor")) throw new HttpError("Viewers keep their views to themselves.", 403); sets.push("shared = ?"); args.push(body.shared ? 1 : 0); }
  if (sets.length) await execute(`UPDATE saved_views SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  if ("is_default" in body) {
    if (row.user_id !== user.id) throw new HttpError("A default view has to be your own. Save a copy first.", 400);
    if (body.is_default) await execute("UPDATE saved_views SET is_default = 0 WHERE user_id = ? AND profile_id = ? AND module = ?", [user.id, user.profile_id, row.module]);
    await execute("UPDATE saved_views SET is_default = ? WHERE id = ?", [body.is_default ? 1 : 0, id]);
  }
  return (await listViews(user, row.module)).find((v) => v.id === id);
}

export async function deleteView(user, id) {
  const row = await owned(user, id, { edit: true });
  await execute("DELETE FROM saved_views WHERE id = ?", [id]);
  return { id, module: row.module };
}
