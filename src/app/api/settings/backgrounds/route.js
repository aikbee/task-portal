import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { BG_KEYS, BG_LANGS, BG_TITLE_MAX, BG_DESC_MAX, DEFAULT_BG_SETTINGS, normaliseBgSettings } from "@/lib/backgrounds";

export async function readBgSettings() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'backgrounds'");
  const raw = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  return normaliseBgSettings(raw ?? DEFAULT_BG_SETTINGS);
}

/** Public: every screen (including the login page) needs to know which backgrounds are allowed. */
export const GET = handler(async () => ok(await readBgSettings()), { auth: false });

/**
 * Admin: { enabled: [...keys], default: key, locked: boolean, order?: [...keys], names?: { key: { title: { en, zh }, desc: { en, zh } } } }.
 * `order` and `names` are kept as they are when left out; a blank text means the built-in one.
 */
export const PUT = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    if (!Array.isArray(body.enabled) || body.enabled.some((k) => !BG_KEYS.includes(k))) throw new HttpError("enabled must be a list of known background keys.", 400);
    if (!body.enabled.length) throw new HttpError("Keep at least one background enabled.", 400);
    if (!BG_KEYS.includes(body.default)) throw new HttpError("Unknown default background.", 400);
    if (!body.enabled.includes(body.default)) throw new HttpError("The default background must be one of the enabled ones.", 400);
    if (body.order !== undefined && !Array.isArray(body.order)) throw new HttpError("order must be a list of background keys.", 400);
    if (body.names !== undefined && (!body.names || typeof body.names !== "object" || Array.isArray(body.names))) throw new HttpError("names must be an object keyed by background.", 400);
    for (const n of Object.values(body.names ?? {})) {
      for (const lang of BG_LANGS) {
        if (String(n?.title?.[lang] ?? "").trim().length > BG_TITLE_MAX) throw new HttpError(`A title can have at most ${BG_TITLE_MAX} characters.`, 400);
        if (String(n?.desc?.[lang] ?? "").trim().length > BG_DESC_MAX) throw new HttpError(`A description can have at most ${BG_DESC_MAX} characters.`, 400);
      }
    }
    const current = await readBgSettings();
    const value = normaliseBgSettings({
      enabled: body.enabled, default: body.default, locked: Boolean(body.locked),
      order: body.order ?? current.order, names: body.names ?? current.names,
    });
    // remember which styles existed at save time so future additions show up enabled by default; an order is kept
    // only when the admin changed it (then styles added later come last), otherwise new styles stay where they were put
    const stored = { ...value, order: value.order.join() === BG_KEYS.join() ? undefined : value.order, known: BG_KEYS };
    await execute(
      "INSERT INTO app_settings (name, value, updated_by) VALUES ('backgrounds', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by",
      [JSON.stringify(stored), user.id]
    );
    return ok(value);
  },
  { role: "admin" }
);
