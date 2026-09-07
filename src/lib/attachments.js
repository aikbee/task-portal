import { query, queryOne } from "./db";
import { HttpError } from "./http-error";
import { deleteStoredFile } from "./uploads";

/** Attachment "kinds": which table holds them and which parent row owns them. */
export const ATTACHMENT_KINDS = {
  task: { table: "task_attachments", parentCol: "task_id", parentTable: "tasks", apiBase: "tasks" },
  requirement: { table: "requirement_attachments", parentCol: "requirement_id", parentTable: "requirements", apiBase: "requirements" },
  info: { table: "info_attachments", parentCol: "info_id", parentTable: "info_items", apiBase: "info" },
};

export function kindOf(kind) {
  const meta = ATTACHMENT_KINDS[kind];
  if (!meta) throw new HttpError("Unknown attachment kind.", 404);
  return meta;
}

/** Parent row scoped to the workspace owner (404 otherwise). */
export async function ownedParent(kind, owner, parentId) {
  const meta = kindOf(kind);
  const row = await queryOne(`SELECT id FROM ${meta.parentTable} WHERE id = ? AND profile_id = ?`, [parentId, owner]);
  if (!row) throw new HttpError(`${kind[0].toUpperCase()}${kind.slice(1)} not found.`, 404);
  return row;
}

export function listAttachments(kind, parentId) {
  const meta = kindOf(kind);
  return query(`SELECT * FROM ${meta.table} WHERE ${meta.parentCol} = ? ORDER BY sort_order, id`, [parentId]);
}

/** One attachment, verified to belong to the owner's workspace through its parent. */
export async function findAttachment(kind, id, owner) {
  const meta = kindOf(kind);
  const row = await queryOne(
    `SELECT a.*, a.${meta.parentCol} AS parent_id FROM ${meta.table} a JOIN ${meta.parentTable} p ON p.id = a.${meta.parentCol} WHERE a.id = ? AND p.profile_id = ?`,
    [id, owner]
  );
  if (!row) throw new HttpError("Attachment not found.", 404);
  return row;
}

/** Remove files from disk for attachments matched by a WHERE clause on the parent table (rows go via FK cascade). */
export async function purgeFiles(kind, parentWhereSql, args) {
  const meta = kindOf(kind);
  const rows = await query(`SELECT a.stored_name FROM ${meta.table} a JOIN ${meta.parentTable} p ON p.id = a.${meta.parentCol} WHERE ${parentWhereSql}`, args);
  await Promise.all(rows.map((r) => deleteStoredFile(r.stored_name).catch(() => {})));
  return rows.length;
}
