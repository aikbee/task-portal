import { query } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { normaliseTags, tagList } from "@/lib/tags";
import { MAX_ASSIGNEES } from "@/lib/task-assignees";
import { notifyInvolved } from "@/lib/notifications";
import { updateTask } from "../[id]/route";

const MAX_TASKS = 200;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const ids = (raw) => [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** Check a bulk patch once, before any task is touched. */
function checkPatch(p) {
  if (!p || typeof p !== "object") throw new HttpError("Say what to change.", 400);
  if ("status" in p && !TASK_STATUS[p.status]) throw new HttpError("Unknown status.", 400);
  if ("priority" in p && !TASK_PRIORITY[p.priority]) throw new HttpError("Unknown priority.", 400);
  for (const f of ["due_date", "start_date"]) if (f in p && p[f] !== null && !isDate(p[f])) throw new HttpError(`${f} must be a date (YYYY-MM-DD) or null.`, 400);
  if ("shift_days" in p && (!Number.isInteger(p.shift_days) || p.shift_days === 0 || Math.abs(p.shift_days) > 3650)) throw new HttpError("Move dates by a whole number of days (not 0).", 400);
  if ("shift_days" in p && ("due_date" in p || "start_date" in p)) throw new HttpError("Either set dates or move them, not both.", 400);
  if ("assignee_mode" in p && !["replace", "add", "remove"].includes(p.assignee_mode)) throw new HttpError("assignee_mode must be replace, add or remove.", 400);
  const touched = ["status", "priority", "project_id", "due_date", "start_date", "shift_days", "assignee_mode", "assignee_ids", "add_tags", "remove_tags", "requirement_id", "tags"].some((k) => k in p);
  if (!touched) throw new HttpError("Say what to change.", 400);
}

/** What one task's PUT body is, given the bulk patch and the task as it is now. */
function bodyFor(p, cur) {
  const body = {};
  for (const f of ["status", "priority", "due_date", "start_date", "requirement_id", "tags"]) if (f in p) body[f] = p[f];
  if ("project_id" in p) body.project_id = p.project_id || null;
  if ("shift_days" in p) {
    if (cur.due_date) body.due_date = shift(cur.due_date, p.shift_days);
    if (cur.start_date) body.start_date = shift(cur.start_date, p.shift_days);
  }
  if (p.assignee_mode || Array.isArray(p.assignee_ids)) {
    const given = ids(p.assignee_ids);
    const mode = p.assignee_mode ?? "replace";
    const next = mode === "replace" ? given : mode === "add" ? [...cur.assignee_ids, ...given.filter((i) => !cur.assignee_ids.includes(i))] : cur.assignee_ids.filter((i) => !given.includes(i));
    if (next.length > MAX_ASSIGNEES) throw new HttpError(`A task takes up to ${MAX_ASSIGNEES} assignees.`, 400);
    body.assignee_ids = next;
  }
  if ("add_tags" in p || "remove_tags" in p) {
    const add = tagList(normaliseTags(p.add_tags ?? "") ?? "");
    const drop = new Set(tagList(normaliseTags(p.remove_tags ?? "") ?? ""));
    body.tags = [...new Set([...tagList(cur.tags), ...add])].filter((t) => !drop.has(t)).join(",");
  }
  if (p.today) body.today = p.today;
  return body;
}
/** The patch that puts a task back the way it was, for the fields this edit touched. */
const undoFor = (body, before) => {
  const back = {};
  for (const f of ["status", "priority", "project_id", "requirement_id", "due_date", "start_date", "tags"]) if (f in body) back[f] = before[f] ?? null;
  if ("project_id" in body && !("requirement_id" in body)) back.requirement_id = before.requirement_id ?? null; // moving projects may have dropped it
  if ("assignee_ids" in body) back.assignee_ids = before.assignees.map((a) => a.id);
  return back;
};

/**
 * Change many tasks at once: { ids: [...], patch } — or { items: [{ id, patch }] } with one patch each (that is what
 * Undo sends back). patch: status, priority, project_id (null = none), due_date / start_date (null clears),
 * shift_days (moves both dates), assignee_mode replace|add|remove + assignee_ids, add_tags, remove_tags.
 * Every task goes through the same checks, history and webhooks as a single edit; people are told once.
 */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items.map((i) => ({ id: Number(i?.id), patch: i?.patch })) : ids(body.ids).map((id) => ({ id, patch: body.patch }));
  if (!items.length) throw new HttpError("Pick at least one task.", 400);
  if (items.length > MAX_TASKS) throw new HttpError(`At most ${MAX_TASKS} tasks at a time.`, 400);
  for (const it of items) { if (!Number.isInteger(it.id) || it.id <= 0) throw new HttpError("Invalid task id.", 400); checkPatch(it.patch); }

  const rows = await query("SELECT t.id, t.title, t.due_date, t.start_date, t.tags, (SELECT GROUP_CONCAT(a.employee_id ORDER BY a.position) FROM task_assignees a WHERE a.task_id = t.id) AS people FROM tasks t WHERE t.profile_id = ? AND t.id IN (?)", [user.profile_id, items.map((i) => i.id)]);
  const current = new Map(rows.map((r) => [r.id, { ...r, assignee_ids: String(r.people ?? "").split(",").map(Number).filter(Boolean) }]));
  const updated = [];
  const failed = [];
  const undo = [];
  const addedPeople = new Set();
  let completed = 0;
  let spawned = 0;
  for (const it of items) {
    const cur = current.get(it.id);
    if (!cur) { failed.push({ id: it.id, title: null, error: "Task not found." }); continue; }
    try {
      const put = bodyFor(it.patch, cur);
      if (!Object.keys(put).filter((k) => k !== "today").length) continue; // e.g. moving dates of a task without dates
      const { before, after, added } = await updateTask(user, it.id, put, { quiet: true });
      updated.push(after);
      undo.push({ id: it.id, patch: undoFor(put, before) });
      for (const a of added) addedPeople.add(a.id);
      if (after.status === "done" && before.status !== "done") completed++;
      if (after.next_task) spawned++;
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      failed.push({ id: it.id, title: cur.title, error: e.message });
    }
  }
  if (updated.length) {
    const n = updated.length;
    notifyInvolved(
      user,
      { type: completed ? "task_done" : "task_status", title: `${user.name} changed ${n} task${n === 1 ? "" : "s"} at once`, body: updated.slice(0, 3).map((t) => t.title).join(", ") + (n > 3 ? ` and ${n - 3} more` : ""), href: "/tasks", entityType: "task", entityId: updated[0].id },
      { employeeIds: [...addedPeople], managers: true, forAssignee: { type: "task_assigned", title: `${user.name} assigned you tasks`, body: "Open My tasks to see them.", href: "/my-tasks" } }
    );
  }
  return ok({ updated: updated.length, failed, completed, spawned, tasks: updated, undo });
});
