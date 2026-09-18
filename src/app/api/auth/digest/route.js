import { handler, ok, HttpError } from "@/lib/api-utils";
import { sendDigest, buildDigest } from "@/lib/digest";

/** What my digest would say right now (counts), for the settings panel. */
export const GET = handler(async (_request, _params, user) => {
  const d = await buildDigest(user.id);
  return ok({ notifications: d?.total ?? 0, tasks: d?.tasks.length ?? 0, events: d?.events.length ?? 0, empty: d?.empty ?? true });
});

/** Send my digest now, even when it is empty (so a person can see what it looks like). */
export const POST = handler(async (_request, _params, user) => {
  const res = await sendDigest(user.id, { force: true });
  if (!res.sent) throw new HttpError(res.reason || "Could not send.", 502);
  return ok(res);
});
