import { execute, query, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { purgeExpired, systemMessage, publish, RETENTION_CHOICES } from "@/lib/chat";

/** Admin: set one conversation's disappearing-messages window { days } without being a member. */
export const PUT = handler(
  async (request, params, user) => {
    const id = requireId(params.id);
    const c = await queryOne("SELECT id, kind, title, retention_days FROM conversations WHERE id = ?", [id]);
    if (!c) throw new HttpError("Conversation not found.", 404);
    const raw = (await readJson(request)).days;
    const days = raw == null || raw === "" || raw === 0 || raw === "0" ? null : Number(raw);
    if (days != null && !RETENTION_CHOICES.includes(days)) throw new HttpError(`days must be one of ${RETENTION_CHOICES.join(", ")} or null.`, 400);
    const members = (await query("SELECT user_id AS id FROM conversation_members WHERE conversation_id = ?", [id])).map((m) => ({ id: m.id }));
    if (days !== (c.retention_days ?? null)) {
      await execute("UPDATE conversations SET retention_days = ? WHERE id = ?", [days, id]);
      await systemMessage({ id, members }, user.id, "retention", { days, by_admin: true });
      await purgeExpired({ conversationId: id });
      for (const m of members) publish(m.id, { type: "conversation", conversation_id: id, action: "updated" });
    }
    return ok({ id, retention_days: days });
  },
  { role: "admin" }
);
