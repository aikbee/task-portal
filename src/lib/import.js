import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { IMPORT_KINDS, IMPORT_MAX_ROWS } from "./import-fields";
import { TASK_STATUS, TASK_PRIORITY, PROJECT_STATUS, EMPLOYEE_STATUS, REQ_TYPE, REQ_PRIORITY, REQ_STATUS } from "./constants";
import { normaliseTags } from "./tags";
import { toCode } from "./utils";
import { nextSortOrder } from "./ordering";
import { setAssignees, MAX_ASSIGNEES } from "./task-assignees";
import { logTask } from "./task-activity";
import { autoLinkByEmail, can } from "./sharing";
import { moveToTrash } from "./trash";
import { normaliseCode, assertCodeFree, bumpSequence, nextRequirementCode } from "@/app/api/requirements/route";

/**
 * Spreadsheet import. `resolveImport` turns raw cells into typed values and lists every problem per row (the
 * dialog shows this as a preview); `commitImport` inserts what is clean and records the batch so `undoImport`
 * can move everything it created to the recycle bin. Nothing here sends notifications: a bulk import is not
 * two hundred events.
 */
const ENUMS = {
  tasks: { status: TASK_STATUS, priority: TASK_PRIORITY },
  employees: { status: EMPLOYEE_STATUS },
  projects: { status: PROJECT_STATUS },
  requirements: { type: REQ_TYPE, priority: REQ_PRIORITY, status: REQ_STATUS },
};
const ENUM_DEFAULT = { tasks: { status: "todo", priority: "medium" }, employees: { status: "active" }, projects: { status: "planning" }, requirements: { type: "functional", priority: "should", status: "draft" } };
// words people write in spreadsheets that are not our keys or labels
const SYNONYMS = {
  "tasks.status": { open: "todo", new: "todo", backlog: "todo", pending: "todo", "not started": "todo", wip: "in_progress", doing: "in_progress", started: "in_progress", active: "in_progress", ongoing: "in_progress", qa: "review", testing: "review", reviewing: "review", completed: "done", complete: "done", closed: "done", finished: "done", resolved: "done" },
  "tasks.priority": { normal: "medium", med: "medium", critical: "urgent", highest: "urgent", blocker: "urgent", p0: "urgent", p1: "high", p2: "medium", p3: "low", lowest: "low", minor: "low", major: "high" },
  "projects.status": { planned: "planning", proposed: "planning", "in progress": "active", ongoing: "active", running: "active", paused: "on_hold", hold: "on_hold", blocked: "on_hold", done: "completed", finished: "completed", closed: "completed", cancelled: "archived", canceled: "archived" },
  "employees.status": { leave: "on_leave", "on leave": "on_leave", vacation: "on_leave", left: "inactive", former: "inactive", disabled: "inactive", resigned: "inactive" },
  "requirements.priority": { must: "must", m: "must", high: "must", should: "should", s: "should", medium: "should", could: "could", c: "could", low: "could", wont: "wont", w: "wont", "won't": "wont", "will not": "wont", never: "wont" },
  "requirements.status": { new: "draft", proposed: "draft", accepted: "approved", ready: "approved", doing: "in_progress", wip: "in_progress", active: "in_progress", delivered: "done", completed: "done", complete: "done", closed: "done", declined: "rejected", dropped: "rejected" },
  "requirements.type": { feature: "functional", func: "functional", nfr: "non_functional", quality: "non_functional", performance: "non_functional", tech: "technical", engineering: "technical", biz: "business", commercial: "business", limit: "constraint", limitation: "constraint", restriction: "constraint" },
};
const norm = (v) => String(v ?? "").toLowerCase().replace(/[_\-./]+/g, " ").replace(/[^a-z0-9' ]+/g, "").replace(/\s+/g, " ").trim();

function matchEnum(kind, field, raw) {
  const map = ENUMS[kind][field];
  const key = norm(raw);
  if (!key) return null;
  for (const [k, v] of Object.entries(map)) if (norm(k) === key || norm(v.label) === key) return k;
  const syn = SYNONYMS[`${kind}.${field}`]?.[key];
  return syn && map[syn] ? syn : undefined; // undefined = unknown word
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
/** "2026-09-18", "18/9/2026", "9/18/2026" (per `dayFirst`), "18 Sep 2026", "Sep 18, 2026", "18.09.26", Excel serials. Returns YYYY-MM-DD or null. */
export function parseDate(raw, dayFirst = true) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/.exec(s))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [a, b] = [+m[1], +m[2]];
    if (a > 12 && b <= 12) return ymd(y, b, a);
    if (b > 12 && a <= 12) return ymd(y, a, b);
    return dayFirst ? ymd(y, b, a) : ymd(y, a, b);
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(s))) { const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)]; return mo ? ymd(+m[3], mo, +m[1]) : null; }
  if ((m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s))) { const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)]; return mo ? ymd(+m[3], mo, +m[2]) : null; }
  if (/^\d{5}$/.test(s) && +s > 25569 && +s < 73050) return new Date((+s - 25569) * 86400000).toISOString().slice(0, 10); // Excel serial day
  return null;
}
/** true when a column holds a/b/y dates where a and b are both <= 12: the person must say which is the day. */
export const ambiguousDates = (values) => values.some((v) => { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(String(v ?? "").trim()); return m && +m[1] <= 12 && +m[2] <= 12 && +m[1] !== +m[2]; });

const splitPeople = (raw) => String(raw ?? "").split(/[;,\n|]|\s+&\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
const splitName = (full) => {
  const parts = String(full ?? "").trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  if (/,$/.test(parts[0]) && parts.length >= 2) return { first_name: parts.slice(1).join(" "), last_name: parts[0].replace(/,$/, "") }; // "Lee, Jane"
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? "").trim());

/** Everything in the workspace the rows may refer to, loaded once. */
async function lookups(owner) {
  const [projects, employees, requirements, tasks] = await Promise.all([
    query("SELECT id, name, code FROM projects WHERE profile_id = ?", [owner]),
    query("SELECT id, first_name, last_name, email FROM employees WHERE profile_id = ?", [owner]),
    query("SELECT id, project_id, code, title FROM requirements WHERE profile_id = ?", [owner]),
    query("SELECT id, project_id, title, status FROM tasks WHERE profile_id = ?", [owner]),
  ]);
  return { projects, employees, requirements, tasks };
}
const findProject = (L, raw) => { const k = norm(raw); return k ? L.projects.find((p) => norm(p.name) === k || norm(p.code) === k) ?? null : null; };
function findEmployee(L, raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (isEmail(s)) return L.employees.find((e) => e.email.toLowerCase() === s.toLowerCase()) ?? null;
  const k = norm(s);
  const full = L.employees.filter((e) => norm(`${e.first_name} ${e.last_name}`) === k || norm(`${e.last_name} ${e.first_name}`) === k || norm(`${e.last_name}, ${e.first_name}`) === k);
  if (full.length) return full[0];
  const first = L.employees.filter((e) => norm(e.first_name) === k || norm(e.last_name) === k);
  return first.length === 1 ? first[0] : null;
}
const findRequirement = (L, raw, projectId) => { const k = norm(raw); if (!k) return null; const pool = projectId ? L.requirements.filter((r) => r.project_id === projectId) : L.requirements; return pool.find((r) => norm(r.code) === k) ?? pool.find((r) => norm(r.title) === k) ?? null; };

/**
 * Cells -> typed rows. `columns[i]` names the field of column i (null = ignored). Returns
 * { rows: [{ n, values, shown, problems: [{ field, message, level }], skip }], counts, needs_date_order }.
 * Problems of level "error" skip the row; "warn" rows go in as they are.
 */
export async function resolveImport(user, { kind, columns, rows, options = {} }) {
  const spec = IMPORT_KINDS[kind];
  if (!spec) throw new HttpError("Unknown import type.", 400);
  if (!Array.isArray(rows) || !Array.isArray(columns)) throw new HttpError("Rows and columns are required.", 400);
  if (rows.length > IMPORT_MAX_ROWS) throw new HttpError(`At most ${IMPORT_MAX_ROWS} rows per import.`, 400);
  const fields = columns.map((c) => (c && spec.fields[c] ? c : null));
  const dayFirst = options.date_order !== "mdy";
  const createMissing = options.create_missing !== false;
  const skipExisting = options.skip_existing !== false;
  const L = await lookups(user.profile_id);
  const seen = { projects: new Map(), employees: new Map(), titles: new Set(), emails: new Set(), codes: new Set() }; // within this import
  const pendingProjects = new Map(); // name -> placeholder created on commit
  const pendingEmployees = new Map();
  let needsDateOrder = false;
  const dateCols = fields.map((f, i) => (f && spec.fields[f].type === "date" ? i : -1)).filter((i) => i >= 0);
  for (const i of dateCols) if (ambiguousDates(rows.map((r) => r[i]))) needsDateOrder = true;

  const out = rows.map((cells, idx) => {
    const raw = {};
    fields.forEach((f, i) => { if (f) raw[f] = raw[f] ? `${raw[f]} ${String(cells[i] ?? "").trim()}`.trim() : String(cells[i] ?? "").trim(); });
    const problems = [];
    const err = (field, message) => problems.push({ field, message, level: "error" });
    const warn = (field, message) => problems.push({ field, message, level: "warn" });
    const values = {};
    const shown = {};

    for (const [f, def] of Object.entries(spec.fields)) {
      const v = raw[f] ?? "";
      if (def.required && !v && def.type !== "ref") err(f, `${def.label} is required.`);
      if (!v) continue;
      switch (def.type) {
        case "enum": {
          const k = matchEnum(kind, f, v);
          if (k === undefined) { warn(f, `"${v}" is not a known ${def.label.toLowerCase()}: the default is used.`); values[f] = ENUM_DEFAULT[kind][f]; }
          else values[f] = k;
          shown[f] = ENUMS[kind][f][values[f]].label;
          break;
        }
        case "date": {
          const d = parseDate(v, dayFirst);
          if (!d) err(f, `"${v}" is not a date.`);
          else { values[f] = d; shown[f] = d; }
          break;
        }
        case "number": {
          const n = Number(String(v).replace(/[^\d.-]/g, ""));
          if (!Number.isFinite(n) || n < 0) err(f, `"${v}" is not a number.`);
          else { values[f] = Math.round(n * 100) / 100; shown[f] = values[f]; }
          break;
        }
        case "tags": values[f] = normaliseTags(v.replace(/;/g, ",")); shown[f] = values[f]; break;
        case "email": if (!isEmail(v)) err(f, `"${v}" is not an email address.`); else { values[f] = v.toLowerCase(); shown[f] = values[f]; } break;
        case "code": values[f] = toCode(v); shown[f] = values[f]; break;
        case "reqcode": { try { values[f] = normaliseCode(v); shown[f] = values[f]; } catch (e) { err(f, e.message); } break; }
        case "fullname": { Object.assign(values, splitName(v)); shown[f] = v; break; }
        case "people": case "ref": break; // resolved below, once projects are known
        default: values[f] = v.slice(0, def.max ?? 65535); shown[f] = values[f]; if (def.max && v.length > def.max) warn(f, `${def.label} was cut to ${def.max} characters.`);
      }
    }

    // references
    const projectRaw = raw.project;
    if ("project" in spec.fields) {
      if (projectRaw) {
        const p = findProject(L, projectRaw) ?? seen.projects.get(norm(projectRaw)) ?? null;
        if (p) { values.project_id = p.id; shown.project = p.name; }
        else if (createMissing) { pendingProjects.set(norm(projectRaw), projectRaw); values.project_new = projectRaw; shown.project = `${projectRaw} (new)`; }
        else err("project", `Project "${projectRaw}" was not found.`);
      } else if (spec.fields.project.required) err("project", "Project is required.");
    }
    if ("requirement" in spec.fields && raw.requirement) {
      const r = findRequirement(L, raw.requirement, values.project_id);
      if (r) { values.requirement_id = r.id; shown.requirement = r.code; if (!values.project_id && !values.project_new) { values.project_id = r.project_id; shown.project = L.projects.find((p) => p.id === r.project_id)?.name; } }
      else warn("requirement", `Requirement "${raw.requirement}" was not found: left empty.`);
    }
    if ("employee" in spec.fields && raw.employee) {
      const e = findEmployee(L, raw.employee) ?? seen.employees.get(norm(raw.employee));
      if (e) { values.employee_id = e.id; shown.employee = `${e.first_name} ${e.last_name}`.trim(); }
      else warn("employee", `"${raw.employee}" is not an employee here: left empty.`);
    }
    if ("assignees" in spec.fields && raw.assignees) {
      const names = splitPeople(raw.assignees);
      const ids = [];
      const news = [];
      const labels = [];
      for (const name of names) {
        const e = findEmployee(L, name) ?? seen.employees.get(norm(name));
        if (e) { if (!ids.includes(e.id)) { ids.push(e.id); labels.push(`${e.first_name} ${e.last_name}`.trim()); } }
        else if (createMissing) { if (!pendingEmployees.has(norm(name))) pendingEmployees.set(norm(name), name); news.push(name); labels.push(`${name} (new)`); }
        else warn("assignees", `"${name}" is not an employee here: skipped.`);
      }
      if (ids.length + news.length > MAX_ASSIGNEES) err("assignees", `A task takes up to ${MAX_ASSIGNEES} assignees.`);
      values.assignee_ids = ids;
      values.assignee_new = news;
      shown.assignees = labels.join(", ");
    }

    // per-kind rules and duplicates
    if (kind === "tasks") {
      if (values.start_date && values.due_date && values.start_date > values.due_date) err("due_date", "The start date is after the due date.");
      const dup = L.tasks.find((t) => norm(t.title) === norm(values.title) && (t.project_id ?? null) === (values.project_id ?? null) && t.status !== "done");
      if (dup && skipExisting) err("title", `An open task "${dup.title}" exists already${values.project_id ? " in this project" : ""}: skipped.`);
      else if (dup) warn("title", `An open task "${dup.title}" exists already.`);
    }
    if (kind === "employees") {
      if (!values.first_name && !raw.first_name && !raw.last_name) err("name", "A name is required.");
      if (!values.first_name && (raw.first_name || raw.last_name)) { values.first_name = raw.first_name || raw.last_name; values.last_name = raw.first_name ? raw.last_name || "" : ""; }
      if (values.first_name) { values.first_name = values.first_name.slice(0, 80); values.last_name = String(values.last_name ?? "").slice(0, 80); shown.name = `${values.first_name} ${values.last_name}`.trim(); }
      if (!values.email) { values.email = null; warn("email", "No email: the person cannot be linked to a portal account."); }
      const dupMail = values.email && (L.employees.find((e) => e.email && e.email.toLowerCase() === values.email) || seen.emails.has(values.email));
      const dupName = values.first_name && (L.employees.find((e) => norm(`${e.first_name} ${e.last_name}`) === norm(`${values.first_name} ${values.last_name}`)) || seen.titles.has(norm(`${values.first_name} ${values.last_name}`)));
      if ((dupMail || dupName) && skipExisting) err("name", `${dupMail ? "An employee with this email" : "An employee with this name"} exists already: skipped.`);
      else if (dupMail || dupName) warn("name", `${dupMail ? "An employee with this email" : "An employee with this name"} exists already.`);
      if (values.email) seen.emails.add(values.email);
      if (values.first_name) seen.titles.add(norm(`${values.first_name} ${values.last_name}`));
      if (!problems.some((p) => p.level === "error")) seen.employees.set(norm(shown.name), { id: null, first_name: values.first_name, last_name: values.last_name, pending: idx });
    }
    if (kind === "projects") {
      if (values.name && !values.code) { values.code = toCode(values.name) || "PROJECT"; shown.code = values.code; }
      const dup = values.name && (L.projects.find((p) => norm(p.name) === norm(values.name) || p.code === values.code) || seen.titles.has(norm(values.name)) || seen.codes.has(values.code));
      if (dup && skipExisting) err("name", `A project with this name or code exists already: skipped.`);
      else if (dup) { let c = values.code, i = 2; while (L.projects.some((p) => p.code === c) || seen.codes.has(c)) c = `${values.code.slice(0, 9)}-${i++}`; values.code = c; shown.code = c; warn("code", `The code was changed to ${c}: it was taken.`); }
      if (values.start_date && values.end_date && values.start_date > values.end_date) err("end_date", "The start date is after the end date.");
      if (values.name) { seen.titles.add(norm(values.name)); seen.codes.add(values.code); }
    }
    if (kind === "requirements" && values.project_id) {
      const pool = L.requirements.filter((r) => r.project_id === values.project_id);
      const dup = pool.find((r) => (values.code && r.code === values.code) || norm(r.title) === norm(values.title)) || seen.titles.has(`${values.project_id}:${norm(values.title)}`) || (values.code && seen.codes.has(`${values.project_id}:${values.code}`));
      if (dup && skipExisting) err("title", "A requirement with this code or title exists already in the project: skipped.");
      else if (dup && values.code && (pool.some((r) => r.code === values.code) || seen.codes.has(`${values.project_id}:${values.code}`))) err("code", `Code ${values.code} is already used in this project.`);
      seen.titles.add(`${values.project_id}:${norm(values.title)}`);
      if (values.code) seen.codes.add(`${values.project_id}:${values.code}`);
    }
    if (kind === "requirements" && values.project_new && !values.project_id) {
      // the project is created first on commit; duplicates inside the sheet are still caught
      const key = `${norm(values.project_new)}:${norm(values.title)}`;
      if (seen.titles.has(key)) err("title", "This title appears twice for the same project: skipped.");
      seen.titles.add(key);
    }
    if (kind === "tasks" && values.title) seen.titles.add(norm(values.title));
    if (kind === "projects" && values.name && !problems.some((p) => p.level === "error")) seen.projects.set(norm(values.name), { id: null, name: values.name, pending: idx });

    const skip = problems.some((p) => p.level === "error");
    return { n: idx + 1, values, shown, problems, skip };
  });

  // helpers are only created for rows that go in
  const live = out.filter((r) => !r.skip);
  const newProjects = [...new Set(live.map((r) => r.values.project_new).filter(Boolean))];
  const newEmployees = [...new Set(live.flatMap((r) => r.values.assignee_new ?? []))];
  const counts = { total: out.length, ready: live.length, skipped: out.length - live.length, warnings: live.filter((r) => r.problems.length).length, new_projects: newProjects.length, new_employees: newEmployees.length };
  return { rows: out, counts, new_names: { projects: newProjects, employees: newEmployees }, needs_date_order: needsDateOrder, fields };
}

const freeProjectCode = async (owner, base) => {
  let code = base || "PROJECT";
  for (let i = 2; await queryOne("SELECT id FROM projects WHERE profile_id = ? AND code = ?", [owner, code]); i++) code = `${(base || "PROJECT").slice(0, 9)}-${i}`;
  return code;
};

/** Insert the clean rows. Returns { batch_id, created: { <kind>: n, projects?, employees? }, ids }. */
export async function commitImport(user, payload) {
  const resolved = await resolveImport(user, payload);
  const { kind } = payload;
  const owner = user.profile_id;
  const items = []; // [{ kind, id }] for undo, helpers first
  const created = { [kind]: 0 };
  const newProjects = new Map(); // norm(name) -> id
  const newEmployees = new Map();
  const projectId = async (row) => {
    if (row.values.project_id) return row.values.project_id;
    const name = row.values.project_new;
    if (!name) return null;
    const k = norm(name);
    if (newProjects.has(k)) return newProjects.get(k);
    const again = await queryOne("SELECT id FROM projects WHERE profile_id = ? AND LOWER(name) = ?", [owner, name.toLowerCase()]);
    if (again) { newProjects.set(k, again.id); return again.id; }
    const res = await execute("INSERT INTO projects (user_id, profile_id, name, code, status) VALUES (?, ?, ?, ?, 'planning')", [user.owner_id, owner, name.slice(0, 160), await freeProjectCode(owner, toCode(name))]);
    newProjects.set(k, res.insertId);
    items.push({ kind: "project", id: res.insertId });
    created.projects = (created.projects ?? 0) + 1;
    return res.insertId;
  };
  const employeeId = async (name) => {
    const k = norm(name);
    if (newEmployees.has(k)) return newEmployees.get(k);
    const { first_name, last_name } = splitName(name);
    const res = await execute("INSERT INTO employees (user_id, profile_id, first_name, last_name, email, status) VALUES (?, ?, ?, ?, NULL, 'active')", [user.owner_id, owner, first_name.slice(0, 80), last_name.slice(0, 80)]);
    newEmployees.set(k, res.insertId);
    items.push({ kind: "employee", id: res.insertId });
    created.employees = (created.employees ?? 0) + 1;
    return res.insertId;
  };
  const insert = async (table, data) => {
    const cols = Object.keys(data);
    const res = await execute(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => data[c]));
    return res.insertId;
  };
  const base = () => ({ user_id: user.owner_id, profile_id: owner });
  const ENTITY = { tasks: "task", employees: "employee", projects: "project", requirements: "requirement" };

  for (const row of resolved.rows) {
    if (row.skip) continue;
    const v = row.values;
    if (kind === "tasks") {
      const id = await insert("tasks", { ...base(), title: v.title, description: v.description ?? null, project_id: await projectId(row), requirement_id: v.requirement_id ?? null, status: v.status ?? "todo", priority: v.priority ?? "medium", start_date: v.start_date ?? null, due_date: v.due_date ?? null, estimate_hours: v.estimate_hours ?? null, tags: v.tags ?? null, sort_order: await nextSortOrder("tasks") });
      const people = [...(v.assignee_ids ?? [])];
      for (const name of v.assignee_new ?? []) people.push(await employeeId(name));
      if (people.length) await setAssignees(id, owner, people);
      await logTask(user, id, { action: "created", field: "import" });
      items.push({ kind: "task", id });
    } else if (kind === "employees") {
      const id = await insert("employees", { ...base(), first_name: v.first_name, last_name: v.last_name ?? "", email: v.email ?? null, phone: v.phone ?? null, job_title: v.job_title ?? null, department: v.department ?? null, status: v.status ?? "active", hired_at: v.hired_at ?? null });
      if (v.email) await autoLinkByEmail(owner, { employeeId: id }).catch(() => {});
      items.push({ kind: "employee", id });
    } else if (kind === "projects") {
      const id = await insert("projects", { ...base(), name: v.name, code: await freeProjectCode(owner, v.code), description: v.description ?? null, status: v.status ?? "planning", start_date: v.start_date ?? null, end_date: v.end_date ?? null, budget: v.budget ?? null });
      items.push({ kind: "project", id });
    } else if (kind === "requirements") {
      const pid = await projectId(row);
      let code = v.code ?? null;
      if (code) { try { await assertCodeFree(pid, code); await bumpSequence(pid, code); } catch { code = null; } }
      if (!code) code = await nextRequirementCode(pid);
      const id = await insert("requirements", { ...base(), project_id: pid, code, title: v.title, description: v.description ?? null, acceptance_criteria: v.acceptance_criteria ?? null, type: v.type ?? "functional", priority: v.priority ?? "should", status: v.status ?? "draft", employee_id: v.employee_id ?? null, sort_order: await nextSortOrder("requirements", pid) });
      items.push({ kind: "requirement", id });
    }
    created[kind]++;
  }
  const batch = items.length ? await execute("INSERT INTO import_batches (profile_id, user_id, kind, items) VALUES (?, ?, ?, ?)", [owner, user.id, kind, JSON.stringify(items)]) : null;
  return { batch_id: batch?.insertId ?? null, created, skipped: resolved.counts.skipped, entity: ENTITY[kind] };
}

/** Move everything a batch created to the recycle bin. The importer within a day, or a manager. */
export async function undoImport(user, batchId) {
  const b = await queryOne("SELECT * FROM import_batches WHERE id = ? AND profile_id = ?", [batchId, user.profile_id]);
  if (!b) throw new HttpError("Import not found.", 404);
  if (b.undone_at) throw new HttpError("This import was undone already.", 409);
  const mine = b.user_id === user.id && Date.now() - new Date(b.created_at).getTime() < 24 * 3600000;
  if (!mine && !can(user, "manager")) throw new HttpError("Only the person who imported this (within a day) or a manager can undo it.", 403);
  const items = typeof b.items === "string" ? JSON.parse(b.items) : b.items;
  let moved = 0;
  // records first, then the projects / employees that were created for them (a task must be gone before its project)
  for (const it of [...items].reverse()) {
    try { await moveToTrash(user, it.kind, it.id); moved++; } catch (e) { if (e?.status !== 404) throw e; }
  }
  await execute("UPDATE import_batches SET undone_at = NOW() WHERE id = ?", [batchId]);
  return { moved };
}
export const pruneImportBatches = () => execute("DELETE FROM import_batches WHERE created_at < NOW() - INTERVAL 7 DAY");
