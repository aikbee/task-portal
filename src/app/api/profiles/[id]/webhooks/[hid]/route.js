import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";
import { listWebhooks, updateWebhook, deleteWebhook } from "@/lib/webhooks";

/** { url?, events?, active? } */
export const PUT = handler(async (request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  const webhook = await updateWebhook(profile.id, requireId(params.hid), await readJson(request));
  return ok({ webhook, webhooks: await listWebhooks(profile.id) });
});

export const DELETE = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  await deleteWebhook(profile.id, requireId(params.hid));
  return ok({ webhooks: await listWebhooks(profile.id) });
});
