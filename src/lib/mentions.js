/**
 * Mentions inside outputs / notes: `@[Label](type:id)` tokens that link to a detail page.
 * Plain module — shared by the editor, the chips and tests.
 */
export const MENTION_TYPES = {
  employee: { path: "employees", label: "Employee" },
  project: { path: "projects", label: "Project" },
  task: { path: "tasks", label: "Task" },
  requirement: { path: "requirements", label: "Requirement" },
  info: { path: "info", label: "Info" },
};

const TYPE_ALT = Object.keys(MENTION_TYPES).join("|");
export const MENTION_RE = new RegExp(`@\\[([^\\]\\n]+)\\]\\((${TYPE_ALT}):(\\d+)\\)`, "g");

export const mentionHref = (type, id) => `/${MENTION_TYPES[type].path}/${id}`;

export function mentionToken(type, id, label) {
  const clean = String(label ?? "").replace(/[\[\]\n]/g, " ").replace(/\s+/g, " ").trim() || `${MENTION_TYPES[type].label} #${id}`;
  return `@[${clean}](${type}:${id})`;
}

/** Text for display outside the editor: tokens become "@Label". */
export const displayMentions = (text) => String(text ?? "").replace(MENTION_RE, "@$1");

/** Unique mentions in document order: [{ type, id, label, href }]. */
export function parseMentions(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text ?? "").matchAll(MENTION_RE)) {
    const key = `${m[2]}:${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m[2], id: Number(m[3]), label: m[1], href: mentionHref(m[2], Number(m[3])) });
  }
  return out;
}

/** The `@query` being typed just before `caret` (an @ at the start or after whitespace), or null. */
export function mentionQueryAt(text, caret) {
  const before = String(text ?? "").slice(0, caret);
  const m = /(^|\s)@([^\n@\[\]()]{0,40})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

/** Flatten a /api/search payload into pickable items. */
export function searchToMentions(data, fullName) {
  if (!data) return [];
  return [
    ...(data.employees ?? []).map((e) => ({ type: "employee", id: e.id, label: fullName(e), sub: e.job_title || e.email, color: e.avatar_color })),
    ...(data.projects ?? []).map((p) => ({ type: "project", id: p.id, label: p.name, sub: p.code, color: p.color })),
    ...(data.tasks ?? []).map((t) => ({ type: "task", id: t.id, label: t.title, sub: t.project_name })),
    ...(data.requirements ?? []).map((r) => ({ type: "requirement", id: r.id, label: `${r.code} · ${r.title}`, sub: r.project_name, color: r.project_color })),
    ...(data.info ?? []).map((i) => ({ type: "info", id: i.id, label: i.title, sub: i.category, color: i.color })),
  ];
}
