import { query, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { TOKEN_RE, BUNDLE_RE, APNS_TOPIC, MAX_DEVICES_PER_USER, readApnsSettings } from "@/lib/apns";

/**
 * The iPhone app registers its APNs device token: { token (hex), environment: production | sandbox, bundle_id,
 * app_version, device }. The token is bound to this session (a phone that signs in as somebody else moves it), so
 * signing out or a revoked session ends the pushes. Only a signed-in app can do this, never an API token.
 */
export const POST = handler(async (request, _params, user) => {
  if (!user.session_id) throw new HttpError("Sign in with the app to get notifications on this phone.", 400);
  const body = await readJson(request);
  const token = String(body.token ?? "").trim().toLowerCase();
  if (!TOKEN_RE.test(token)) throw new HttpError("That is not an APNs device token.", 400);
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const bundle = String(body.bundle_id ?? APNS_TOPIC).trim();
  if (!BUNDLE_RE.test(bundle)) throw new HttpError("This app may not register here.", 400);
  const clip = (v, n) => (v == null || v === "" ? null : String(v).trim().slice(0, n));
  await execute(
    `INSERT INTO apns_devices (user_id, session_id, token, environment, bundle_id, app_version, device) VALUES (?, ?, ?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE user_id = new.user_id, session_id = new.session_id, environment = new.environment, bundle_id = new.bundle_id, app_version = new.app_version, device = new.device, last_error = NULL`,
    [user.id, user.session_id, token, environment, bundle, clip(body.app_version, 40), clip(body.device, 120)]
  );
  // a phone reinstalled again and again leaves old tokens behind: keep the newest few
  const extra = await query("SELECT id FROM apns_devices WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000 OFFSET ?", [user.id, MAX_DEVICES_PER_USER]);
  if (extra.length) await execute(`DELETE FROM apns_devices WHERE id IN (${extra.map(() => "?").join(",")})`, extra.map((r) => r.id));
  return ok({ registered: true, enabled: (await readApnsSettings()).ready });
});

/** { token }: this phone wants no more notifications (the app turned them off). */
export const DELETE = handler(async (request, _params, user) => {
  const token = String((await readJson(request)).token ?? "").trim().toLowerCase();
  await execute("DELETE FROM apns_devices WHERE user_id = ? AND token = ?", [user.id, token]);
  return ok({ registered: false });
});
