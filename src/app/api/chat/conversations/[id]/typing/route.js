import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { memberIdsOf, publish } from "@/lib/chat";

/** "I am typing" / "I stopped": { typing } — relayed live to the other members, never stored. */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const ids = await memberIdsOf(id, user.id);
  const typing = Boolean((await readJson(request)).typing);
  const event = { type: "typing", conversation_id: id, user_id: user.id, name: user.name, avatar_color: user.avatar_color, typing, at: Date.now() };
  for (const uid of ids) if (uid !== user.id) publish(uid, event);
  return ok({ typing });
});
