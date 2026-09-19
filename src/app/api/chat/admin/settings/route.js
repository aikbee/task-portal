import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readChatSettings, saveChatSettings, publicChatSettings, purgeExpired, RETENTION_CHOICES } from "@/lib/chat";
import { GIF_PROVIDERS } from "@/lib/gifs";
import { forgetTurnCache } from "@/lib/turn";

/**
 * Admin: { max_retention_days?: null | 1 | 7 | 30 | 90 | 365, gif_provider?: null | "giphy" | "tenor", gif_api_key?: string,
 *          turn_url?: "turn(s):…", turn_username?: string, turn_credential?: string,
 *          cf_turn_key_id?: string, cf_turn_token?: string }  (Cloudflare Realtime TURN; it wins over turn_url when both are set).
 * Fields left out keep their value; an empty string clears a secret. Secrets are stored server-side and never returned.
 */
export const PUT = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    const current = await readChatSettings();
    let cap = current.max_retention_days;
    if ("max_retention_days" in body) {
      const raw = body.max_retention_days;
      cap = raw == null || raw === "" || raw === 0 || raw === "0" ? null : Number(raw);
      if (cap != null && !RETENTION_CHOICES.includes(cap)) throw new HttpError(`max_retention_days must be one of ${RETENTION_CHOICES.join(", ")} or null.`, 400);
    }
    let provider = current.gif_provider;
    if ("gif_provider" in body) {
      provider = body.gif_provider ? String(body.gif_provider) : null;
      if (provider && !GIF_PROVIDERS.includes(provider)) throw new HttpError("gif_provider must be giphy, tenor or null.", 400);
    }
    let key = current.gif_api_key;
    if ("gif_api_key" in body) key = String(body.gif_api_key ?? "").trim().slice(0, 200) || null;
    let turnUrl = current.turn_url;
    if ("turn_url" in body) {
      turnUrl = String(body.turn_url ?? "").trim().slice(0, 300) || null;
      if (turnUrl && !/^turns?:/i.test(turnUrl)) throw new HttpError("turn_url must start with turn: or turns:.", 400);
    }
    let turnUser = current.turn_username;
    if ("turn_username" in body) turnUser = String(body.turn_username ?? "").trim().slice(0, 200) || null;
    let turnCred = current.turn_credential;
    if ("turn_credential" in body) turnCred = String(body.turn_credential ?? "").trim().slice(0, 200) || null;
    if (!turnUrl) turnUser = turnCred = null; // no server, no credentials to keep
    let cfKey = current.cf_turn_key_id;
    if ("cf_turn_key_id" in body) {
      cfKey = String(body.cf_turn_key_id ?? "").trim().slice(0, 100) || null;
      if (cfKey && !/^[A-Za-z0-9_-]{8,100}$/.test(cfKey)) throw new HttpError("That does not look like a Cloudflare TURN key ID.", 400);
    }
    let cfToken = current.cf_turn_token;
    if ("cf_turn_token" in body) cfToken = String(body.cf_turn_token ?? "").trim().slice(0, 300) || null;
    if (!cfKey) cfToken = null; // no key, no token to keep
    let cfApi = current.cf_turn_api;
    if ("cf_turn_api" in body && process.env.NODE_ENV !== "production") cfApi = String(body.cf_turn_api ?? "").trim().slice(0, 200) || null;
    forgetTurnCache();
    await saveChatSettings({ max_retention_days: cap, gif_provider: provider, gif_api_key: key, turn_url: turnUrl, turn_username: turnUser, turn_credential: turnCred, cf_turn_key_id: cfKey, cf_turn_token: cfToken, ...(cfApi ? { cf_turn_api: cfApi } : {}) }, user.id);
    const purged = cap && cap !== current.max_retention_days ? await purgeExpired() : 0;
    return ok({ ...publicChatSettings(await readChatSettings()), purged });
  },
  { role: "admin" }
);
