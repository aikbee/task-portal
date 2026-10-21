import { queryOne } from "@/lib/db";
import { handler, requireId, HttpError } from "@/lib/api-utils";
import { readStoredFile } from "@/lib/uploads";
import { imageMeta } from "@/lib/images";
import { parseAvatar } from "@/lib/avatar-presets";

/**
 * An uploaded profile picture (kind "user") or group picture (kind "group", members only). A person's picture needs
 * the file name the portal hands out with it (?v=…): whoever was shown the person has it, while trying account
 * numbers one after another finds nothing (anyone can make an account).
 */
export const GET = handler(async (request, params, user) => {
  const id = requireId(params.id);
  let value = null;
  if (params.kind === "user") value = (await queryOne("SELECT avatar FROM users WHERE id = ?", [id]))?.avatar ?? null;
  else if (params.kind === "group") value = (await queryOne("SELECT c.avatar FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ? WHERE c.id = ?", [user.id, id]))?.avatar ?? null;
  else throw new HttpError("Not found.", 404);
  const a = parseAvatar(value);
  if (a.kind !== "upload") throw new HttpError("No picture.", 404);
  if (params.kind === "user" && id !== user.id && new URL(request.url).searchParams.get("v") !== a.stored) throw new HttpError("No picture.", 404);
  const buf = await readStoredFile(a.stored).catch(() => null);
  if (!buf) throw new HttpError("No picture.", 404);
  return new Response(buf, {
    headers: {
      "Content-Type": imageMeta(buf)?.mime || "application/octet-stream",
      "Content-Length": String(buf.length),
      "X-Content-Type-Options": "nosniff",
      // the URL carries the file name, so a new upload is a new URL: safe to cache for a day
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
});
