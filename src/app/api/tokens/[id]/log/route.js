import { handler, ok, requireId } from "@/lib/api-utils";
import { requestLog } from "@/lib/api-tokens";

/** The latest requests a token of mine made (kept 14 days): ?limit= up to 200, default 50. */
export const GET = handler(async (request, params, user) => ok(await requestLog(user.id, requireId(params.id), request.nextUrl.searchParams.get("limit"))));
