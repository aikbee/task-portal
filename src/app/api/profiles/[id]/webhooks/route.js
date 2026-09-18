import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";
import { listWebhooks, createWebhook, WEBHOOK_EVENTS } from "@/lib/webhooks";

/** Owner / managers: the profile's webhooks and the events they can subscribe to. */
export const GET = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  return ok({ webhooks: await listWebhooks(profile.id), events: WEBHOOK_EVENTS });
});

/** { url, events?: [...] | "*" } → the hook with its secret (shown once). */
export const POST = handler(async (request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const hook = await createWebhook(user, profile.id, await readJson(request));
  return ok({ webhook: hook, webhooks: await listWebhooks(profile.id) }, { status: 201 });
});
