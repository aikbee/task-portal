import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { readApnsSettings, publicApnsSettings, saveApnsSettings, readP8, validTeamOrKeyId } from "@/lib/apns";

/** Admin: the key the portal sends iPhone notifications with (Apple's push service). The key itself is never returned. */
export const GET = handler(async () => ok(await publicApnsSettings(await readApnsSettings())), { role: "admin" });

/**
 * Admin: { team_id?, key_id?, key? } — fields left out keep their value; key is the text of the .p8 file, "" removes
 * it (and with it the iPhone notifications).
 */
export const PUT = handler(
  async (request, _params, user) => {
    const body = await readJson(request);
    const upper = (v) => String(v ?? "").trim().toUpperCase();
    const teamId = "team_id" in body ? upper(body.team_id) : undefined;
    const keyId = "key_id" in body ? upper(body.key_id) : undefined;
    if (teamId && !validTeamOrKeyId(teamId)) throw new HttpError("A Team ID is ten letters and digits (Membership details in the Apple Developer account).", 400);
    if (keyId && !validTeamOrKeyId(keyId)) throw new HttpError("A Key ID is ten letters and digits (it is also in the key's file name, AuthKey_<Key ID>.p8).", 400);
    let key;
    if ("key" in body) {
      if (body.key === "" || body.key === null) key = "";
      else {
        try { key = readP8(body.key); } catch (e) { throw new HttpError(e.message, 400); }
      }
    }
    const testHost = process.env.NODE_ENV !== "production" && typeof body.test_host === "string" ? body.test_host.trim() : undefined;
    await saveApnsSettings({ team_id: teamId, key_id: keyId, key, test_host: testHost }, user.id);
    return ok(await publicApnsSettings(await readApnsSettings()));
  },
  { role: "admin" }
);
