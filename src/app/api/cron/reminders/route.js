import { query } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { ensureReminders } from "@/lib/notifications";

/**
 * Scheduler entry point: generates due/overdue reminders for every profile so pushes go
 * out even when nobody has the app open. Called by cron with the CRON_SECRET.
 */
export const GET = handler(
  async (request) => {
    const secret = process.env.CRON_SECRET;
    const given = request.headers.get("x-cron-key") || request.nextUrl.searchParams.get("key");
    if (!secret || given !== secret) throw new HttpError("Unauthorized.", 401);
    const profiles = await query("SELECT id, user_id FROM profiles");
    let created = 0;
    for (const p of profiles) created += await ensureReminders(p.user_id, p.id);
    return ok({ profiles: profiles.length, created, at: new Date().toISOString() });
  },
  { auth: false }
);
