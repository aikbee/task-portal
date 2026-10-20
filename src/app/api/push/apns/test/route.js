import { handler, ok, HttpError } from "@/lib/api-utils";
import { sendApnsToSession } from "@/lib/apns";

/** The iPhone app's "Send a test notification": to this phone only. */
export const POST = handler(async (_request, _params, user) => {
  if (!user.session_id) throw new HttpError("Sign in with the app first.", 400);
  const result = await sendApnsToSession(user.session_id, user.id, { title: "Task Portal", body: "Notifications are working on this iPhone.", href: "/notifications", type: "push_test" });
  if (!result.sent) throw new HttpError(result.error || "Apple did not accept the notification for this iPhone.", result.total ? 502 : 400);
  return ok(result);
});
