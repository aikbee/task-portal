import { execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { friendshipBetween, friendsOverview, publish } from "@/lib/chat";

/** Unfriend: the conversation history stays, but no new messages until you are friends again. */
export const DELETE = handler(async (_request, params, user) => {
  const other = requireId(params.userId);
  const f = await friendshipBetween(user.id, other);
  if (!f || f.status !== "accepted") throw new HttpError("You are not friends.", 404);
  await execute("DELETE FROM friendships WHERE id = ?", [f.id]);
  publish(other, { type: "friends" });
  return ok(await friendsOverview(user.id));
});
