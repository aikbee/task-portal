import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { friendshipBetween, friendsOverview, publish } from "@/lib/chat";

/** Block someone: they cannot message you or send requests until you unblock. */
export const POST = handler(async (_request, params, user) => {
  const other = requireId(params.userId);
  if (other === user.id) throw new HttpError("You cannot block yourself.", 400);
  if (!(await queryOne("SELECT id FROM users WHERE id = ?", [other]))) throw new HttpError("User not found.", 404);
  const f = await friendshipBetween(user.id, other);
  if (f?.status === "blocked" && f.blocked_by !== user.id) throw new HttpError("This person is not available.", 403);
  if (f) await execute("UPDATE friendships SET status = 'blocked', blocked_by = ?, responded_at = NOW() WHERE id = ?", [user.id, f.id]);
  else await execute("INSERT INTO friendships (requester_id, addressee_id, status, blocked_by, responded_at) VALUES (?, ?, 'blocked', ?, NOW())", [user.id, other, user.id]);
  publish(other, { type: "friends" });
  return ok(await friendsOverview(user.id));
});

/** Unblock (the friendship is gone; send a new request to reconnect). */
export const DELETE = handler(async (_request, params, user) => {
  const other = requireId(params.userId);
  const f = await friendshipBetween(user.id, other);
  if (!f || f.status !== "blocked" || f.blocked_by !== user.id) throw new HttpError("Not blocked.", 404);
  await execute("DELETE FROM friendships WHERE id = ?", [f.id]);
  return ok(await friendsOverview(user.id));
});
