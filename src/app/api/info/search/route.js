import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { INFO_SELECT } from "../route";
import { parseTableJson, tableText } from "@/lib/text-tables";
import { displayMentions } from "@/lib/mentions";

const FIELDS = ["title", "content", "notes", "attachments"];
const SNIPPET = 90;

function snippet(text, term) {
  if (!text) return null;
  const hay = displayMentions(text);
  const i = hay.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - SNIPPET);
  const end = Math.min(hay.length, i + term.length + SNIPPET);
  return `${start > 0 ? "…" : ""}${hay.slice(start, end).replace(/\s+/g, " ")}${end < hay.length ? "…" : ""}`;
}

/**
 * Full-text-ish search over the active profile's info vault.
 * ?q= (words are ANDed) &fields=title,content,notes,attachments &category= &project_id= &tag= &pinned=1
 * Each result carries `matches: [{ field, label?, snippet }]` for highlighting.
 */
export const GET = handler(async (request, _params, user) => {
  const started = Date.now();
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const fields = new Set((sp.get("fields") || FIELDS.join(",")).split(",").filter((f) => FIELDS.includes(f)));
  if (!terms.length || !fields.size) return ok({ items: [], took_ms: 0, terms });

  const where = ["i.profile_id = ?"];
  const args = [user.profile_id];
  if (sp.get("category")) { where.push("i.category = ?"); args.push(sp.get("category")); }
  if (sp.get("project_id")) { where.push("i.project_id = ?"); args.push(sp.get("project_id")); }
  if (sp.get("tag")) { where.push("FIND_IN_SET(?, i.tags)"); args.push(sp.get("tag")); }
  if (sp.get("pinned") === "1") where.push("i.pinned = 1");
  for (const term of terms) {
    const like = `%${term}%`;
    const ors = [];
    if (fields.has("title")) { ors.push("i.title LIKE ?", "i.summary LIKE ?", "i.tags LIKE ?", "i.url LIKE ?", "i.username LIKE ?"); args.push(like, like, like, like, like); }
    if (fields.has("content")) { ors.push("i.content LIKE ?"); args.push(like); }
    if (fields.has("notes")) { ors.push("EXISTS (SELECT 1 FROM info_notes n WHERE n.info_id = i.id AND (n.title LIKE ? OR n.content LIKE ?))"); args.push(like, like); }
    if (fields.has("attachments")) { ors.push("EXISTS (SELECT 1 FROM info_attachments a WHERE a.info_id = i.id AND a.original_name LIKE ?)"); args.push(like); }
    where.push(`(${ors.join(" OR ")})`);
  }
  const rows = await query(`${INFO_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.pinned DESC, i.updated_at DESC LIMIT 100`, args);
  if (!rows.length) return ok({ items: [], took_ms: Date.now() - started, terms });

  const ids = rows.map((r) => r.id);
  const notes = fields.has("notes") ? await query("SELECT info_id, id, title, content, format FROM info_notes WHERE info_id IN (?) ORDER BY sort_order, id", [ids]) : [];
  const files = fields.has("attachments") ? await query("SELECT info_id, id, original_name FROM info_attachments WHERE info_id IN (?) ORDER BY sort_order, id", [ids]) : [];

  const items = rows.map(({ content, ...r }) => {
    const matches = [];
    const push = (field, text, label) => {
      const s = terms.map((t) => snippet(text, t)).find(Boolean);
      if (s) matches.push({ field, label: label ?? null, snippet: s });
    };
    if (fields.has("title")) {
      push("title", r.title);
      push("summary", r.summary);
      push("tags", r.tags);
      push("url", r.url);
      push("username", r.username);
    }
    if (fields.has("content")) push("content", content);
    for (const n of notes.filter((n) => n.info_id === r.id)) {
      const body = n.format === "table" ? tableText(parseTableJson(n.content)) : n.content;
      const s = terms.map((t) => snippet(body, t) || snippet(n.title, t)).find(Boolean);
      if (s) matches.push({ field: "note", label: n.title || `Note #${n.id}`, snippet: s, note_id: n.id });
    }
    for (const f of files.filter((f) => f.info_id === r.id)) {
      if (terms.some((t) => f.original_name.toLowerCase().includes(t.toLowerCase()))) matches.push({ field: "attachment", label: f.original_name, snippet: f.original_name, attachment_id: f.id });
    }
    return { ...r, has_secret: Boolean(r.has_secret), has_content: Boolean(content), matches: matches.slice(0, 6) };
  });
  return ok({ items, took_ms: Date.now() - started, terms });
});
