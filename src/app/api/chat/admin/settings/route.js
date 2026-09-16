import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readChatSettings, saveChatSettings, publicChatSettings, purgeExpired, RETENTION_CHOICES } from "@/lib/chat";
import { GIF_PROVIDERS } from "@/lib/gifs";

/**
 * Admin: { max_retention_days?: null | 1 | 7 | 30 | 90 | 365, gif_provider?: null | "giphy" | "tenor", gif_api_key?: string }.
 * Fields left out keep their value; an empty gif_api_key clears the key. The key is stored server-side and never returned.
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
    await saveChatSettings({ max_retention_days: cap, gif_provider: provider, gif_api_key: key }, user.id);
    const purged = cap && cap !== current.max_retention_days ? await purgeExpired() : 0;
    return ok({ ...publicChatSettings(await readChatSettings()), purged });
  },
  { role: "admin" }
);
