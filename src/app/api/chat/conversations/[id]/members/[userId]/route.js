import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, systemMessage, broadcast, publish, assertManager, ROLE_RANK, PEER_FIELDS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

async function target(params, user) {
  const id = requireId(params.id);
  const other = requireId(params.userId);
  const convo = await conversationFor(id, user.id);
  if (convo.kind !== "group") throw new HttpError("Only group chats have members to manage.", 400);
  const member = convo.members.find((m) => m.id === other);
  if (!member) throw new HttpError("Not a member.", 404);
  return { id, other, convo, member };
}

/** Remove someone from a group: the owner removes anyone, an admin removes plain members (leave yourself with DELETE /conversations/:id). */
export const DELETE = handler(async (_request, params, user) => {
  const { id, other, convo, member } = await target(params, user);
  assertManager(convo, "remove people");
  if (other === user.id) throw new HttpError("Leave the group instead.", 400);
  if (ROLE_RANK[member.role] >= ROLE_RANK[convo.my_role]) throw new HttpError(member.role === "owner" ? "The owner cannot be removed." : "Only the owner can remove an admin.", 403);
  await execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [id, other]);
  const updated = await conversationFor(id, user.id);
  await systemMessage(updated, user.id, "removed", { names: [member.name] });
  broadcast(updated, { type: "conversation", conversation_id: id, action: "updated" });
  publish(other, { type: "conversation", conversation_id: id, action: "removed", title: convo.title });
  return ok(updated);
});

/**
 * Change a member's role (owner only): { role: "admin" | "member" } promotes or demotes;
 * { role: "owner", confirm: "<their name>" } hands the group over — you become an admin. Typing the name is deliberate.
 */
export const PUT = handler(async (request, params, user) => {
  const { id, other, convo, member } = await target(params, user);
  if (convo.my_role !== "owner") throw new HttpError("Only the group owner can change roles.", 403);
  if (other === user.id) throw new HttpError("You already own this group.", 400);
  const body = await readJson(request);
  const role = String(body.role ?? "");
  if (!["admin", "member", "owner"].includes(role)) throw new HttpError("role must be admin, member or owner.", 400);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  if (role === "owner") {
    const typed = String(body.confirm ?? "").trim().toLowerCase();
    if (!typed || typed !== String(member.name).trim().toLowerCase()) throw new HttpError("Type the new owner's name to confirm the transfer.", 400, { confirm: member.name });
    await execute("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?", [id, other]);
    await execute("UPDATE conversation_members SET role = 'admin' WHERE conversation_id = ? AND user_id = ?", [id, user.id]);
    const updated = await conversationFor(id, user.id);
    await systemMessage(updated, user.id, "transferred", { names: [member.name] });
    broadcast(updated, { type: "conversation", conversation_id: id, action: "updated" });
    notify({ userId: other, type: "chat_group", title: `${me.name} made you the owner of “${convo.title}”`, body: null, href: `/chat?c=${id}`, entityType: "conversation", entityId: id, actorId: user.id }).catch(() => {});
    return ok(updated);
  }
  if (member.role === role) return ok(convo);
  await execute("UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?", [role, id, other]);
  const updated = await conversationFor(id, user.id);
  await systemMessage(updated, user.id, role === "admin" ? "admin" : "unadmin", { names: [member.name] });
  broadcast(updated, { type: "conversation", conversation_id: id, action: "updated" });
  if (role === "admin") notify({ userId: other, type: "chat_group", title: `${me.name} made you an admin of “${convo.title}”`, body: null, href: `/chat?c=${id}`, entityType: "conversation", entityId: id, actorId: user.id }).catch(() => {});
  return ok(updated);
});
