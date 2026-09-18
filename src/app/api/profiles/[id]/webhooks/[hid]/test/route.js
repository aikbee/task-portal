import { handler, ok, requireId } from "@/lib/api-utils";
import { profileForMembers } from "@/lib/sharing";
import { sendTest } from "@/lib/webhooks";

/** Send a "ping" right away; the answer says how the receiver took it. */
export const POST = handler(async (_request, params, user) => {
  const profile = await profileForMembers(user, requireId(params.id), { manage: true });
  return ok(await sendTest(user, profile.id, requireId(params.hid)));
});
