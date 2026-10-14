import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { lastOrigin } from "./origin";
import { TASK_STATUS, TASK_PRIORITY } from "./constants";

/**
 * The stable API (/api/v1): what other systems build on. The app's own routes may change with the screens; these
 * names and shapes do not. Helpers shared by the v1 routes: the task as v1 shows it, people by email or id, projects
 * by id or code, paging, Idempotency-Key.
 */
export const V1_STATUSES = Object.keys(TASK_STATUS);
export const V1_PRIORITIES = Object.keys(TASK_PRIORITY);
const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const day = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** A task as v1 shows it. `emails`: employee id → email (from emailsOf). */
export function taskOut(t, emails = new Map()) {
  const origin = lastOrigin();
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    project: t.project_id ? { id: t.project_id, name: t.project_name, code: t.project_code } : null,
    assignees: (t.assignees ?? []).map((p, i) => ({ id: p.id, name: p.name, email: emails.get(p.id) ?? null, lead: i === 0 })),
    start_date: day(t.start_date),
    due_date: day(t.due_date),
    estimate_hours: t.estimate_hours == null ? null : Number(t.estimate_hours),
    tags: t.tags ? String(t.tags).split(",").filter(Boolean) : [],
    external_id: t.external_id ?? null,
    checklist: { done: Number(t.checklist_done ?? 0), total: Number(t.checklist_total ?? 0) },
    comment_count: Number(t.comment_count ?? 0),
    file_count: Number(t.attachment_count ?? 0),
    minutes_logged: Number(t.minutes_logged ?? 0),
    blocked: Number(t.blocked_by_open ?? 0) > 0,
    url: origin ? `${origin}/tasks/${t.id}` : null,
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
  };
}
/** Emails of everybody on these tasks: employee id → email. */
export async function emailsOf(rows) {
  const ids = [...new Set(rows.flatMap((t) => (t.assignees ?? []).map((p) => p.id)))];
  if (!ids.length) return new Map();
  const found = await query("SELECT e.id, COALESCE(e.email, u.email) AS email FROM employees e LEFT JOIN users u ON u.id = e.linked_user_id WHERE e.id IN (?)", [ids]);
  return new Map(found.map((r) => [r.id, r.email]));
}
export const tasksOut = async (rows) => {
  const emails = await emailsOf(rows);
  return rows.map((t) => taskOut(t, emails));
};

/** People named by employee id or email (the employee's own email, or the email of the account linked to them). */
export async function resolvePeople(user, list, field = "assignees") {
  if (list == null) return null;
  if (!Array.isArray(list)) throw new HttpError(`${field} must be a list of emails or employee ids.`, 400);
  if (list.length > 50) throw new HttpError(`${field} takes up to 50 people.`, 400);
  const ids = [];
  const unknown = [];
  for (const raw of list) {
    if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
      const row = await queryOne("SELECT id FROM employees WHERE id = ? AND profile_id = ?", [Number(raw), user.profile_id]);
      if (row) ids.push(row.id);
      else unknown.push(String(raw));
      continue;
    }
    const email = String(raw ?? "").trim().toLowerCase();
    const row = /^[^\s@]+@[^\s@]+$/.test(email)
      ? await queryOne(
          "SELECT e.id FROM employees e LEFT JOIN users u ON u.id = e.linked_user_id WHERE e.profile_id = ? AND (LOWER(e.email) = ? OR LOWER(u.email) = ?) ORDER BY e.status = 'active' DESC, e.id LIMIT 1",
          [user.profile_id, email, email]
        )
      : null;
    if (row) ids.push(row.id);
    else unknown.push(String(raw));
  }
  if (unknown.length) throw new HttpError(`Nobody in this workspace matches: ${unknown.join(", ")}.`, 400, { unknown });
  return [...new Set(ids)];
}

/** A project of the workspace by id or code; null clears. */
export async function resolveProject(user, value) {
  if (value == null || value === "") return null;
  const row = /^\d+$/.test(String(value))
    ? await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [Number(value), user.profile_id])
    : await queryOne("SELECT id FROM projects WHERE profile_id = ? AND LOWER(code) = LOWER(?)", [user.profile_id, String(value).trim()]);
  if (!row) throw new HttpError(`Project not found: ${value}.`, 400);
  return row.id;
}

const TASK_KEYS = ["title", "description", "status", "priority", "project", "project_id", "start_date", "due_date", "estimate_hours", "tags", "assignees", "add_assignees", "remove_assignees", "external_id"];
/**
 * A v1 create/update body as the app's own task functions take it. Unknown keys are refused, so a typo is not silently
 * ignored. `current`: the task being changed (for add_assignees / remove_assignees).
 */
export async function taskBody(user, body, { current = null } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Send a JSON object.", 400);
  const unknown = Object.keys(body).filter((k) => !TASK_KEYS.includes(k));
  if (unknown.length) throw new HttpError(`Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`, 400, { unknown, allowed: TASK_KEYS });
  const out = {};
  for (const f of ["title", "description", "start_date", "due_date", "estimate_hours", "external_id"]) if (f in body) out[f] = body[f];
  if ("status" in body) {
    if (!V1_STATUSES.includes(body.status)) throw new HttpError(`status must be one of: ${V1_STATUSES.join(", ")}.`, 400);
    out.status = body.status;
  }
  if ("priority" in body) {
    if (!V1_PRIORITIES.includes(body.priority)) throw new HttpError(`priority must be one of: ${V1_PRIORITIES.join(", ")}.`, 400);
    out.priority = body.priority;
  }
  if ("tags" in body) out.tags = Array.isArray(body.tags) ? body.tags.join(",") : body.tags;
  if ("project" in body || "project_id" in body) out.project_id = await resolveProject(user, body.project_id ?? body.project);
  if ("assignees" in body) out.assignee_ids = (await resolvePeople(user, body.assignees)) ?? [];
  if ("add_assignees" in body || "remove_assignees" in body) {
    const base = out.assignee_ids ?? current?.assignees?.map((p) => p.id) ?? [];
    const add = (await resolvePeople(user, body.add_assignees ?? [], "add_assignees")) ?? [];
    const remove = new Set((await resolvePeople(user, body.remove_assignees ?? [], "remove_assignees")) ?? []);
    out.assignee_ids = [...new Set([...base, ...add])].filter((id) => !remove.has(id));
  }
  return out;
}

/** 409 when another task of the workspace already carries this external id. */
export async function assertExternalFree(user, externalId, exceptId = null) {
  const value = externalId == null ? "" : String(externalId).trim();
  if (!value) return;
  const row = await queryOne("SELECT id FROM tasks WHERE profile_id = ? AND external_id = ? AND id <> ?", [user.profile_id, value, exceptId ?? 0]);
  if (row) throw new HttpError(`A task with external_id "${value}" exists already (id ${row.id}).`, 409, { id: row.id });
}

/* ---------- paging ---------- */

const encodeCursor = (row) => Buffer.from(JSON.stringify({ u: iso(row.updated_at), i: row.id })).toString("base64url");
function decodeCursor(raw) {
  try {
    const c = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    if (typeof c.u !== "string" || !Number.isInteger(c.i) || Number.isNaN(Date.parse(c.u))) throw new Error("bad");
    return c;
  } catch {
    throw new HttpError("cursor is not one this API gave out.", 400);
  }
}

/**
 * The task list: filters, then pages of `limit` (1–200, default 50) in `updated_at` order, newest first, or oldest
 * first with `updated_since` (for keeping another system in step). `next_cursor` fetches the next page.
 */
export async function listTasks(user, sp, select) {
  const where = ["t.profile_id = ?"];
  const args = [user.profile_id];
  const list = (name, allowed) => {
    const v = sp.get(name);
    if (!v) return;
    const values = v.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = values.filter((x) => !allowed.includes(x));
    if (bad.length) throw new HttpError(`${name} must be among: ${allowed.join(", ")}.`, 400);
    where.push(`t.${name} IN (?)`);
    args.push(values);
  };
  list("status", V1_STATUSES);
  list("priority", V1_PRIORITIES);
  if (sp.get("project")) {
    where.push("t.project_id = ?");
    args.push(await resolveProject(user, sp.get("project")));
  }
  if (sp.get("assignee")) {
    const [id] = await resolvePeople(user, [sp.get("assignee")], "assignee");
    where.push("EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.employee_id = ?)");
    args.push(id);
  }
  if (sp.get("tag")) {
    where.push("FIND_IN_SET(?, t.tags)");
    args.push(String(sp.get("tag")).toLowerCase());
  }
  if (sp.get("q")) {
    const q = `%${String(sp.get("q")).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(t.title LIKE ? OR t.description LIKE ?)");
    args.push(q, q);
  }
  if (sp.get("external_id")) {
    where.push("t.external_id = ?");
    args.push(String(sp.get("external_id")).trim());
  }
  for (const [name, op] of [["due_from", ">="], ["due_to", "<="]]) {
    const v = sp.get(name);
    if (!v) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(`${name} must be a date (YYYY-MM-DD).`, 400);
    where.push(`t.due_date ${op} ?`);
    args.push(v);
  }
  const since = sp.get("updated_since");
  if (since) {
    if (Number.isNaN(Date.parse(since))) throw new HttpError("updated_since must be a date and time (ISO 8601), like 2026-10-14T08:00:00Z.", 400);
    where.push("t.updated_at >= ?");
    args.push(new Date(since));
  }
  const order = sp.get("order") ?? (since ? "updated_asc" : "updated_desc");
  if (!["updated_asc", "updated_desc"].includes(order)) throw new HttpError("order must be updated_asc or updated_desc.", 400);
  const asc = order === "updated_asc";
  const cursorRaw = sp.get("cursor");
  if (cursorRaw) {
    const c = decodeCursor(cursorRaw);
    where.push(asc ? "(t.updated_at > ? OR (t.updated_at = ? AND t.id > ?))" : "(t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))");
    args.push(new Date(c.u), new Date(c.u), c.i);
  }
  const limitRaw = sp.get("limit");
  const limit = limitRaw == null ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpError("limit must be between 1 and 200.", 400);
  const rows = await query(`${select} WHERE ${where.join(" AND ")} ORDER BY t.updated_at ${asc ? "ASC" : "DESC"}, t.id ${asc ? "ASC" : "DESC"} LIMIT ?`, [...args, limit + 1]);
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  return { rows: page, next_cursor: more ? encodeCursor(page.at(-1)) : null };
}

/* ---------- Idempotency-Key ---------- */

/**
 * Run a write once per Idempotency-Key: a retry with the same key (same token, method and path) gets the first
 * answer back, marked `Idempotent-Replayed: true`, instead of doing the work again. Kept for a day.
 */
export async function idempotent(request, user, fn) {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) return fn();
  if (key.length > 100) throw new HttpError("Idempotency-Key holds up to 100 characters.", 400);
  const scope = user.token ? `t:${user.token.id}` : `u:${user.id}`;
  const path = new URL(request.url).pathname;
  // a JSON body is part of "the same request"; an upload is judged by its address alone
  const json = /application\/json/i.test(request.headers.get("content-type") ?? "");
  const bodyHash = json ? crypto.createHash("sha256").update(await request.clone().text()).digest("hex") : null;
  const claim = await execute("INSERT IGNORE INTO api_idempotency (scope, idem_key, method, path, body_hash, status) VALUES (?, ?, ?, ?, ?, 0)", [scope, key, request.method, path, bodyHash]);
  if (!claim.affectedRows) {
    const prev = await queryOne("SELECT method, path, body_hash, status, response, created_at < NOW() - INTERVAL 2 MINUTE AS stale FROM api_idempotency WHERE scope = ? AND idem_key = ?", [scope, key]);
    if (prev) {
      if (prev.method !== request.method || prev.path !== path || (prev.body_hash ?? null) !== bodyHash) throw new HttpError("This Idempotency-Key was used for another request.", 422);
      if (prev.status) return new NextResponse(prev.response, { status: prev.status, headers: { "content-type": "application/json", "idempotent-replayed": "true" } });
      // a first attempt that never finished (the server restarted under it) does not block the key for a day
      if (!Number(prev.stale)) throw new HttpError("A request with this Idempotency-Key is still running.", 409);
      await execute("UPDATE api_idempotency SET created_at = NOW() WHERE scope = ? AND idem_key = ?", [scope, key]);
    }
  }
  try {
    const res = await fn();
    if (res.status < 300) await execute("UPDATE api_idempotency SET status = ?, response = ? WHERE scope = ? AND idem_key = ?", [res.status, await res.clone().text(), scope, key]);
    else await execute("DELETE FROM api_idempotency WHERE scope = ? AND idem_key = ?", [scope, key]);
    return res;
  } catch (e) {
    await execute("DELETE FROM api_idempotency WHERE scope = ? AND idem_key = ?", [scope, key]).catch(() => {});
    throw e;
  }
}

/** A JSON answer with paging: { data, next_cursor }. */
export const page = (data, next_cursor) => NextResponse.json({ data, next_cursor });
