import { handler, ok, readJson } from "@/lib/api-utils";
import { readLegal, saveLegal } from "@/lib/legal";

/** Admin: who runs the portal and how to reach them, as printed on /privacy and /terms. */
export const GET = handler(async () => ok(await readLegal()), { role: "admin" });

/** Admin: { operator?, contact_email?, country? } — fields left out keep their value, "" clears one. */
export const PUT = handler(async (request, _params, user) => ok(await saveLegal(await readJson(request), user.id)), { role: "admin" });
