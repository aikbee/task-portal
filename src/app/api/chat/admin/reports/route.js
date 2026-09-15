import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v ?? {});

/** Admin: reported messages, newest first (?status=open default | resolved | all). */
export const GET = handler(
  async (request) => {
    const status = request.nextUrl.searchParams.get("status") || "open";
    const where = status === "all" ? "1 = 1" : status === "resolved" ? "r.status <> 'open'" : "r.status = 'open'";
    const rows = await query(
      `SELECT r.id, r.conversation_id, r.message_id, r.reporter_id, r.sender_id, r.reason, r.snapshot, r.status, r.resolved_by, r.resolved_at, r.created_at,
         x.deleted_at AS message_deleted, x.body AS message_body, c.kind AS conversation_kind, c.title AS conversation_title, rb.name AS resolved_by_name
       FROM message_reports r
       JOIN conversations c ON c.id = r.conversation_id
       LEFT JOIN messages x ON x.id = r.message_id
       LEFT JOIN users rb ON rb.id = r.resolved_by
       WHERE ${where} ORDER BY r.created_at DESC LIMIT 300`
    );
    return ok(
      rows.map((r) => ({
        ...r,
        snapshot: parse(r.snapshot),
        message_gone: r.message_id == null,
        message_deleted: Boolean(r.message_deleted),
        message_body: r.message_deleted ? null : r.message_body,
      }))
    );
  },
  { role: "admin" }
);
