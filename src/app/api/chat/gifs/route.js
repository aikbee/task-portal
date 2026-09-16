import { handler, ok } from "@/lib/api-utils";
import { readChatSettings } from "@/lib/chat";
import { searchGifs } from "@/lib/gifs";

/**
 * GIF search for the sticker panel: ?q= (trending when empty) and ?pos= for the next page.
 * Answers { configured: false } until an administrator sets a GIPHY or Tenor key on the Moderation page.
 */
export const GET = handler(async (request) => {
  const sp = request.nextUrl.searchParams;
  return ok(await searchGifs(await readChatSettings(), sp.get("q") ?? "", sp.get("pos") ?? ""));
});
