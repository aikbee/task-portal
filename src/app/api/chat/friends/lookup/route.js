import { handler, ok, HttpError } from "@/lib/api-utils";
import { findByCode, friendshipBetween, relationOf } from "@/lib/chat";

/** Who owns a friend code (?code=), and where we stand — shown before sending a request. */
export const GET = handler(async (request, _params, user) => {
  const other = await findByCode(request.nextUrl.searchParams.get("code"));
  if (!other) throw new HttpError("No account matches that friend code.", 404);
  if (other.id === user.id) return ok({ user: other, relation: "self" });
  const f = await friendshipBetween(user.id, other.id);
  return ok({ user: other, relation: relationOf(f, user.id) });
});
