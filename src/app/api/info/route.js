import { query, queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, pick, requireFields, oneOf, HttpError } from "@/lib/api-utils";
import { INFO_CATEGORY } from "@/lib/constants";
import { encryptSecret } from "@/lib/crypto";

export const INFO_FIELDS = ["title", "category", "tags", "summary", "content", "url", "username", "secret_hint", "pinned", "color", "project_id"];

/** Public columns (never the encrypted secret) + counts. */
export const INFO_SELECT = `
  SELECT i.id, i.user_id, i.profile_id, i.project_id, i.title, i.category, i.tags, i.summary, i.content, i.url, i.username, i.secret_hint, i.pinned, i.color, i.created_at, i.updated_at,
    p.name AS project_name, p.code AS project_code, p.color AS project_color,
    (i.secret_enc IS NOT NULL) AS has_secret,
    (SELECT COUNT(*) FROM info_notes n WHERE n.info_id = i.id) AS note_count,
    (SELECT COUNT(*) FROM info_attachments a WHERE a.info_id = i.id) AS attachment_count
  FROM info_items i LEFT JOIN projects p ON p.id = i.project_id`;

export function normaliseTags(raw) {
  if (raw == null) return null;
  const tags = String(raw).split(/[,\n]/).map((t) => t.trim().replace(/\s+/g, "-").toLowerCase()).filter(Boolean);
  return [...new Set(tags)].slice(0, 20).join(",") || null;
}

export async function assertInfoProject(profileId, data) {
  if (!("project_id" in data)) return;
  data.project_id = data.project_id ? Number(data.project_id) : null;
  if (data.project_id) {
    const p = await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [data.project_id, profileId]);
    if (!p) throw new HttpError("Project not found in this profile.", 400);
  }
}

export function normaliseInfo(data) {
  oneOf(data.category, Object.keys(INFO_CATEGORY), "category");
  if ("tags" in data) data.tags = normaliseTags(data.tags);
  if ("pinned" in data) data.pinned = data.pinned ? 1 : 0;
  if ("url" in data && data.url && !/^https?:\/\//i.test(data.url)) data.url = `https://${data.url}`;
  return data;
}

export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const where = ["i.profile_id = ?"];
  const args = [user.profile_id];
  if (sp.get("category")) { where.push("i.category = ?"); args.push(sp.get("category")); }
  if (sp.get("project_id")) { where.push("i.project_id = ?"); args.push(sp.get("project_id")); }
  if (sp.get("tag")) { where.push("FIND_IN_SET(?, i.tags)"); args.push(sp.get("tag")); }
  const q = sp.get("q");
  if (q) { where.push("(i.title LIKE ? OR i.summary LIKE ? OR i.tags LIKE ? OR i.content LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await query(`${INFO_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.pinned DESC, i.updated_at DESC`, args);
  // lists never carry the long body
  return ok(rows.map(({ content, ...r }) => ({ ...r, has_content: Boolean(content), has_secret: Boolean(r.has_secret) })));
});

export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const data = normaliseInfo(pick(body, INFO_FIELDS));
  requireFields(data, ["title"]);
  await assertInfoProject(user.profile_id, data);
  data.user_id = user.owner_id;
  data.profile_id = user.profile_id;
  if (body.secret) data.secret_enc = encryptSecret(String(body.secret));
  const cols = Object.keys(data);
  const res = await execute(`INSERT INTO info_items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
  const row = await queryOne(`${INFO_SELECT} WHERE i.id = ?`, [res.insertId]);
  return ok({ ...row, has_secret: Boolean(row.has_secret) }, { status: 201 });
});
