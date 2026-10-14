import { handler, ok, readJson } from "@/lib/api-utils";
import { prefsOf, setPrefs } from "@/lib/pms-sync";

/** My defaults for sending to Bitara PMS: { close_reason, ticket_footer }. */
export const GET = handler(async (_req, _params, user) => ok(await prefsOf(user.id)));

/** { close_reason?, ticket_footer? }, each changed only when sent. An empty close reason goes back to the built-in text; an empty footer adds no line. */
export const PUT = handler(async (request, _params, user) => ok(await setPrefs(user, await readJson(request))));
