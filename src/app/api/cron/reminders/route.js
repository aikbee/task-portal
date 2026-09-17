import { query } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { ensureReminders } from "@/lib/notifications";
import { sweepRetention } from "@/lib/chat";
import { ensureDailyBackup } from "@/lib/backups";

/**
 * Scheduler entry point: generates due/overdue reminders for every profile so pushes go
 * out even when nobody has the app open, purges chat messages past their retention, and takes the daily backup
 * when the last good one is more than 20 hours old. Called by cron with the CRON_SECRET.
 */
export const GET = handler(
  async (request) => {
    const secret = process.env.CRON_SECRET;
    const given = request.headers.get("x-cron-key") || request.nextUrl.searchParams.get("key");
    if (!secret || given !== secret) throw new HttpError("Unauthorized.", 401);
    const profiles = await query("SELECT id, user_id FROM profiles");
    let created = 0;
    for (const p of profiles) created += await ensureReminders(p.user_id, p.id);
    const chatPurged = (await sweepRetention({ force: true })) ?? 0;
    const backup = await ensureDailyBackup().catch((e) => ({ ran: true, ok: false, error: e.message }));
    return ok({ profiles: profiles.length, created, chat_purged: chatPurged, backup, at: new Date().toISOString() });
  },
  { auth: false }
);
