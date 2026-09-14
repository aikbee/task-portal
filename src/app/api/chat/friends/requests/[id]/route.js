import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { friendsOverview, publish } from "@/lib/chat";

/** Decline a request from :id, or cancel the one I sent to :id. */
export const DELETE = handler(async (_request, params, user) => {
  const other = requireId(params.id);
  const f = await queryOne(
    "SELECT * FROM friendships WHERE status = 'pending' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
    [user.id, other, other, user.id]
  );
  if (!f) throw new HttpError("Request not found.", 404);
  await execute("DELETE FROM friendships WHERE id = ?", [f.id]);
  publish(other, { type: "friends" });
  return ok(await friendsOverview(user.id));
});
