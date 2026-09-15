import { execute } from "@/lib/db";
import { handler, ok, requireId, HttpError } from "@/lib/api-utils";
import { conversationFor, assertManager, rotateInviteCode, inviteLink, inviteQr, systemMessage, broadcast } from "@/lib/chat";

async function managed(request, params, user) {
  const id = requireId(params.id);
  const convo = await conversationFor(id, user.id);
  assertManager(convo, "manage the invite link");
  return { id, convo, origin: request.nextUrl.origin };
}
const shape = async (origin, code) => (code ? { code, link: inviteLink(origin, code), qr: await inviteQr(origin, code) } : { code: null, link: null, qr: null });

/** The group's invite link (owner or admin): { code, link, qr } — all null while there is none. */
export const GET = handler(async (request, params, user) => {
  const { convo, origin } = await managed(request, params, user);
  return ok(await shape(origin, convo.invite_code));
});

/** Create the link, or replace it so old copies stop working (owner or admin). */
export const POST = handler(async (request, params, user) => {
  const { id, convo, origin } = await managed(request, params, user);
  const code = await rotateInviteCode(id);
  await systemMessage(convo, user.id, convo.invite_code ? "invite_reset" : "invite_on");
  broadcast(convo, { type: "conversation", conversation_id: id, action: "updated" });
  return ok(await shape(origin, code), { status: 201 });
});

/** Revoke the link: nobody can join with it any more (owner or admin). */
export const DELETE = handler(async (request, params, user) => {
  const { id, convo, origin } = await managed(request, params, user);
  if (!convo.invite_code) throw new HttpError("This group has no invite link.", 404);
  await execute("UPDATE conversations SET invite_code = NULL WHERE id = ?", [id]);
  await systemMessage(convo, user.id, "invite_off");
  broadcast(convo, { type: "conversation", conversation_id: id, action: "updated" });
  return ok(await shape(origin, null));
});
