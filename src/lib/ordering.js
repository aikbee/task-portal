import { withTransaction, query } from "./db";

const TABLES = {
  task_attachments: { parent: "task_id" },
  task_outputs: { parent: "task_id" },
  notes: { parent: "module" }, // note: notes are additionally scoped per user by the routes
  requirements: { parent: "project_id" },
  requirement_attachments: { parent: "requirement_id" },
  info_notes: { parent: "info_id" },
  info_attachments: { parent: "info_id" },
  tasks: { parent: null },
};

/** Renumber rows 1..n following the given id order; ids not listed keep relative order after. */
export async function applyOrder(table, parentValue, ids) {
  const meta = TABLES[table];
  if (!meta) throw new Error(`Unknown orderable table ${table}`);
  const where = meta.parent ? `WHERE ${meta.parent} = ?` : "";
  const args = meta.parent ? [parentValue] : [];
  const rows = await query(`SELECT id FROM ${table} ${where} ORDER BY sort_order ASC, id ASC`, args);
  const existing = rows.map((r) => r.id);
  const wanted = ids.map(Number).filter((id) => existing.includes(id));
  const rest = existing.filter((id) => !wanted.includes(id));
  const final = [...wanted, ...rest];
  await withTransaction(async (conn) => {
    for (let i = 0; i < final.length; i++) {
      await conn.execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i + 1, final[i]]);
    }
  });
  return final;
}

/** Move one row to a 1-based position and renumber siblings. */
export async function setPosition(table, parentValue, id, position) {
  const meta = TABLES[table];
  const where = meta.parent ? `WHERE ${meta.parent} = ?` : "";
  const args = meta.parent ? [parentValue] : [];
  const rows = await query(`SELECT id FROM ${table} ${where} ORDER BY sort_order ASC, id ASC`, args);
  const ids = rows.map((r) => r.id).filter((x) => x !== Number(id));
  const pos = Math.max(0, Math.min(ids.length, Number(position) - 1));
  ids.splice(pos, 0, Number(id));
  return applyOrder(table, parentValue, ids);
}

export async function nextSortOrder(table, parentValue) {
  const meta = TABLES[table];
  const where = meta.parent ? `WHERE ${meta.parent} = ?` : "";
  const args = meta.parent ? [parentValue] : [];
  const [row] = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM ${table} ${where}`, args);
  return row.next;
}
