import { execute } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

export const POST = handler(async (_request, _params, user) => {
  const res = await execute("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL", [user.id]);
  return ok({ updated: res.affectedRows });
});
