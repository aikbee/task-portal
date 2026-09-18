import { syncOwnerRows } from "./ownership";
import { query, queryOne, execute, withTransaction } from "./db";
import { HttpError } from "./http-error";
import { deleteStoredFile } from "./uploads";
import { ATTACHMENT_KINDS } from "./attachments";
import { repairLeads } from "./task-assignees";
import { logTask } from "./task-activity";

/**
 * The recycle bin. `moveToTrash` snapshots a record with everything attached to it, writes the snapshot to
 * `trash` and deletes the record for real (children go by foreign-key cascade), all in one transaction.
 * `restoreFromTrash` re-inserts the rows under their old ids (InnoDB never hands an id out twice) and re-points
 * the rows that used to reference the record. Files are only removed from disk when an entry is purged.
 */
export const TRASH_DAYS = Number(process.env.TRASH_DAYS || 30);

/**
 * children: rows that die with the record  { table, fk, files?, children?, links? }
 * links:    rows that survive but lose their reference (ON DELETE SET NULL)  { table, col }
 * nullableRefs / requiredRefs: what the record itself points at  { column: table }
 */
const REQUIREMENT_CHILDREN = [{ table: "requirement_attachments", fk: "requirement_id", files: true }];
const REQUIREMENT_LINKS = [{ table: "tasks", col: "requirement_id" }];
const SPECS = {
  task: {
    table: "tasks", label: "Task", title: (r) => r.title,
    nullableRefs: { project_id: "projects", employee_id: "employees", requirement_id: "requirements" },
    children: [
      { table: "task_assignees", fk: "task_id" }, { table: "task_checklist", fk: "task_id" }, { table: "task_comments", fk: "task_id" }, { table: "task_activity", fk: "task_id" },
      { table: "time_entries", fk: "task_id" }, { table: "task_outputs", fk: "task_id" }, { table: "task_attachments", fk: "task_id", files: true },
      { table: "task_dependencies", fk: "task_id", key: "waits_for" }, { table: "task_dependencies", fk: "depends_on_id", key: "needed_by" },
    ],
  },
  requirement: { table: "requirements", label: "Requirement", title: (r) => `${r.code} · ${r.title}`, requiredRefs: { project_id: "projects" }, nullableRefs: { employee_id: "employees" }, children: REQUIREMENT_CHILDREN, links: REQUIREMENT_LINKS },
  project: {
    table: "projects", label: "Project", title: (r) => r.name, detail: (r) => r.code,
    children: [{ table: "project_employees", fk: "project_id" }, { table: "requirements", fk: "project_id", children: REQUIREMENT_CHILDREN, links: REQUIREMENT_LINKS }],
    links: [{ table: "tasks", col: "project_id" }, { table: "info_items", col: "project_id" }, { table: "draw_boards", col: "project_id" }, { table: "calendar_events", col: "project_id" }],
  },
  employee: {
    table: "employees", label: "Employee", title: (r) => `${r.first_name} ${r.last_name}`, detail: (r) => r.email,
    children: [{ table: "project_employees", fk: "employee_id" }, { table: "task_assignees", fk: "employee_id" }],
    links: [{ table: "requirements", col: "employee_id" }, { table: "users", col: "employee_id", global: true }],
    after: (profileId) => repairLeads(profileId),
  },
  drawboard: { table: "draw_boards", label: "Draw board", title: (r) => r.title, nullableRefs: { project_id: "projects" }, children: [{ table: "draw_board_attachments", fk: "board_id", files: true }] },
  info: { table: "info_items", label: "Info", ownerOnly: true, title: (r) => r.title, detail: (r) => r.category, nullableRefs: { project_id: "projects" }, children: [{ table: "info_notes", fk: "info_id" }, { table: "info_attachments", fk: "info_id", files: true }] },
  event: { table: "calendar_events", label: "Event", title: (r) => r.title, detail: (r) => r.start_date, nullableRefs: { project_id: "projects" } },
};
// single files: "task_attachment", "requirement_attachment", "info_attachment", "drawboard_attachment"
for (const [kind, meta] of Object.entries(ATTACHMENT_KINDS)) {
  SPECS[`${kind}_attachment`] = { table: meta.table, label: "File", title: (r) => r.original_name, ownFile: true, ownerOnly: kind === "info", parent: { table: meta.parentTable, fk: meta.parentCol }, requiredRefs: { [meta.parentCol]: meta.parentTable } };
}
export const TRASH_ENTITIES = Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, { label: v.label, ownerOnly: Boolean(v.ownerOnly) }]));

/** Rows exactly as they must go back in: dates as the strings MySQL wrote, JSON columns as text. */
async function rawRows(conn, sql, args) {
  const [rows] = await conn.query({ sql, values: args, dateStrings: true, typeCast: (field, next) => (field.type === "JSON" ? field.string("utf8") : next()) });
  return rows;
}
const rowId = (row) => row.id;

async function snapshotChildren(conn, defs = [], parentId) {
  const out = {};
  for (const def of defs) {
    const rows = await rawRows(conn, `SELECT * FROM \`${def.table}\` WHERE \`${def.fk}\` = ?`, [parentId]);
    out[def.key ?? def.table] = await Promise.all(rows.map(async (row) => ({ row, children: def.children ? await snapshotChildren(conn, def.children, rowId(row)) : undefined, links: def.links ? await snapshotLinks(conn, def.links, rowId(row)) : undefined })));
  }
  return out;
}
async function snapshotLinks(conn, defs = [], id) {
  const out = [];
  for (const def of defs) {
    const rows = await rawRows(conn, `SELECT id FROM \`${def.table}\` WHERE \`${def.col}\` = ?`, [id]);
    if (rows.length) out.push({ table: def.table, col: def.col, ids: rows.map((r) => r.id) });
  }
  return out;
}
function filesIn(defs = [], children = {}) {
  const names = [];
  for (const def of defs) for (const node of children[def.key ?? def.table] ?? []) {
    if (def.files && node.row.stored_name) names.push(node.row.stored_name);
    if (def.children) names.push(...filesIn(def.children, node.children));
  }
  return names;
}
const countRows = (children = {}) => Object.values(children).reduce((n, list) => n + list.length + list.reduce((m, node) => m + countRows(node.children), 0), 0);

/** Put a record in the bin. Throws 404 when it is not in the profile. Returns { trash_id, title }. */
export async function moveToTrash(user, entity, id) {
  const spec = SPECS[entity];
  if (!spec) throw new HttpError("This cannot go to the recycle bin.", 400);
  return withTransaction(async (conn) => {
    const owned = spec.parent
      ? await rawRows(conn, `SELECT a.* FROM \`${spec.table}\` a JOIN \`${spec.parent.table}\` p ON p.id = a.\`${spec.parent.fk}\` WHERE a.id = ? AND p.profile_id = ?`, [id, user.profile_id])
      : await rawRows(conn, `SELECT * FROM \`${spec.table}\` WHERE id = ? AND profile_id = ?`, [id, user.profile_id]);
    const row = owned[0];
    if (!row) throw new HttpError(`${spec.label} not found.`, 404);
    const children = await snapshotChildren(conn, spec.children, id);
    const links = await snapshotLinks(conn, spec.links, id);
    const files = [...(spec.ownFile && row.stored_name ? [row.stored_name] : []), ...filesIn(spec.children, children)];
    let detail = spec.detail?.(row) ?? null;
    if (spec.parent) detail = (await rawRows(conn, `SELECT COALESCE(title, '') AS t FROM \`${spec.parent.table}\` WHERE id = ?`, [row[spec.parent.fk]]).catch(() => []))[0]?.t || detail;
    const extra = countRows(children);
    if (!spec.parent && extra) detail = [detail, `${extra} related ${extra === 1 ? "item" : "items"}`].filter(Boolean).join(" · ");
    const snapshot = JSON.stringify({ v: 1, entity, row, children, links, files });
    const [res] = await conn.execute(
      "INSERT INTO trash (profile_id, entity, entity_id, title, detail, deleted_by, deleted_by_name, purge_at, file_count, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)",
      [user.profile_id, entity, id, String(spec.title(row) ?? "").slice(0, 255) || spec.label, detail ? String(detail).slice(0, 255) : null, user.id, user.name, TRASH_DAYS, files.length, snapshot]
    );
    await conn.execute(`DELETE FROM \`${spec.table}\` WHERE id = ?`, [id]);
    return { trash_id: res.insertId, title: spec.title(row) };
  });
}

const columnCache = new Map();
async function columnsOf(conn, table) {
  if (!columnCache.has(table)) columnCache.set(table, new Set((await conn.query(`SHOW COLUMNS FROM \`${table}\``))[0].map((c) => c.Field)));
  return columnCache.get(table);
}
/** Insert a snapshot row, keeping only columns the table still has. `ignore` skips rows whose other parent is gone. */
async function insertRow(conn, table, row, { ignore = false } = {}) {
  const known = await columnsOf(conn, table);
  const cols = Object.keys(row).filter((c) => known.has(c));
  await conn.query(`INSERT ${ignore ? "IGNORE " : ""}INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c]));
}
const exists = async (conn, table, id) => id != null && Boolean((await conn.query(`SELECT 1 FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]))[0].length);
async function restoreChildren(conn, defs = [], children = {}, profileId) {
  for (const def of defs) for (const node of children[def.key ?? def.table] ?? []) {
    await insertRow(conn, def.table, node.row, { ignore: true });
    if (def.children) await restoreChildren(conn, def.children, node.children, profileId);
    await relink(conn, node.links, rowId(node.row), profileId);
  }
}
/** Rows that pointed at the record point at it again, unless they were given another target meanwhile. */
async function relink(conn, links = [], id, profileId) {
  for (const l of links ?? []) {
    if (!l.ids?.length) continue;
    const scoped = !SPECS_GLOBAL_LINK.has(`${l.table}.${l.col}`);
    await conn.query(`UPDATE \`${l.table}\` SET \`${l.col}\` = ? WHERE id IN (?) AND \`${l.col}\` IS NULL${scoped ? " AND profile_id = ?" : ""}`, scoped ? [id, l.ids, profileId] : [id, l.ids]);
  }
}
const SPECS_GLOBAL_LINK = new Set(Object.values(SPECS).flatMap((s) => (s.links ?? []).filter((l) => l.global).map((l) => `${l.table}.${l.col}`)));

export async function trashRow(user, trashId, { withSnapshot = false } = {}) {
  const row = await queryOne(`SELECT id, profile_id, entity, entity_id, title, detail, deleted_by, deleted_by_name, deleted_at, purge_at, file_count${withSnapshot ? ", snapshot" : ""} FROM trash WHERE id = ? AND profile_id = ?`, [trashId, user.profile_id]);
  if (!row || (SPECS[row.entity]?.ownerOnly && user.access !== "owner")) throw new HttpError("That is not in the recycle bin.", 404);
  return row;
}

/** Bring a record back. 409 when something it needs is gone or something took its place. */
export async function restoreFromTrash(user, trashId) {
  const item = await trashRow(user, trashId, { withSnapshot: true });
  const spec = SPECS[item.entity];
  const snap = JSON.parse(item.snapshot);
  const row = { ...snap.row };
  try {
    await withTransaction(async (conn) => {
      if (await exists(conn, spec.table, row.id)) throw new HttpError("A record with that id exists again; this entry cannot be restored.", 409);
      for (const [col, table] of Object.entries(spec.requiredRefs ?? {})) {
        if (!(await exists(conn, table, row[col]))) {
          const parent = await queryOne("SELECT title FROM trash WHERE profile_id = ? AND entity_id = ? AND entity IN (?) ORDER BY id DESC LIMIT 1", [item.profile_id, row[col], Object.keys(SPECS).filter((k) => SPECS[k].table === table)]);
          throw new HttpError(parent ? `Restore “${parent.title}” first: this belongs to it.` : "What this belonged to no longer exists, so it cannot be restored.", 409);
        }
      }
      for (const [col, table] of Object.entries(spec.nullableRefs ?? {})) if (row[col] != null && !(await exists(conn, table, row[col]))) row[col] = null;
      await insertRow(conn, spec.table, row);
      await restoreChildren(conn, spec.children, snap.children, item.profile_id);
      await relink(conn, snap.links, row.id, item.profile_id);
      await conn.execute("DELETE FROM trash WHERE id = ?", [item.id]);
    });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") throw new HttpError("Something with the same code or email exists now. Rename or remove it, then restore.", 409);
    throw e;
  }
  await spec.after?.(item.profile_id);
  await syncOwnerRows(item.profile_id).catch(() => {}); // the profile may have changed hands since the snapshot
  if (item.entity === "task") await logTask(user, row.id, { action: "restored" });
  return { entity: item.entity, id: row.id, title: item.title };
}

/** Delete entries for good, files included. `rows` need id and snapshot. */
async function destroy(rows) {
  for (const r of rows) {
    let files = [];
    try { files = JSON.parse(r.snapshot).files ?? []; } catch {}
    await Promise.all(files.map((name) => deleteStoredFile(name).catch(() => {})));
    await execute("DELETE FROM trash WHERE id = ?", [r.id]);
  }
  return rows.length;
}
export async function purgeOne(user, trashId) {
  return destroy([await trashRow(user, trashId, { withSnapshot: true })]);
}
export async function emptyTrash(user) {
  const rows = await query("SELECT id, entity, snapshot FROM trash WHERE profile_id = ?", [user.profile_id]);
  return destroy(rows.filter((r) => user.access === "owner" || !SPECS[r.entity]?.ownerOnly));
}
/** Cron: everything past its date, in every profile. */
export const purgeExpiredTrash = async () => destroy(await query("SELECT id, snapshot FROM trash WHERE purge_at < NOW() LIMIT 500"));
/** A whole profile (or account) is going: its bin goes too, files first (the rows follow by cascade). */
export async function purgeTrashOf(whereSql, args) {
  const rows = await query(`SELECT t.id, t.snapshot FROM trash t JOIN profiles p ON p.id = t.profile_id WHERE ${whereSql}`, args);
  return destroy(rows);
}

export async function listTrash(user) {
  const rows = await query(
    "SELECT id, entity, entity_id, title, detail, deleted_by, deleted_by_name, deleted_at, purge_at, file_count, GREATEST(0, DATEDIFF(purge_at, NOW())) AS days_left FROM trash WHERE profile_id = ? ORDER BY id DESC LIMIT 1000",
    [user.profile_id]
  );
  return rows.filter((r) => SPECS[r.entity] && (user.access === "owner" || !SPECS[r.entity].ownerOnly)).map((r) => ({ ...r, label: SPECS[r.entity].label }));
}
export const trashCount = async (user) => (await listTrash(user)).length;
