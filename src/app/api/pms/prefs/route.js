import { handler, ok, readJson } from "@/lib/api-utils";
import { prefsOf, setPrefs } from "@/lib/pms-sync";

/** My defaults for sending to Bitara PMS: { close_reason }. */
export const GET = handler(async (_req, _params, user) => ok(await prefsOf(user.id)));

/** { close_reason } — empty goes back to the built-in text. */
export const PUT = handler(async (request, _params, user) => ok(await setPrefs(user, await readJson(request))));
