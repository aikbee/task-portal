import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";

/** Projects of the workspace, to pick where a task goes (by id or code). */
export const GET = handler(async (_request, _params, user) =>
  ok(await query("SELECT id, name, code, status, color FROM projects WHERE profile_id = ? ORDER BY name", [user.profile_id]))
);
