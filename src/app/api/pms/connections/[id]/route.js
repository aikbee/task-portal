import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { updateConnection, removeConnection, mapsOf } from "@/lib/pms-sync";

/** Rename ({ label }) or replace the token ({ token }). */
export const PUT = handler(async (request, params, user) => ok({ connections: await updateConnection(user, requireId(params.id), await readJson(request)) }));

/** Forget the connection here (the token stays valid in Bitara PMS until it is revoked there). */
export const DELETE = handler(async (_req, params, user) => ok({ connections: await removeConnection(user, requireId(params.id)), maps: await mapsOf(user) }));
