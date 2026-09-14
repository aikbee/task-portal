import { queryOne, execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { friendsOverview, publish, PEER_FIELDS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

/** Accept the request user :id sent me. */
export const POST = handler(async (_request, params, user) => {
  const other = requireId(params.id);
  const f = await queryOne("SELECT * FROM friendships WHERE status = 'pending' AND requester_id = ? AND addressee_id = ?", [other, user.id]);
  if (!f) throw new HttpError("Request not found.", 404);
  await execute("UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = ?", [f.id]);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  notify({ userId: other, type: "friend_accepted", title: `${me.name} accepted your friend request`, body: "You can message each other now.", href: "/chat", entityType: "user", entityId: user.id, actorId: user.id }).catch(() => {});
  publish(other, { type: "friends" });
  return ok(await friendsOverview(user.id));
});
