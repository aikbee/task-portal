import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, assertManager, systemMessage, broadcast, purgeExpired, RETENTION_CHOICES } from "@/lib/chat";

/**
 * Disappearing messages: { days: null | 1 | 7 | 30 | 90 | 365 }. Either person in a direct chat, owner or admin in a group.
 * Older messages are purged straight away and then on every sweep; an instance cap set by an administrator always applies too.
 */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  if (convo.kind === "group") assertManager(convo, "change disappearing messages");
  const raw = (await readJson(request)).days;
  const days = raw == null || raw === "" || raw === 0 || raw === "0" ? null : Number(raw);
  if (days != null && !RETENTION_CHOICES.includes(days)) throw new HttpError(`days must be one of ${RETENTION_CHOICES.join(", ")} or null.`, 400);
  if (days !== (convo.retention_days ?? null)) {
    await execute("UPDATE conversations SET retention_days = ? WHERE id = ?", [days, id]);
    await systemMessage(convo, user.id, "retention", { days });
    await purgeExpired({ conversationId: id });
    broadcast(convo, { type: "conversation", conversation_id: id, action: "updated" });
  }
  return ok(await conversationFor(id, user.id));
});
