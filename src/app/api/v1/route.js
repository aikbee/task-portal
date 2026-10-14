import { handler, ok } from "@/lib/api-utils";
import { lastOrigin } from "@/lib/origin";
import { trustedIp } from "@/lib/api-tokens";
import { ENDPOINTS, API_BASE } from "@/lib/api-docs";

/** What the API offers, for a person or a program that found it. Public: no data. */
export const GET = handler(
  async (request) => {
    const origin = lastOrigin();
    return ok({
      name: "Task Portal API",
      version: "1",
      docs: `${origin}/developers`,
      openapi: `${origin}${API_BASE}/openapi.json`,
      authentication: "Authorization: Bearer tp_… (a token made in Task Portal under Integrations → Task Portal API)",
      your_ip: trustedIp(request), // what a token's allowed addresses are checked against
      endpoints: ENDPOINTS.flatMap((g) => g.items.map((e) => `${e.method} ${API_BASE}${e.path}`)),
    });
  },
  { auth: false }
);
