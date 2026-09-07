import { queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { decryptSecret } from "@/lib/crypto";
import { verifySensitive } from "@/lib/verify";

/**
 * Reveal a stored secret. Body: { pin } or { password } — or nothing when this
 * session was verified in the last 10 minutes. 401 with details.needs otherwise.
 */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const body = await readJson(request).catch(() => ({}));
  const row = await queryOne("SELECT secret_enc FROM info_items WHERE id = ? AND profile_id = ?", [id, user.profile_id]);
  if (!row) throw new HttpError("Info item not found.", 404);
  const { unlockedUntil } = await verifySensitive(user, { pin: body.pin, password: body.password });
  if (!row.secret_enc) return ok({ secret: null, unlocked_until: unlockedUntil });
  try {
    return ok({ secret: decryptSecret(row.secret_enc), unlocked_until: unlockedUntil });
  } catch {
    throw new HttpError("The stored secret cannot be decrypted with the current DATA_KEY.", 409);
  }
});
