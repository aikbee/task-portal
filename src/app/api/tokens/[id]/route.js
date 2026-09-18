import { handler, ok, requireId } from "@/lib/api-utils";
import { listTokens, revokeToken } from "@/lib/api-tokens";

export const DELETE = handler(async (_request, params, user) => {
  await revokeToken(user.id, requireId(params.id));
  return ok({ tokens: await listTokens(user.id) });
});
