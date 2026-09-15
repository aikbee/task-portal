import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readChatSettings, saveChatSettings, purgeExpired, RETENTION_CHOICES } from "@/lib/chat";

/** Admin: { max_retention_days: null | 1 | 7 | 30 | 90 | 365 } — every chat's history is purged past this, whatever its own setting. */
export const PUT = handler(
  async (request, _params, user) => {
    const raw = (await readJson(request)).max_retention_days;
    const cap = raw == null || raw === "" || raw === 0 || raw === "0" ? null : Number(raw);
    if (cap != null && !RETENTION_CHOICES.includes(cap)) throw new HttpError(`max_retention_days must be one of ${RETENTION_CHOICES.join(", ")} or null.`, 400);
    await saveChatSettings({ max_retention_days: cap }, user.id);
    const purged = cap ? await purgeExpired() : 0;
    return ok({ ...(await readChatSettings()), purged });
  },
  { role: "admin" }
);
