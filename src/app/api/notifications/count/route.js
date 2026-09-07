import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { ensureReminders } from "@/lib/notifications";

/** Unread count (cheap poll target). */
export const GET = handler(async (_request, _params, user) => {
  await ensureReminders(user.id, user.profile_id);
  const [{ unread }] = await query("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id]);
  return ok({ unread });
});
