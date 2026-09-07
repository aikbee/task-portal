import webpush from "web-push";
import { query, execute } from "./db";

/**
 * Web Push delivery. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and VAPID_SUBJECT)
 * in the environment; without them push is silently disabled and the app works as before.
 */
let configured = false;

export const pushEnabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const pushPublicKey = () => (pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null);

function setup() {
  if (!pushEnabled()) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/**
 * Send a payload ({ title, body, href, tag }) to every device a user opted in with.
 * Subscriptions the push service reports as gone (404/410) are removed. Never throws.
 */
export async function sendPush(userId, payload) {
  try {
    if (!setup()) return { sent: 0, total: 0 };
    const subs = await query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", [userId]);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
          sent++;
          execute("UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?", [s.id]).catch(() => {});
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await execute("DELETE FROM push_subscriptions WHERE id = ?", [s.id]).catch(() => {});
        }
      })
    );
    return { sent, total: subs.length };
  } catch {
    return { sent: 0, total: 0 };
  }
}
