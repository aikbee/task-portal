import { handler, ok, readJson } from "@/lib/api-utils";
import { queryOne } from "@/lib/db";
import { connectionsOf, addConnection, mapsOf, prefsOf } from "@/lib/pms-sync";
import { customBaseAllowed, PMS_BASE } from "@/lib/pms";

/** My Bitara PMS connections (never the tokens), where each project of the open workspace goes and my defaults; ?brief=1: only whether I have one. */
export const GET = handler(async (request, _params, user) => {
  if (new URL(request.url).searchParams.get("brief")) return ok({ connected: Number((await queryOne("SELECT COUNT(*) AS n FROM pms_connections WHERE user_id = ?", [user.id]))?.n) > 0 });
  return ok({ connections: await connectionsOf(user.id), maps: await mapsOf(user), prefs: await prefsOf(user.id), base: PMS_BASE, custom_base: customBaseAllowed() });
});

/** Connect: { token, label?, base_url? (outside production only) }. The token is checked with PMS before it is kept. */
export const POST = handler(async (request, _params, user) => ok(await addConnection(user, await readJson(request)), { status: 201 }));
