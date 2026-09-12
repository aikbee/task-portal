import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, HttpError } from "@/lib/api-utils";

export const BOARD_FIELDS = ["title", "description", "notes", "project_id", "width", "height", "background"];
const SIZE = { min: 200, max: 6000 };
const DATA_MAX = 12 * 1024 * 1024; // Fabric JSON (images are referenced by URL, not embedded)
const THUMB_MAX = 2 * 1024 * 1024;

/** Public columns + counts; never the (large) drawing data or thumbnail in lists. */
export const BOARD_SELECT = `
  SELECT b.id, b.user_id, b.profile_id, b.project_id, b.title, b.description, b.notes, b.width, b.height, b.background, b.created_at, b.updated_at,
    p.name AS project_name, p.code AS project_code, p.color AS project_color,
    (b.data IS NOT NULL AND b.data <> '') AS has_drawing,
    (SELECT COUNT(*) FROM draw_board_attachments a WHERE a.board_id = b.id) AS image_count
  FROM draw_boards b
  LEFT JOIN projects p ON p.id = b.project_id`;

export function normaliseBoard(data) {
  if ("project_id" in data) data.project_id = data.project_id ? Number(data.project_id) : null;
  if ("title" in data) data.title = String(data.title ?? "").trim().slice(0, 200);
  if ("description" in data) data.description = data.description ? String(data.description).slice(0, 500) : null;
  if ("notes" in data) data.notes = data.notes == null ? null : String(data.notes);
  for (const k of ["width", "height"]) {
    if (k in data) {
      const n = Math.round(Number(data[k]));
      if (!Number.isFinite(n) || n < SIZE.min || n > SIZE.max) throw new HttpError(`${k} must be between ${SIZE.min} and ${SIZE.max} pixels.`, 400);
      data[k] = n;
    }
  }
  if ("background" in data) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(data.background))) throw new HttpError("background must be a hex colour like #ffffff.", 400);
    data.background = String(data.background).toLowerCase();
  }
  if ("data" in data && data.data != null) {
    const s = typeof data.data === "string" ? data.data : JSON.stringify(data.data);
    if (s.length > DATA_MAX) throw new HttpError("Drawing is too large to save.", 413);
    try { JSON.parse(s); } catch { throw new HttpError("Drawing data must be JSON.", 400); }
    data.data = s;
  }
  if ("thumbnail" in data && data.thumbnail != null) {
    const s = String(data.thumbnail);
    if (!s.startsWith("data:image/") || s.length > THUMB_MAX) throw new HttpError("Invalid thumbnail.", 400);
    data.thumbnail = s;
  }
  return data;
}

export async function assertBoardProject(projectId, profileId) {
  if (projectId == null) return;
  const p = await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [projectId, profileId]);
  if (!p) throw new HttpError("Project not found in this profile.", 400);
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const where = ["b.profile_id = ?"];
  const args = [user.profile_id];
  if (sp.get("project_id")) { where.push("b.project_id = ?"); args.push(sp.get("project_id")); }
  const q = sp.get("q");
  if (q) { where.push("(b.title LIKE ? OR b.description LIKE ? OR b.notes LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await query(`${BOARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.updated_at DESC`, args);
  return ok(rows.map((r) => ({ ...r, has_drawing: Boolean(r.has_drawing) })));
});

export const POST = handler(async (request, _params, user) => {
  const body = normaliseBoard(pick(await readJson(request), BOARD_FIELDS));
  requireFields(body, ["title"]);
  await assertBoardProject(body.project_id ?? null, user.profile_id);
  const res = await execute(
    "INSERT INTO draw_boards (user_id, profile_id, project_id, title, description, notes, width, height, background) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [user.owner_id, user.profile_id, body.project_id ?? null, body.title, body.description ?? null, body.notes ?? null, body.width ?? 1280, body.height ?? 800, body.background ?? "#ffffff"]
  );
  const row = await queryOne(`${BOARD_SELECT} WHERE b.id = ?`, [res.insertId]);
  return ok({ ...row, has_drawing: false }, { status: 201 });
});
