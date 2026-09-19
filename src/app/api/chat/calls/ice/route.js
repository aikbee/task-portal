import { handler, ok } from "@/lib/api-utils";
import { readChatSettings } from "@/lib/chat";
import { iceServersForUser, turnMode } from "@/lib/turn";

/**
 * ICE servers for a call: public STUN, plus the relay an administrator configured — a TURN server of their own, or
 * Cloudflare's with credentials that are made for this account and expire after a few hours. Clients ask again for
 * every call rather than keeping the answer. `relay`: "cloudflare" | "static" | null.
 */
export const GET = handler(async (_request, _params, user) => {
  const settings = await readChatSettings();
  return ok({ iceServers: await iceServersForUser(settings, user.id), relay: turnMode(settings) });
});
