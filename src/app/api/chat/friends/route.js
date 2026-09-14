import { execute, queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { appOrigin } from "@/lib/auth-cookies";
import { ensureFriendCode, friendQr, friendLink, friendsOverview, findByCode, friendshipBetween, publish, PEER_FIELDS } from "@/lib/chat";
import { notify } from "@/lib/notifications";

/** My friend code + QR, friends, and pending requests both ways. */
export const GET = handler(async (request, _params, user) => {
  const code = await ensureFriendCode(user.id);
  const origin = appOrigin(request);
  return ok({ code, link: friendLink(origin, code), qr: await friendQr(origin, code), ...(await friendsOverview(user.id)) });
});

/** Send a friend request by code: { code }. If they already asked me, it becomes a friendship right away. */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const other = await findByCode(body.code);
  if (!other) throw new HttpError("No account matches that friend code.", 404);
  if (other.id === user.id) throw new HttpError("That is your own code.", 400);
  const existing = await friendshipBetween(user.id, other.id);
  if (existing?.status === "accepted") throw new HttpError(`You and ${other.name} are already friends.`, 409);
  if (existing?.status === "blocked") throw new HttpError("This person is not available.", 403);
  if (existing?.status === "pending" && existing.requester_id === user.id) throw new HttpError("Your request is still waiting for their answer.", 409);
  const me = await queryOne(`SELECT ${PEER_FIELDS} FROM users u WHERE u.id = ?`, [user.id]);
  if (existing?.status === "pending") {
    // they asked first: accept
    await execute("UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = ?", [existing.id]);
    notify({ userId: other.id, type: "friend_accepted", title: `${me.name} accepted your friend request`, body: "You can message each other now.", href: "/chat", entityType: "user", entityId: user.id, actorId: user.id }).catch(() => {});
    publish(other.id, { type: "friends" });
    publish(user.id, { type: "friends" });
    return ok({ status: "friends", user: other });
  }
  await execute("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')", [user.id, other.id]);
  notify({ userId: other.id, type: "friend_request", title: `${me.name} wants to be your friend`, body: "Accept the request on the Chat page to start messaging.", href: "/chat?tab=friends", entityType: "user", entityId: user.id, actorId: user.id }).catch(() => {});
  publish(other.id, { type: "friends" });
  return ok({ status: "requested", user: other }, { status: 201 });
});
