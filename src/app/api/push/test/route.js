import { handler, ok, HttpError } from "@/lib/api-utils";
import { pushEnabled, sendPush } from "@/lib/push";

/** Send a test push to every device the signed-in user opted in with. */
export const POST = handler(async (_request, _params, user) => {
  if (!pushEnabled()) throw new HttpError("Push notifications are not configured on this server.", 400);
  const result = await sendPush(user.id, { title: "Task Portal", body: "Push notifications are working.", href: "/notifications", tag: "push-test" });
  if (!result.total) throw new HttpError("No device is subscribed on this account.", 400);
  return ok(result);
});
