import { execute } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { listSessions } from "@/lib/login";

/** Where you are signed in right now (the current session first). */
export const GET = handler(async (_request, _params, user) => ok(await listSessions(user)));

/** Sign out every other device and browser; this session stays. */
export const DELETE = handler(async (_request, _params, user) => {
  await execute("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [user.id, user.session_id]);
  return ok(await listSessions(user));
});
