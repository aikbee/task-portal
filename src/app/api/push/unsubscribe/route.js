import { execute } from "@/lib/db";
import { handler, ok, readJson } from "@/lib/api-utils";

/** Forget this browser's subscription. Body: { endpoint } */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  await execute("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", [user.id, String(body.endpoint || "")]);
  return ok({ ok: true });
});
