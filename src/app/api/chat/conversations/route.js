import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { conversationsOf, directConversation, assertFriends, conversationFor } from "@/lib/chat";

/** My conversations, newest activity first, with unread counts. */
export const GET = handler(async (_request, _params, user) => ok(await conversationsOf(user.id)));

/** Open (or create) the direct conversation with a friend: { user_id }. */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const other = Number(body.user_id);
  if (!Number.isInteger(other) || other <= 0 || other === user.id) throw new HttpError("Invalid user.", 400);
  await assertFriends(user.id, other);
  const id = await directConversation(user.id, other, { create: true });
  return ok(await conversationFor(id, user.id));
});
