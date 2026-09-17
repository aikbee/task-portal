import { query } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { tagList } from "@/lib/tags";

/** Every tag used on tasks of the active profile with how often, most used first (suggestions and the list filter). */
export const GET = handler(async (_request, _params, user) => {
  const rows = await query("SELECT tags FROM tasks WHERE profile_id = ? AND tags IS NOT NULL", [user.profile_id]);
  const counts = new Map();
  for (const r of rows) for (const t of tagList(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return ok([...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)));
});
