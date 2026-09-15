import { query, queryOne } from "@/lib/db";
import { handler, requireId, HttpError } from "@/lib/api-utils";
import { PEER_FIELDS } from "@/lib/chat";
import { exportConversation } from "@/lib/chat-export";

/** Admin: export any conversation in full (?format=txt|json|zip). */
export const GET = handler(
  async (request, params, user) => {
    const id = requireId(params.id);
    const c = await queryOne("SELECT id, kind, title, retention_days, created_at FROM conversations WHERE id = ?", [id]);
    if (!c) throw new HttpError("Conversation not found.", 404);
    const members = await query(`SELECT m.role, ${PEER_FIELDS} FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? ORDER BY m.joined_at, u.id`, [id]);
    const name = c.kind === "group" ? c.title : members.map((m) => m.name).join(" and ");
    return exportConversation({ ...c, name, members }, { format: request.nextUrl.searchParams.get("format"), floor: 0, by: user });
  },
  { role: "admin" }
);
