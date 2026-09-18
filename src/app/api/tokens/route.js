import { handler, ok, readJson } from "@/lib/api-utils";
import { listTokens, createToken } from "@/lib/api-tokens";
import { notify } from "@/lib/notifications";

/** My API tokens (never the token itself, only its prefix). */
export const GET = handler(async (_request, _params, user) => ok(await listTokens(user.id)));

/** { name, scope: read|write, profile_id?, days? } → { token, row, tokens }. The token is shown this once. */
export const POST = handler(async (request, _params, user) => {
  const { token, row } = await createToken(user, await readJson(request));
  notify({ userId: user.id, type: "security_method", title: `API token "${row.name}" created`, body: `${row.scope === "write" ? "Read and write" : "Read only"}. Revoke it under Security if this was not you.`, href: "/security", entityType: "user", entityId: user.id, email: false }).catch(() => {});
  return ok({ token, row, tokens: await listTokens(user.id) }, { status: 201 });
});
