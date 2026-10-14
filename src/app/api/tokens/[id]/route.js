import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { listTokens, revokeToken, updateToken } from "@/lib/api-tokens";

/** Rename a token or change the addresses it may be used from: { name?, ip_allow? } → { tokens }. */
export const PATCH = handler(async (request, params, user) => {
  await updateToken(user.id, requireId(params.id), await readJson(request));
  return ok({ tokens: await listTokens(user.id) });
});

export const DELETE = handler(async (_request, params, user) => {
  await revokeToken(user.id, requireId(params.id));
  return ok({ tokens: await listTokens(user.id) });
});
