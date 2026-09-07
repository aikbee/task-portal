import { query, execute } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { ensureReminders } from "@/lib/notifications";

/** List notifications (newest first). ?unread=1 filters; ?limit= caps (default 50). Generates due-date reminders on the way. */
export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  await ensureReminders(user.id, user.profile_id);
  const limit = Math.max(1, Math.min(200, Number(sp.get("limit")) || 50));
  const where = ["n.user_id = ?"];
  const args = [user.id];
  if (sp.get("unread") === "1") where.push("n.read_at IS NULL");
  const rows = await query(
    `SELECT n.*, a.name AS actor_name, a.avatar_color AS actor_color
     FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
     WHERE ${where.join(" AND ")} ORDER BY n.created_at DESC, n.id DESC LIMIT ${limit}`,
    args
  );
  const [{ unread }] = await query("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id]);
  return ok({ items: rows, unread });
});

/** Delete all read notifications. */
export const DELETE = handler(async (_request, _params, user) => {
  const res = await execute("DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL", [user.id]);
  return ok({ deleted: res.affectedRows });
});
