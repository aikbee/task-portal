import { execute, queryOne } from "@/lib/db";
import { handler, ok, HttpError } from "@/lib/api-utils";
import { groupByInviteCode, conversationFor, systemMessage, broadcast, publish, GROUP_MAX_MEMBERS } from "@/lib/chat";

const preview = (g, mine) => ({ id: g.id, title: g.title, avatar_color: g.avatar_color, avatar: mine ? g.avatar : g.avatar?.startsWith("preset:") ? g.avatar : null, member_count: Number(g.member_count) });

/** What an invite link points at, before joining: { group, relation: "none" | "member" | "full" }. */
export const GET = handler(async (_request, params, user) => {
  const g = await groupByInviteCode(params.code);
  if (!g) throw new HttpError("That invite link is not valid any more.", 404);
  const mine = await queryOne("SELECT 1 AS x FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [g.id, user.id]);
  return ok({ group: preview(g, Boolean(mine)), relation: mine ? "member" : Number(g.member_count) >= GROUP_MAX_MEMBERS ? "full" : "none" });
});

/** Join the group behind an invite link (no friendship needed). Returns the conversation. */
export const POST = handler(async (_request, params, user) => {
  const g = await groupByInviteCode(params.code);
  if (!g) throw new HttpError("That invite link is not valid any more.", 404);
  const mine = await queryOne("SELECT 1 AS x FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [g.id, user.id]);
  if (mine) return ok(await conversationFor(g.id, user.id));
  if (Number(g.member_count) >= GROUP_MAX_MEMBERS) throw new HttpError(`Groups can have up to ${GROUP_MAX_MEMBERS} members.`, 400);
  await execute("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)", [g.id, user.id]);
  const convo = await conversationFor(g.id, user.id);
  await systemMessage(convo, user.id, "joined");
  broadcast(convo, { type: "conversation", conversation_id: g.id, action: "updated" });
  publish(user.id, { type: "conversation", conversation_id: g.id, action: "updated" });
  return ok(convo, { status: 201 });
});
