import { query } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Search text messages in the conversations you belong to: ?q= (2+ characters), optional ?c=<conversation id>,
 * ?before=<message id> for the next page. Newest first, 30 per page. System lines are never returned.
 */
export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  const q = String(sp.get("q") ?? "").trim();
  if (q.length < 2) throw new HttpError("Type at least 2 characters.", 400);
  const conversationId = Number(sp.get("c")) || null;
  const before = Number(sp.get("before")) || null;
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 30));
  const args = [user.id, user.id, user.id, `%${escapeLike(q)}%`];
  let where = "x.kind = 'text' AND x.body LIKE ?";
  if (conversationId) {
    where += " AND x.conversation_id = ?";
    args.push(conversationId);
  }
  if (before) {
    where += " AND x.id < ?";
    args.push(before);
  }
  const rows = await query(
    `SELECT x.id, x.conversation_id, x.sender_id, x.body, x.created_at, s.name AS sender_name, s.avatar_color AS sender_color,
       c.kind AS conversation_kind, c.title, c.avatar_color AS group_color,
       (SELECT u.name FROM conversation_members pm JOIN users u ON u.id = pm.user_id WHERE pm.conversation_id = c.id AND pm.user_id <> ? LIMIT 1) AS peer_name,
       (SELECT u.avatar_color FROM conversation_members pm JOIN users u ON u.id = pm.user_id WHERE pm.conversation_id = c.id AND pm.user_id <> ? LIMIT 1) AS peer_color
     FROM messages x
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = ?
     JOIN conversations c ON c.id = x.conversation_id
     LEFT JOIN users s ON s.id = x.sender_id
     WHERE ${where}
     ORDER BY x.id DESC LIMIT ${limit}`,
    args
  );
  return ok(
    rows.map((r) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      conversation_kind: r.conversation_kind,
      conversation_name: r.conversation_kind === "group" ? r.title : r.peer_name ?? "Deleted account",
      conversation_color: r.conversation_kind === "group" ? r.group_color : r.peer_color ?? "#94a3b8",
      sender_id: r.sender_id,
      sender_name: r.sender_name,
      sender_color: r.sender_color,
      body: r.body,
      created_at: r.created_at,
    }))
  );
});
