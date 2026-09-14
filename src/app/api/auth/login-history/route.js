import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

/** Your recent sign-ins and failed attempts (newest first). */
export const GET = handler(async (request, _params, user) => {
  const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 100));
  const rows = await query(
    `SELECT e.id, e.method, e.success, e.reason, e.ip, e.browser, e.os, e.device, e.created_at,
       (e.session_id IS NOT NULL AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = e.session_id AND s.expires_at > NOW())) AS session_active,
       (e.session_id = ?) AS current
     FROM login_events e WHERE e.user_id = ? ORDER BY e.id DESC LIMIT ${limit}`,
    [user.session_id, user.id]
  );
  return ok(rows.map((r) => ({ ...r, success: Boolean(r.success), session_active: Boolean(r.session_active), current: Boolean(r.current) })));
});
