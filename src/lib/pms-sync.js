import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { encryptSecret } from "./crypto";
import { can } from "./sharing";
import { logTask, listComments } from "./task-activity";
import { listAttachments } from "./attachments";
import { readStoredFile } from "./uploads";
import { lastOrigin } from "./origin";
import { displayMentions } from "./mentions";
import { pmsFetch, PmsError, checkBaseUrl, probeToken, findTicketKey, ticketOf, ticketsIn, projectOfKey, TICKET_KEY_RE, worklogUids, uploadLimitsIn } from "./pms";
import { ticketFields, outputComment, commentComment, checklistComment, worklogEntry, itemHash, remoteHash, guessLang, ISO_WITH_OFFSET } from "./pms-compose";
import { PMS_CATEGORIES, PMS_WORK_KINDS, PMS_LANGS } from "./pms-shared";

/**
 * Bitara PMS, the Task Portal side: a person's connections (their own tokens), which PMS project each of their
 * projects goes to, and sending what they pick from a task to its ticket. Nothing is sent on its own: every call
 * here comes from a person pressing Send after a preview (`dry_run`), and everything goes out as them.
 */

const MAX_CONNECTIONS = 10;
const TOKEN_RE = /^pms_pat_[\w.~+/=-]{8,400}$/;
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const json = (v) => {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- connections ---------- */

const shapeConnection = (r) => ({
  id: r.id, label: r.label, token_hint: r.token_hint, acting_as: r.acting_as, projects: json(r.projects) ?? [], scopes: json(r.scopes),
  status: r.status, last_error: r.last_error, checked_at: r.checked_at, base_url: r.base_url, created_at: r.created_at,
});
export const connectionsOf = async (userId) => (await query("SELECT * FROM pms_connections WHERE user_id = ? ORDER BY id", [userId])).map(shapeConnection);
async function ownConnection(user, id) {
  const row = await queryOne("SELECT * FROM pms_connections WHERE id = ? AND user_id = ?", [Number(id) || 0, user.id]);
  if (!row) throw new HttpError("Connection not found.", 404);
  return row;
}
function readToken(raw) {
  const token = String(raw ?? "").trim();
  if (!TOKEN_RE.test(token)) throw new HttpError("Paste a Bitara PMS API token: it starts with pms_pat_.", 400);
  return token;
}

/** Check the token with PMS first; only a token PMS accepts is kept (encrypted, never shown again). */
export async function addConnection(user, body) {
  const token = readToken(body?.token);
  const base_url = checkBaseUrl(body?.base_url);
  const { n } = await queryOne("SELECT COUNT(*) AS n FROM pms_connections WHERE user_id = ?", [user.id]);
  if (Number(n) >= MAX_CONNECTIONS) throw new HttpError(`You can keep up to ${MAX_CONNECTIONS} connections.`, 400);
  const probe = await probeToken({ token, base_url });
  const label = clip(body?.label, 80) || clip(probe.projects.map((p) => p.name || p.key).join(", "), 80) || "Bitara PMS";
  const res = await execute(
    "INSERT INTO pms_connections (user_id, label, base_url, token_enc, token_hint, acting_as, acting_uid, projects, scopes, status, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', NOW())",
    [user.id, label, base_url, encryptSecret(token), `…${token.slice(-4)}`, probe.acting_as, probe.acting_uid, JSON.stringify(probe.projects), probe.scopes ? JSON.stringify(probe.scopes) : null]
  );
  return { id: res.insertId, connections: await connectionsOf(user.id) };
}

/** Rename, or replace the token (checked like a new one). */
export async function updateConnection(user, id, body) {
  const row = await ownConnection(user, id);
  if (body?.label !== undefined) {
    const label = clip(body.label, 80);
    if (!label) throw new HttpError("Give the connection a name.", 400);
    await execute("UPDATE pms_connections SET label = ? WHERE id = ?", [label, row.id]);
  }
  if (body?.token !== undefined && String(body.token).trim()) {
    const token = readToken(body.token);
    const probe = await probeToken({ token, base_url: row.base_url });
    await execute(
      "UPDATE pms_connections SET token_enc = ?, token_hint = ?, acting_as = ?, acting_uid = ?, projects = ?, scopes = ?, status = 'ok', last_error = NULL, checked_at = NOW() WHERE id = ?",
      [encryptSecret(token), `…${token.slice(-4)}`, probe.acting_as, probe.acting_uid, JSON.stringify(probe.projects), probe.scopes ? JSON.stringify(probe.scopes) : null, row.id]
    );
  }
  return connectionsOf(user.id);
}

/** Ask PMS again what the token reaches; a refusal is kept on the row for the page to show. */
export async function checkConnection(user, id) {
  const row = await ownConnection(user, id);
  try {
    const probe = await probeToken(row);
    await execute("UPDATE pms_connections SET acting_as = ?, acting_uid = ?, projects = ?, scopes = ?, status = 'ok', last_error = NULL, checked_at = NOW() WHERE id = ?", [probe.acting_as, probe.acting_uid, JSON.stringify(probe.projects), probe.scopes ? JSON.stringify(probe.scopes) : null, row.id]);
  } catch (e) {
    if (!(e instanceof PmsError)) throw e;
    await execute("UPDATE pms_connections SET status = 'error', last_error = ?, checked_at = NOW() WHERE id = ?", [e.message.slice(0, 255), row.id]);
  }
  return connectionsOf(user.id);
}

/** Forget the token here. It stays valid in PMS until it is revoked there. */
export async function removeConnection(user, id) {
  const row = await ownConnection(user, id);
  await execute("DELETE FROM pms_project_map WHERE user_id = ? AND connection_id = ?", [user.id, row.id]);
  await execute("DELETE FROM pms_connections WHERE id = ?", [row.id]);
  return connectionsOf(user.id);
}

/* ---------- a person's own defaults ---------- */

export async function prefsOf(userId) {
  const row = await queryOne("SELECT close_reason FROM pms_prefs WHERE user_id = ?", [userId]);
  return { close_reason: row?.close_reason ?? null };
}
/** { close_reason }: empty means the built-in "Done in Task Portal." (or its Chinese for tasks written in Chinese). */
export async function setPrefs(user, body) {
  const reason = String(body?.close_reason ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || null;
  await execute("INSERT INTO pms_prefs (user_id, close_reason) VALUES (?, ?) AS new ON DUPLICATE KEY UPDATE close_reason = new.close_reason", [user.id, reason]);
  return prefsOf(user.id);
}

/* ---------- which PMS project each project goes to (per person, for the open workspace) ---------- */

export const mapsOf = (user) =>
  query(
    `SELECT p.id AS project_id, p.name, p.code, p.color, p.status, m.connection_id, m.pms_project
     FROM projects p LEFT JOIN pms_project_map m ON m.project_id = p.id AND m.user_id = ?
     WHERE p.profile_id = ? ORDER BY p.name`,
    [user.id, user.profile_id]
  );

export async function setMap(user, body) {
  const project = await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [Number(body?.project_id) || 0, user.profile_id]);
  if (!project) throw new HttpError("Project not found.", 404);
  const key = String(body?.pms_project ?? "").trim().toUpperCase();
  if (!key) {
    await execute("DELETE FROM pms_project_map WHERE user_id = ? AND project_id = ?", [user.id, project.id]);
    return mapsOf(user);
  }
  const conn = await ownConnection(user, body?.connection_id);
  const known = json(conn.projects) ?? [];
  if (known.length ? !known.some((p) => p.key === key) : !PROJECT_KEY_RE.test(key)) throw new HttpError(`The connection “${conn.label}” does not reach ${key}.`, 400);
  await execute(
    "INSERT INTO pms_project_map (user_id, project_id, connection_id, pms_project) VALUES (?, ?, ?, ?) AS new ON DUPLICATE KEY UPDATE connection_id = new.connection_id, pms_project = new.pms_project",
    [user.id, project.id, conn.id, key]
  );
  return mapsOf(user);
}

const reaches = (c, project) => (json(c.projects) ?? []).some((p) => p.key === project);
/** The connection to use for a PMS project: the one chosen for the task's project if it reaches it, else any that does. */
function pickConnection(conns, project, preferId) {
  return conns.find((c) => c.id === preferId && (reaches(c, project) || !(json(c.projects) ?? []).length)) ?? conns.find((c) => reaches(c, project)) ?? null;
}
const projectMap = (user, projectId) => (projectId ? queryOne("SELECT connection_id, pms_project FROM pms_project_map WHERE user_id = ? AND project_id = ?", [user.id, projectId]) : null);

/** Where a task's things go: { conn, project } or { error }. A linked ticket decides the project; else the task's project. */
async function targetOf(user, task, link) {
  const conns = await query("SELECT * FROM pms_connections WHERE user_id = ? ORDER BY id", [user.id]);
  if (!conns.length) return { error: "Connect Bitara PMS first: Integrations, in the account menu." };
  const map = await projectMap(user, task.project_id);
  const project = link?.pms_project ?? map?.pms_project ?? null;
  if (!project) return { error: task.project_id ? "This task's project does not go to a Bitara PMS project yet. Choose one on the Integrations page, or link an existing ticket." : "This task has no project. Give it one that goes to Bitara PMS, or link an existing ticket." };
  const conn = pickConnection(conns, project, map?.connection_id);
  if (!conn) return { error: `None of your Bitara PMS connections reaches ${project}.`, project };
  return { conn, project };
}

/* ---------- the task picker ---------- */

/** Tasks of the open workspace that can go somewhere: in a project that has a PMS project, or already linked. */
export async function pickList(user, { q = "", projectId = null } = {}) {
  const maps = await query("SELECT m.project_id, m.pms_project, m.connection_id FROM pms_project_map m JOIN projects p ON p.id = m.project_id AND p.profile_id = ? WHERE m.user_id = ?", [user.profile_id, user.id]);
  const where = ["t.profile_id = ?"];
  const args = [user.profile_id];
  if (maps.length) {
    where.push("(l.task_id IS NOT NULL OR t.project_id IN (?))");
    args.push(maps.map((m) => m.project_id));
  } else where.push("l.task_id IS NOT NULL");
  const text = String(q ?? "").trim().slice(0, 100);
  if (text) {
    where.push("t.title LIKE ?");
    args.push(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (projectId) {
    where.push("t.project_id = ?");
    args.push(Number(projectId));
  }
  const rows = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.project_id, p.name AS project_name, p.color AS project_color, t.updated_at,
       l.pms_project AS linked_project, l.ticket_key, l.ticket_status
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN pms_links l ON l.task_id = t.id
     WHERE ${where.join(" AND ")} ORDER BY t.updated_at DESC, t.id DESC LIMIT 500`,
    args
  );
  const byProject = new Map(maps.map((m) => [m.project_id, m.pms_project]));
  const { n } = await queryOne("SELECT COUNT(*) AS n FROM pms_connections WHERE user_id = ?", [user.id]);
  return {
    connected: Number(n) > 0,
    can_send: can(user, "editor"),
    maps,
    tasks: rows.map(({ linked_project, ...r }) => ({ ...r, pms_project: linked_project ?? byProject.get(r.project_id) ?? null })),
  };
}

/* ---------- one task: what there is, and what was sent ---------- */

async function loadTask(user, taskId) {
  const task = await queryOne(
    `SELECT t.id, t.title, t.description, t.status, t.priority, t.start_date, t.due_date, t.estimate_hours, t.tags, t.project_id, p.name AS project_name, t.updated_at
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND t.profile_id = ?`,
    [taskId, user.profile_id]
  );
  if (!task) throw new HttpError("Task not found.", 404);
  return task;
}
async function partsOf(user, taskId) {
  const [outputs, comments, checklist, files, time] = await Promise.all([
    query("SELECT id, title, content, format, updated_at FROM task_outputs WHERE task_id = ? ORDER BY sort_order, id", [taskId]),
    listComments(taskId),
    query("SELECT id, title, done FROM task_checklist WHERE task_id = ? ORDER BY sort_order, id", [taskId]),
    listAttachments("task", taskId),
    // only my own, finished entries: PMS logs time as the token's owner and nobody else
    query("SELECT id, minutes, spent_on, note, began_at FROM time_entries WHERE task_id = ? AND user_id = ? AND started_at IS NULL AND minutes > 0 ORDER BY spent_on, id", [taskId, user.id]),
  ]);
  return { outputs, comments, checklist, files, time };
}
async function sentRows(taskId, ticketKey) {
  if (!ticketKey) return new Map();
  const rows = await query("SELECT kind, item_id, hash, remote_id, meta, updated_at FROM pms_sent WHERE task_id = ? AND ticket_key = ?", [taskId, ticketKey]);
  return new Map(rows.map((r) => [`${r.kind}:${r.item_id}`, { ...r, meta: json(r.meta) }]));
}
const stateOf = (sent, kind, id, hash) => {
  const r = sent.get(`${kind}:${id}`);
  return !r ? "new" : r.hash === hash ? "sent" : "changed";
};
const shapeLink = (l) =>
  l ? { pms_project: l.pms_project, ticket_key: l.ticket_key || null, created_here: Boolean(l.created_here), ticket_title: l.ticket_title, ticket_status: l.ticket_status, ticket_url: l.ticket_url, status_at: l.status_at, claimed_as: l.claimed_as ?? null, created_at: l.created_at } : null;
export const linkOf = async (taskId) => shapeLink(await queryOne("SELECT * FROM pms_links WHERE task_id = ?", [taskId]));

/** What the task page shows: the linked ticket and whether this person can send anything. Never calls PMS. */
export async function briefOf(user, taskId) {
  await loadTask(user, taskId);
  const [link, conns] = await Promise.all([queryOne("SELECT * FROM pms_links WHERE task_id = ?", [taskId]), queryOne("SELECT COUNT(*) AS n FROM pms_connections WHERE user_id = ?", [user.id])]);
  return { link: shapeLink(link), connected: Number(conns?.n) > 0, can_send: can(user, "editor") };
}

/** Everything the send dialog shows for a task, each part marked new / changed / sent. Never calls PMS. */
export async function planTask(user, taskId) {
  const task = await loadTask(user, taskId);
  const link = await queryOne("SELECT * FROM pms_links WHERE task_id = ?", [taskId]);
  const [target, parts, sent, conns, prefs] = await Promise.all([targetOf(user, task, link), partsOf(user, taskId), sentRows(taskId, link?.ticket_key), connectionsOf(user.id), prefsOf(user.id)]);
  const ticketSent = sent.get(`ticket:${taskId}`);
  const conn = target.conn ? conns.find((c) => c.id === target.conn.id) : null;
  return {
    task: { id: task.id, title: task.title, status: task.status, priority: task.priority, project_id: task.project_id, project_name: task.project_name, start_date: task.start_date, due_date: task.due_date, estimate_hours: task.estimate_hours, tags: task.tags, has_description: Boolean(String(task.description ?? "").trim()) },
    link: shapeLink(link),
    target: target.project && conn ? { pms_project: target.project, connection_id: conn.id, connection: conn.label, mode: conn.projects.find((p) => p.key === target.project)?.mode ?? null } : null,
    target_error: target.error ?? null,
    connected: conns.length > 0,
    can_send: can(user, "editor"),
    lang: guessLang(task.title, task.description),
    close_reason: prefs.close_reason,
    ticket: { state: !link ? "none" : !link.ticket_key ? "unknown" : !link.created_here ? "linked" : stateOf(sent, "ticket", taskId, itemHash.ticket(task)), checklist_in_description: Boolean(ticketSent?.meta?.checklist) },
    checklist: { total: parts.checklist.length, done: parts.checklist.filter((i) => Number(i.done)).length, state: parts.checklist.length ? stateOf(sent, "checklist", taskId, itemHash.checklist(parts.checklist)) : "none" },
    outputs: parts.outputs.map((o) => ({ id: o.id, title: o.title, chars: String(o.content ?? "").length, state: stateOf(sent, "output", o.id, itemHash.output(o)) })),
    comments: parts.comments.map((c) => ({ id: c.id, author_name: c.author_name, created_at: c.created_at, mine: c.user_id === user.id, snippet: displayMentions(c.body).replace(/\s+/g, " ").slice(0, 160), state: stateOf(sent, "comment", c.id, itemHash.comment(c)) })),
    files: parts.files.map((f) => ({ id: f.id, name: f.original_name, size: Number(f.size_bytes), mime: f.mime_type, state: stateOf(sent, "file", f.id, itemHash.file(f)) })),
    time: parts.time.map((e) => {
      const s = sent.get(`time:${e.id}`);
      return { id: e.id, minutes: Number(e.minutes), spent_on: day(e.spent_on), note: e.note, began_at: e.began_at, state: stateOf(sent, "time", e.id, itemHash.time(e)), sent_start: s?.meta?.startedAt ?? null, remote: Boolean(s?.remote_id) };
    }),
  };
}

/* ---------- sending ---------- */

const BUSY = globalThis.__pmsBusy ?? (globalThis.__pmsBusy = new Set());

/** A stable name for this installation, so a worklog's externalRef from here never collides with another portal's. */
async function instanceId() {
  if (globalThis.__pmsInstance) return globalThis.__pmsInstance;
  await execute("INSERT IGNORE INTO app_settings (name, value) VALUES ('pms', JSON_OBJECT('instance', ?))", [crypto.randomBytes(6).toString("hex")]);
  const row = await queryOne("SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.instance')) AS id FROM app_settings WHERE name = 'pms'");
  globalThis.__pmsInstance = row?.id || "portal";
  return globalThis.__pmsInstance;
}

/** The PMS uid of the connection's owner, asked for once when an older connection does not know it yet. */
async function uidFor(conn) {
  if (conn.acting_uid) return conn.acting_uid;
  const probe = await probeToken(conn).catch(() => null);
  if (!probe?.acting_uid) return null;
  await execute("UPDATE pms_connections SET acting_uid = ? WHERE id = ?", [probe.acting_uid, conn.id]);
  return probe.acting_uid;
}
/** Which ticket field holds a slot, for when the claim call itself is refused. */
const SLOT_FIELD = { owner: "assigneeUid", dev: "devAssigneeUid", test: "testAssigneeUid" };

async function remember(user, taskId, key, kind, itemId, hash, { remote = null, meta = null } = {}) {
  await execute(
    `INSERT INTO pms_sent (task_id, ticket_key, kind, item_id, remote_id, hash, meta, sent_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     AS new ON DUPLICATE KEY UPDATE remote_id = COALESCE(new.remote_id, pms_sent.remote_id), hash = new.hash, meta = COALESCE(new.meta, pms_sent.meta), sent_by = new.sent_by`,
    [taskId, key, kind, itemId, remote, hash, meta ? JSON.stringify(meta) : null, user.id]
  );
}
async function saveLink(user, taskId, project, key, ticket, createdHere) {
  await execute(
    `INSERT INTO pms_links (task_id, pms_project, ticket_key, created_here, ticket_title, ticket_status, ticket_url, status_at, linked_by) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
     AS new ON DUPLICATE KEY UPDATE pms_project = new.pms_project, ticket_key = new.ticket_key, created_here = new.created_here, ticket_title = new.ticket_title, ticket_status = new.ticket_status, ticket_url = new.ticket_url, status_at = NOW(), linked_by = new.linked_by`,
    [taskId, project, key, createdHere ? 1 : 0, ticket?.title?.slice(0, 300) ?? null, ticket?.status?.slice(0, 40) ?? null, ticket?.url ?? null, user.id]
  );
}

/**
 * Send what was picked from one task, or (dry_run) say exactly what would be sent. body:
 *   ticket   { mode: "create", category, lang, include_checklist, estimate } | { mode: "link", key } | { mode: "update", include_checklist }
 *   outputs, comments, files: [ids]      checklist: true → the checklist as a comment
 *   time: [{ id, started_at }]  kind     internal: comments hidden from a PMS reporter    lang: words we add
 *   claim: "owner" | "dev" | "test" → take that slot of the ticket (a new one, or the linked one)
 *   close: { reason } → close the ticket once everything else went (PMS allows it only in projects set to FULL)
 * Answers { dry_run, link, results: [{ op, label, ok, error?, text?, … }] }. Steps after a failed ticket step are
 * skipped; other failures do not stop the rest.
 */
export async function sendTask(user, taskId, body = {}) {
  if (!can(user, "editor")) throw new HttpError("You have view-only access to this shared profile.", 403);
  const dry = Boolean(body.dry_run);
  const task = await loadTask(user, taskId);
  const link = await queryOne("SELECT * FROM pms_links WHERE task_id = ?", [taskId]);
  const parts = await partsOf(user, taskId);
  const wanted = (list, ids) => {
    const want = new Set((Array.isArray(ids) ? ids : []).map(Number));
    return list.filter((x) => want.has(Number(x.id)));
  };
  const outputs = wanted(parts.outputs, body.outputs);
  const comments = wanted(parts.comments, body.comments);
  const files = wanted(parts.files, body.files);
  const timeAsk = new Map((Array.isArray(body.time) ? body.time : []).map((t) => [Number(t?.id), t]));
  const time = parts.time.filter((e) => timeAsk.has(Number(e.id)));
  const kind = PMS_WORK_KINDS.includes(body.kind) ? body.kind : "DEV";
  const internal = Boolean(body.internal);
  const t = body.ticket && typeof body.ticket === "object" ? body.ticket : null;
  const mode = t?.mode ?? null;
  if (mode && !["create", "link", "update"].includes(mode)) throw new HttpError("Unknown ticket choice.", 400);
  const lang = PMS_LANGS[body.lang] ? body.lang : PMS_LANGS[t?.lang] ? t.lang : guessLang(task.title, task.description);
  const claim = ["owner", "dev", "test"].includes(body.claim) ? body.claim : null;
  const close = body.close && typeof body.close === "object" ? { reason: String(body.close.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 500) } : null;
  if (close && !close.reason) throw new HttpError("Give a reason for closing the ticket: Bitara PMS asks for one.", 400);

  // where it goes
  let conn;
  let project;
  let key = link?.ticket_key || null;
  if (link && !link.ticket_key && mode !== "link") throw new HttpError("Bitara PMS made a ticket for this task earlier, but its answer had no ticket key Task Portal could read. Link the ticket by its key.", 409);
  if (mode === "create" && key) throw new HttpError(`This task already has a ticket (${key}).`, 409);
  if (mode === "update" && !(key && link.created_here)) throw new HttpError("Only a ticket raised from Task Portal can be updated from here.", 400);
  if (mode === "link") {
    const want = String(t.key ?? "").trim().toUpperCase();
    if (!TICKET_KEY_RE.test(want)) throw new HttpError("Enter a ticket key like BITWINEXV2-12.", 400);
    if (key && key !== want) throw new HttpError(`This task is linked to ${key}. Unlink it first.`, 409);
    project = projectOfKey(want);
    const conns = await query("SELECT * FROM pms_connections WHERE user_id = ? ORDER BY id", [user.id]);
    if (!conns.length) throw new HttpError("Connect Bitara PMS first: Integrations, in the account menu.", 400);
    conn = pickConnection(conns, project, (await projectMap(user, task.project_id))?.connection_id);
    if (!conn) throw new HttpError(`None of your Bitara PMS connections reaches ${project}.`, 400);
    key = want;
  } else {
    const target = await targetOf(user, task, link);
    if (target.error) throw new HttpError(target.error, 400);
    ({ conn, project } = target);
    if (!key && mode !== "create") throw new HttpError("Choose a ticket first: raise a new one or link an existing one.", 400);
  }
  const sent = await sentRows(taskId, key);

  // worklogs need a real start: the timer's, or the one the person gave
  const timeRows = [];
  for (const e of time) {
    const startedAt = String(timeAsk.get(Number(e.id))?.started_at ?? "").trim();
    if (!ISO_WITH_OFFSET.test(startedAt) || Number.isNaN(Date.parse(startedAt))) throw new HttpError(`Give the time entry of ${day(e.spent_on)} a start time.`, 400);
    if (Date.parse(startedAt) + Number(e.minutes) * 60_000 > Date.now() + 60_000) throw new HttpError(`The time entry of ${day(e.spent_on)} would end in the future, which Bitara PMS refuses. Check its start time.`, 400);
    timeRows.push({ e, startedAt, prev: sent.get(`time:${e.id}`) });
  }

  const origin = lastOrigin();
  const taskLink = origin ? `${origin}/tasks/${task.id}` : null;
  const steps = []; // { op, label, preview fields…, run: async () => extra }
  const ticketDone = { key };

  if (mode === "create") {
    const category = PMS_CATEGORIES.includes(t.category) ? t.category : "FEATURE";
    const includeChecklist = t.include_checklist !== false && parts.checklist.length > 0;
    const fields = ticketFields(task, { checklist: parts.checklist, includeChecklist, lang, link: taskLink, withEstimate: t.estimate !== false });
    const payload = { ...fields, category, lang };
    steps.push({
      op: "ticket.create", label: `Raise a ticket in ${project}`, project, title: fields.title, text: fields.description, fields: { priority: fields.priority, category, lang, dueAt: fields.dueAt ?? null, estimateMinutes: fields.estimateMinutes ?? null },
      run: async () => {
        let res;
        let note = null;
        try {
          res = await pmsFetch(conn, "POST", `/projects/${project}/tickets`, { json: payload });
        } catch (e) {
          // 422 = nothing was made; the optional fields are the likeliest cause, so try once without them
          if (!(e instanceof PmsError) || e.pmsStatus !== 422 || (payload.dueAt == null && payload.estimateMinutes == null)) throw e;
          const { dueAt, estimateMinutes, ...plain } = payload;
          res = await pmsFetch(conn, "POST", `/projects/${project}/tickets`, { json: plain });
          note = `Bitara PMS did not take ${[dueAt != null ? "the due date" : null, estimateMinutes != null ? "the estimate" : null].filter(Boolean).join(" or ")}, so the ticket was raised without ${dueAt != null && estimateMinutes != null ? "them" : "it"}.`;
        }
        const newKey = findTicketKey(res, project);
        const ticket = ticketOf(res);
        await saveLink(user, taskId, project, newKey ?? "", { ...ticket, title: ticket.title ?? fields.title, status: ticket.status ?? "OPEN" }, true);
        if (!newKey) throw new HttpError("Bitara PMS raised the ticket, but its answer had no ticket key Task Portal could read. Find it in Bitara PMS and link it here by its key.", 502);
        ticketDone.key = newKey;
        await remember(user, taskId, newKey, "ticket", taskId, itemHash.ticket(task), { meta: { title: remoteHash(fields.title), description: remoteHash(fields.description), priority: fields.priority, dueAt: fields.dueAt ?? null, checklist: includeChecklist } });
        if (includeChecklist) await remember(user, taskId, newKey, "checklist", taskId, itemHash.checklist(parts.checklist));
        return { key: newKey, note };
      },
    });
  } else if (mode === "link") {
    let found = null;
    if (dry) found = await pmsFetch(conn, "GET", `/tickets/${encodeURIComponent(key)}`).then(ticketOf).catch((e) => ({ error: e.message }));
    steps.push({
      op: "ticket.link", label: `Link to ${key}`, key, title: found?.title ?? null, status: found?.status ?? null, error: found?.error,
      run: async () => {
        const ticket = ticketOf(await pmsFetch(conn, "GET", `/tickets/${encodeURIComponent(key)}`));
        await saveLink(user, taskId, project, key, ticket, false);
        return { key };
      },
    });
  } else if (mode === "update") {
    const prev = sent.get(`ticket:${taskId}`)?.meta ?? {};
    const includeChecklist = t.include_checklist ?? Boolean(prev.checklist);
    const fields = ticketFields(task, { checklist: parts.checklist, includeChecklist: includeChecklist && parts.checklist.length > 0, lang, link: taskLink });
    const patch = {};
    if (remoteHash(fields.title) !== prev.title) patch.title = fields.title;
    if (remoteHash(fields.description) !== prev.description) patch.description = fields.description;
    if (fields.priority !== prev.priority) patch.priority = fields.priority;
    if ((fields.dueAt ?? null) !== (prev.dueAt ?? null) && fields.dueAt) patch.dueAt = fields.dueAt;
    const changed = Object.keys(patch);
    if (changed.length) {
      steps.push({
        op: "ticket.update", label: `Update ${key}: ${changed.join(", ")}`, key, changed, title: patch.title ?? null, text: patch.description ?? null, fields: { ...patch, description: undefined, title: undefined },
        run: async () => {
          // never overwrite what somebody changed in PMS since we wrote it
          const now = ticketOf(await pmsFetch(conn, "GET", `/tickets/${encodeURIComponent(key)}`));
          if ((patch.title && now.title != null && remoteHash(now.title) !== prev.title) || (patch.description && (now.description == null || remoteHash(now.description) !== prev.description))) {
            throw new HttpError(now.description == null && patch.description ? "Could not read the ticket's description from Bitara PMS, so it was not overwritten." : `${key} was edited in Bitara PMS since you sent it, so it was not overwritten. Send the changes as a comment instead.`, 409);
          }
          await pmsFetch(conn, "PATCH", `/tickets/${encodeURIComponent(key)}`, { json: patch });
          await remember(user, taskId, key, "ticket", taskId, itemHash.ticket(task), { meta: { ...prev, title: remoteHash(fields.title), description: remoteHash(fields.description), priority: fields.priority, dueAt: fields.dueAt ?? null, checklist: includeChecklist } });
          if (includeChecklist && parts.checklist.length) await remember(user, taskId, key, "checklist", taskId, itemHash.checklist(parts.checklist));
          return {};
        },
      });
    } else {
      steps.push({ op: "ticket.update", label: `${key} already shows the task as it is`, key, changed: [], skip: true, run: async () => ({}) });
    }
  }

  if (claim) {
    if (key && mode !== "link" && link?.claimed_as === claim) {
      steps.push({ op: "ticket.claim", role: claim, key, label: `${key} is claimed as ${claim} already`, skip: true, run: async () => ({}) });
    } else {
      steps.push({
        op: "ticket.claim", role: claim, key: mode === "create" ? null : key, label: `Claim ${mode === "create" ? "the new ticket" : key} as ${claim}`,
        run: async () => {
          const k = ticketDone.key;
          let note = null;
          try {
            await pmsFetch(conn, "POST", `/tickets/${encodeURIComponent(k)}/claim`, { json: { role: claim } });
          } catch (e) {
            if (e instanceof PmsError && e.pmsStatus === 409) throw new HttpError(`The ${claim} slot of ${k} is taken already (by you or somebody else).`, 409);
            // the claim call needs the tickets:claim scope; putting yourself in the slot is the same thing through tickets:write
            if (!(e instanceof PmsError) || ![403, 404, 422].includes(e.pmsStatus)) throw e;
            const uid = await uidFor(conn);
            if (!uid) throw e;
            await pmsFetch(conn, "PATCH", `/tickets/${encodeURIComponent(k)}`, { json: { [SLOT_FIELD[claim]]: uid } });
            note = "Bitara PMS refused the claim call for this token, so you were put in the slot by editing the ticket instead.";
          }
          await execute("UPDATE pms_links SET claimed_as = ? WHERE task_id = ?", [claim, taskId]);
          return { key: k, note };
        },
      });
    }
  }

  const comment = (what, itemId, text, hash, label, extra = {}) =>
    steps.push({
      op: "comment", what, item_id: itemId, label, text, internal, ...extra,
      run: async () => {
        await pmsFetch(conn, "POST", `/tickets/${encodeURIComponent(ticketDone.key)}/comments`, { json: { body: text, isInternal: internal } });
        await remember(user, taskId, ticketDone.key, what, itemId, hash);
        return {};
      },
    });
  if (body.checklist && parts.checklist.length) comment("checklist", taskId, checklistComment(parts.checklist, { lang }), itemHash.checklist(parts.checklist), "Comment: the checklist", { again: sent.has(`checklist:${taskId}`) });
  for (const o of outputs) comment("output", o.id, outputComment(o, { lang, updated: sent.has(`output:${o.id}`) }), itemHash.output(o), `Comment: output “${clip(o.title, 80) || "untitled"}”`, { name: clip(o.title, 80), again: sent.has(`output:${o.id}`) });
  for (const c of comments) comment("comment", c.id, commentComment(c, { lang }), itemHash.comment(c), `Comment: ${clip(c.author_name, 60)}, ${day(c.created_at)}`, { name: clip(c.author_name, 60), date: day(c.created_at), again: sent.has(`comment:${c.id}`) });

  if (files.length) {
    let limits = null;
    for (const f of files) {
      steps.push({
        op: "file", item_id: f.id, label: `Attach “${clip(f.original_name, 80)}”`, name: f.original_name, size: Number(f.size_bytes), mime: f.mime_type, again: sent.has(`file:${f.id}`),
        run: async () => {
          limits ??= await pmsFetch(conn, "GET", "/attachments/meta").then(uploadLimitsIn).catch(() => ({}));
          if (limits.maxBytes && Number(f.size_bytes) > limits.maxBytes) throw new HttpError(`Too large for Bitara PMS (it takes up to ${Math.floor(limits.maxBytes / 1048576)} MB a file).`, 413);
          const form = new FormData();
          form.append("files", new Blob([await readStoredFile(f.stored_name)], { type: f.mime_type || "application/octet-stream" }), f.original_name);
          await pmsFetch(conn, "POST", `/tickets/${encodeURIComponent(ticketDone.key)}/attachments`, { form });
          await remember(user, taskId, ticketDone.key, "file", f.id, itemHash.file(f));
          return {};
        },
      });
    }
  }

  if (timeRows.length) {
    const instance = await instanceId();
    const ref = (e) => `taskportal-${instance}-time-${e.id}`;
    const fresh = timeRows.filter((r) => !r.prev || !r.prev.remote_id);
    const known = timeRows.filter((r) => r.prev?.remote_id);
    for (let i = 0; i < fresh.length; i += 50) {
      const chunk = fresh.slice(i, i + 50);
      const entries = chunk.map((r) => worklogEntry(r.e, { kind, ticketKey: ticketDone.key ?? "", startedAt: r.startedAt, taskTitle: task.title, ref: ref(r.e) }));
      const minutes = chunk.reduce((n, r) => n + Number(r.e.minutes), 0);
      steps.push({
        op: "worklogs", label: `Log ${plural(chunk.length, "time entry", "time entries")} (${Math.floor(minutes / 60)}h ${minutes % 60}m) as ${kind}`, entries, count: chunk.length, minutes, kind,
        run: async () => {
          const list = entries.map((x) => ({ ...x, ticketKey: ticketDone.key }));
          const uids = worklogUids(await pmsFetch(conn, "POST", `/projects/${project}/worklogs/batch`, { json: { entries: list } }));
          for (const r of chunk) await remember(user, taskId, ticketDone.key, "time", r.e.id, itemHash.time(r.e), { remote: uids.get(ref(r.e)) ?? null, meta: { startedAt: r.startedAt, kind } });
          return {};
        },
      });
    }
    for (const r of known) {
      const same = r.prev.hash === itemHash.time(r.e) && r.prev.meta?.startedAt === r.startedAt && (r.prev.meta?.kind ?? kind) === kind;
      if (same) {
        steps.push({ op: "worklog.update", item_id: r.e.id, date: day(r.e.spent_on), label: `Time entry of ${day(r.e.spent_on)} is already in Bitara PMS as it is`, skip: true, run: async () => ({}) });
        continue;
      }
      const patch = { startedAt: r.startedAt, minutes: Number(r.e.minutes), kind, note: worklogEntry(r.e, { kind, startedAt: r.startedAt, taskTitle: task.title }).note };
      steps.push({
        op: "worklog.update", item_id: r.e.id, date: day(r.e.spent_on), label: `Correct the time entry of ${day(r.e.spent_on)} in Bitara PMS`, entries: [patch],
        run: async () => {
          await pmsFetch(conn, "PATCH", `/projects/${project}/worklogs/${encodeURIComponent(r.prev.remote_id)}`, { json: patch });
          await remember(user, taskId, ticketDone.key, "time", r.e.id, itemHash.time(r.e), { meta: { startedAt: r.startedAt, kind } });
          return {};
        },
      });
    }
  }

  // closing comes last, after what was picked has reached the ticket
  if (close) {
    if (key && mode !== "link" && link?.ticket_status === "CLOSED") {
      steps.push({ op: "ticket.close", key, reason: close.reason, label: `${key} is closed already`, skip: true, run: async () => ({}) });
    } else {
      steps.push({
        op: "ticket.close", key: mode === "create" ? null : key, reason: close.reason, label: `Close ${mode === "create" ? "the new ticket" : key}`,
        run: async () => {
          const k = ticketDone.key;
          try {
            await pmsFetch(conn, "POST", `/tickets/${encodeURIComponent(k)}/transition`, { json: { action: "close", reason: close.reason } });
          } catch (e) {
            if (e instanceof PmsError && e.pmsStatus === 403) throw new HttpError(`Bitara PMS refused to close ${k} with your token${e.info?.title ? ` (${e.info.title})` : ""}. While ${project} lets tokens only suggest, a person closes tickets in Bitara PMS itself.`, 403);
            if (e instanceof PmsError && e.pmsStatus === 422) throw new HttpError(`Bitara PMS cannot close ${k} from the status it is in${e.info?.allowed?.length ? ` (it allows: ${e.info.allowed.join(", ")})` : ""}.`, 422);
            throw e;
          }
          await execute("UPDATE pms_links SET ticket_status = 'CLOSED', status_at = NOW() WHERE task_id = ?", [taskId]);
          return { key: k };
        },
      });
    }
  }

  const view = (s) => {
    const { run: _run, ...rest } = s;
    return rest;
  };
  const target = { pms_project: project, ticket_key: key, connection: conn.label };
  if (dry) return { dry_run: true, target, link: shapeLink(link), results: steps.map(view) };
  if (!steps.some((s) => !s.skip)) throw new HttpError("Nothing to send: pick something first.", 400);

  if (BUSY.has(taskId)) throw new HttpError("This task is being sent already.", 409);
  BUSY.add(taskId);
  const results = [];
  try {
    let blocked = null;
    for (const s of steps) {
      if (s.skip) {
        results.push({ ...view(s), ok: true });
        continue;
      }
      if (blocked) {
        results.push({ ...view(s), ok: false, error: blocked });
        continue;
      }
      try {
        const extra = await s.run();
        results.push({ ...view(s), ok: true, ...extra });
      } catch (e) {
        if (!(e instanceof HttpError)) console.error("[pms]", e);
        const error = e instanceof HttpError ? e.message : `Unexpected error: ${e?.message ?? e}`;
        results.push({ ...view(s), ok: false, error });
        if (s.op === "ticket.create" || s.op === "ticket.link") blocked = "Skipped: there is no ticket to send it to.";
      }
    }
    // the ticket's status as PMS has it now
    if (ticketDone.key) {
      const now = await pmsFetch(conn, "GET", `/tickets/${encodeURIComponent(ticketDone.key)}`).then(ticketOf).catch(() => null);
      if (now) await execute("UPDATE pms_links SET ticket_title = COALESCE(?, ticket_title), ticket_status = COALESCE(?, ticket_status), ticket_url = COALESCE(?, ticket_url), status_at = NOW() WHERE task_id = ?", [now.title?.slice(0, 300) ?? null, now.status?.slice(0, 40) ?? null, now.url, taskId]);
    }
  } finally {
    BUSY.delete(taskId);
  }
  const done = results.filter((r) => r.ok && !r.skip);
  if (done.length) {
    // "KEY|raised,comments:2,files:1,time:3": the task page words it in the reader's language
    const count = (op) => done.filter((r) => r.op === op).length;
    const timeCount = done.filter((r) => r.op === "worklogs").reduce((n, r) => n + r.entries.length, 0) + count("worklog.update");
    const what = [
      count("ticket.create") ? "raised" : null,
      count("ticket.link") ? "linked" : null,
      count("ticket.update") ? "updated" : null,
      count("ticket.claim") ? `claimed:${done.find((r) => r.op === "ticket.claim").role}` : null,
      count("ticket.close") ? "closed" : null,
      count("comment") ? `comments:${count("comment")}` : null,
      count("file") ? `files:${count("file")}` : null,
      timeCount ? `time:${timeCount}` : null,
    ].filter(Boolean).join(",");
    await logTask(user, taskId, { action: "pms_sent", field: "pms", next: `${ticketDone.key ?? project}|${what}` });
  }
  return { dry_run: false, target: { ...target, ticket_key: ticketDone.key }, link: await linkOf(taskId), results };
}

/** Forget the ticket here (PMS keeps it). What was sent to it stays recorded, so linking it again picks up where it was. */
export async function unlinkTask(user, taskId) {
  if (!can(user, "editor")) throw new HttpError("You have view-only access to this shared profile.", 403);
  await loadTask(user, taskId);
  const link = await queryOne("SELECT ticket_key, pms_project FROM pms_links WHERE task_id = ?", [taskId]);
  if (!link) return null;
  await execute("DELETE FROM pms_links WHERE task_id = ?", [taskId]);
  await logTask(user, taskId, { action: "pms_unlinked", field: "pms", old: link.ticket_key || link.pms_project });
  return null;
}

/** The ticket's status as PMS has it now. */
export async function refreshTask(user, taskId) {
  const task = await loadTask(user, taskId);
  const link = await queryOne("SELECT * FROM pms_links WHERE task_id = ?", [taskId]);
  if (!link?.ticket_key) return shapeLink(link);
  const conns = await query("SELECT * FROM pms_connections WHERE user_id = ? ORDER BY id", [user.id]);
  const conn = pickConnection(conns, link.pms_project, (await projectMap(user, task.project_id))?.connection_id);
  if (!conn) throw new HttpError(`None of your Bitara PMS connections reaches ${link.pms_project}.`, 400);
  const now = ticketOf(await pmsFetch(conn, "GET", `/tickets/${encodeURIComponent(link.ticket_key)}`));
  await execute("UPDATE pms_links SET ticket_title = COALESCE(?, ticket_title), ticket_status = COALESCE(?, ticket_status), ticket_url = COALESCE(?, ticket_url), status_at = NOW() WHERE task_id = ?", [now.title?.slice(0, 300) ?? null, now.status?.slice(0, 40) ?? null, now.url, taskId]);
  return linkOf(taskId);
}

/** Tickets of a PMS project for the "link an existing ticket" search. */
export async function searchTickets(user, project, q) {
  const key = String(project ?? "").trim().toUpperCase();
  if (!PROJECT_KEY_RE.test(key)) throw new HttpError("Unknown Bitara PMS project.", 400);
  const conns = await query("SELECT * FROM pms_connections WHERE user_id = ? ORDER BY id", [user.id]);
  const conn = pickConnection(conns, key, null);
  if (!conn) throw new HttpError(`None of your Bitara PMS connections reaches ${key}.`, 400);
  const res = await pmsFetch(conn, "GET", `/projects/${key}/tickets`, { query: { q: String(q ?? "").trim().slice(0, 100), limit: 20 } });
  return ticketsIn(res).slice(0, 20);
}

/** Scheduler: links and send records whose task is gone for good (not just in the recycle bin), connections of deleted accounts. */
export async function sweepPms() {
  const gone = "NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = x.task_id) AND NOT EXISTS (SELECT 1 FROM trash b WHERE b.entity = 'task' AND b.entity_id = x.task_id)";
  const a = await execute(`DELETE x FROM pms_links x WHERE ${gone}`);
  const b = await execute(`DELETE x FROM pms_sent x WHERE ${gone}`);
  await execute("DELETE x FROM pms_connections x WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = x.user_id)");
  await execute("DELETE x FROM pms_prefs x WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = x.user_id)");
  await execute("DELETE x FROM pms_project_map x WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = x.user_id) OR (NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = x.project_id) AND NOT EXISTS (SELECT 1 FROM trash b WHERE b.entity = 'project' AND b.entity_id = x.project_id))");
  return (a.affectedRows ?? 0) + (b.affectedRows ?? 0);
}

