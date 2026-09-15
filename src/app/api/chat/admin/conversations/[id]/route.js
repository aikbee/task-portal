import { query, queryOne } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { deleteConversation, publish } from "@/lib/chat";

/** Admin: delete a whole conversation (group or direct) with its files; members are told live. */
export const DELETE = handler(
  async (_request, params) => {
    const id = requireId(params.id);
    const c = await queryOne("SELECT id, kind, title FROM conversations WHERE id = ?", [id]);
    if (!c) throw new HttpError("Conversation not found.", 404);
    const members = await query("SELECT user_id FROM conversation_members WHERE conversation_id = ?", [id]);
    await deleteConversation(id);
    for (const m of members) publish(m.user_id, { type: "conversation", conversation_id: id, action: "removed", title: c.title ?? "", reason: "moderation" });
    return ok({ id, deleted: true });
  },
  { role: "admin" }
);
