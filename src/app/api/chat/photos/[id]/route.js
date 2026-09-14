import { handler, requireId } from "@/lib/api-utils";
import { readStoredFile } from "@/lib/uploads";
import { photoFor } from "@/lib/chat";

/** A chat photo, for members of its conversation. ?download=1 forces a download. */
export const GET = handler(async (request, params, user) => {
  const photo = await photoFor(requireId(params.id), user.id);
  const buf = await readStoredFile(photo.stored_name);
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(buf, {
    headers: {
      "Content-Type": photo.mime_type || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(photo.original_name)}`,
      // a sent photo never changes, so the browser may keep it (private: per signed-in user)
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
