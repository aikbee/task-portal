import { handler, ok } from "@/lib/api-utils";
import { RATE, trustedIp } from "@/lib/api-tokens";

/** Who the API sees: the person, the workspace, and the token with its permissions and limits. */
export const GET = handler(async (request, _params, user) =>
  ok({
    user: { id: user.id, name: user.name, email: user.email },
    workspace: { id: user.profile_id, name: user.profile?.name ?? null, access: user.access },
    your_ip: trustedIp(request),
    token: user.token ? { name: user.token.name, scope: user.token.scope, scopes: user.token.scopes ?? null, ip_allow: user.token.ip_allow ?? null, rate_limit: { per_minute: RATE.perMinute, per_day: RATE.perDay } } : null,
  })
);
