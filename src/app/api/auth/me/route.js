import { handler, ok } from "@/lib/api-utils";

export const GET = handler(async (_request, _params, user) => {
  const { session_id, expires_at, ...safe } = user;
  return ok(safe);
});
