import { handler, ok, readJson } from "@/lib/api-utils";
import { mapsOf, setMap } from "@/lib/pms-sync";

/** The projects of the open workspace and the Bitara PMS project each goes to (for me). */
export const GET = handler(async (_req, _params, user) => ok(await mapsOf(user)));

/** { project_id, connection_id, pms_project } — an empty pms_project removes the pairing. */
export const PUT = handler(async (request, _params, user) => ok(await setMap(user, await readJson(request))));
