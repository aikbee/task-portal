import { execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { pushEnabled } from "@/lib/push";

/** Register (or refresh) this browser's push subscription for the signed-in user. Body: PushSubscription.toJSON() */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const endpoint = String(body.endpoint || "");
  const p256dh = String(body.keys?.p256dh || "");
  const auth = String(body.keys?.auth || "");
  if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 512 || !p256dh || !auth || p256dh.length > 255 || auth.length > 255) {
    throw new HttpError("Invalid push subscription.", 400);
  }
  await execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE user_id = new.user_id, p256dh = new.p256dh, auth = new.auth, user_agent = new.user_agent, last_used_at = NOW()`,
    [user.id, endpoint, p256dh, auth, (request.headers.get("user-agent") || "").slice(0, 255)]
  );
  return ok({ ok: true, enabled: pushEnabled() });
});
