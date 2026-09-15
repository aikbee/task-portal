import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor } from "@/lib/chat";

/** My own settings for one chat: { muted?, pinned?, archived? } (each a boolean). Nobody else sees them. */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await conversationFor(id, user.id);
  const body = await readJson(request);
  const sets = [];
  const args = [];
  if (typeof body.muted === "boolean") { sets.push("muted = ?"); args.push(body.muted ? 1 : 0); }
  if (typeof body.pinned === "boolean") sets.push(body.pinned ? "pinned_at = COALESCE(pinned_at, NOW())" : "pinned_at = NULL");
  if (typeof body.archived === "boolean") sets.push(body.archived ? "archived_at = COALESCE(archived_at, NOW())" : "archived_at = NULL");
  if (!sets.length) throw new HttpError("Nothing to change: send muted, pinned or archived.", 400);
  await execute(`UPDATE conversation_members SET ${sets.join(", ")} WHERE conversation_id = ? AND user_id = ?`, [...args, id, user.id]);
  return ok(await conversationFor(id, user.id));
});
