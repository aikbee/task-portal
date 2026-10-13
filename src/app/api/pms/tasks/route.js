import { handler, ok } from "@/lib/api-utils";
import { pickList } from "@/lib/pms-sync";

/** Tasks of the open workspace that can go to Bitara PMS (?q=, ?project_id=), with their linked tickets. */
export const GET = handler(async (request, _params, user) => {
  const sp = new URL(request.url).searchParams;
  return ok(await pickList(user, { q: sp.get("q") ?? "", projectId: sp.get("project_id") || null }));
});
