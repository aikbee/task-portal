import { queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";
import { listDeliveries } from "@/lib/webhooks";

/** The last 30 deliveries of a hook: status, attempts, response, error. */
export const GET = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const hook = await queryOne("SELECT id FROM webhooks WHERE id = ? AND profile_id = ?", [requireId(params.hid), profile.id]);
  if (!hook) throw new HttpError("Webhook not found.", 404);
  return ok(await listDeliveries(hook.id));
});
