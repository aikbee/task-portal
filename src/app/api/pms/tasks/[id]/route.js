import { handler, ok, requireId } from "@/lib/api-utils";
import { planTask, briefOf } from "@/lib/pms-sync";

/** What one task holds for Bitara PMS, each part marked new / changed / sent (?brief=1: only the linked ticket). */
export const GET = handler(async (request, params, user) => {
  const id = requireId(params.id);
  return ok(new URL(request.url).searchParams.get("brief") ? await briefOf(user, id) : await planTask(user, id));
});
