import { execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, systemMessage, broadcast, publish } from "@/lib/chat";

/** Remove someone from a group (owner only; leave the group yourself with DELETE /conversations/:id). */
export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  const other = requireId(params.userId);
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Only group chats have members to remove.", 400);
  if (convo.my_role !== "owner") throw new HttpError("Only the group owner can remove people.", 403);
  if (other === user.id) throw new HttpError("Leave the group instead.", 400);
  const member = convo.members.find((m) => m.id === other);
  if (!member) throw new HttpError("Not a member.", 404);
  await execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [id, other]);
  const updated = await conversationFor(id, user.id);
  await systemMessage(updated, user.id, "removed", { names: [member.name] });
  broadcast(updated, { type: "conversation", conversation_id: id, action: "updated" });
  publish(other, { type: "conversation", conversation_id: id, action: "removed", title: convo.title });
  return ok(updated);
});
