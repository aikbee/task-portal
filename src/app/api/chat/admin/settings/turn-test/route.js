import { handler, ok, HttpError } from "@/lib/api-utils";
import { readChatSettings } from "@/lib/chat";
import { cloudflareIceServers, turnMode } from "@/lib/turn";

/** Admin: does the saved Cloudflare TURN key work? Asks for one-minute credentials and reports what came back — never the credentials. */
export const POST = handler(
  async () => {
    const settings = await readChatSettings();
    if (turnMode(settings) !== "cloudflare") throw new HttpError("Save a Cloudflare TURN key ID and API token first.", 400);
    try {
      const servers = await cloudflareIceServers(settings, { ttl: 60 });
      return ok({ ok: true, urls: servers.flatMap((s) => s.urls) });
    } catch (e) {
      throw new HttpError(e.message, 502);
    }
  },
  { role: "admin" }
);
