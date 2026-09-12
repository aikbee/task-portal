import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { BG_KEYS, DEFAULT_BG_SETTINGS, normaliseBgSettings } from "@/lib/backgrounds";

export async function readBgSettings() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'backgrounds'");
  const raw = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  return normaliseBgSettings(raw ?? DEFAULT_BG_SETTINGS);
}

/** Public: every screen (including the login page) needs to know which backgrounds are allowed. */
export const GET = handler(async () => ok(await readBgSettings()), { auth: false });

/** Admin: { enabled: [...keys], default: key, locked: boolean } */
export const PUT = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    if (!Array.isArray(body.enabled) || body.enabled.some((k) => !BG_KEYS.includes(k))) throw new HttpError("enabled must be a list of known background keys.", 400);
    if (!body.enabled.length) throw new HttpError("Keep at least one background enabled.", 400);
    if (!BG_KEYS.includes(body.default)) throw new HttpError("Unknown default background.", 400);
    if (!body.enabled.includes(body.default)) throw new HttpError("The default background must be one of the enabled ones.", 400);
    const value = normaliseBgSettings({ enabled: body.enabled, default: body.default, locked: Boolean(body.locked) });
    // remember which styles existed at save time so future additions show up enabled by default
    const stored = { ...value, known: BG_KEYS };
    await execute(
      "INSERT INTO app_settings (name, value, updated_by) VALUES ('backgrounds', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by",
      [JSON.stringify(stored), user.id]
    );
    return ok(value);
  },
  { role: "admin" }
);
