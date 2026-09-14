import { handler, requireId } from "@/lib/api-utils";
import { readStoredFile } from "@/lib/uploads";
import { photoFor, INLINE_MIMES } from "@/lib/chat";

/** A chat photo, voice note or file, for members of its conversation. ?download=1 forces a download; byte ranges are honoured so audio can seek. */
export const GET = handler(async (request, params, user) => {
  const file = await photoFor(requireId(params.id), user.id);
  const buf = await readStoredFile(file.stored_name);
  const mime = file.mime_type || "application/octet-stream";
  // only well-known media, PDFs and plain text open in the tab; everything else (HTML, SVG, scripts…) downloads
  const inline = request.nextUrl.searchParams.get("download") !== "1" && INLINE_MIMES.has(mime);
  const headers = {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
    // a sent file never changes, so the browser may keep it (private: per signed-in user)
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (range && buf.length) {
    let start = range[1] === "" ? Math.max(0, buf.length - Number(range[2])) : Number(range[1]);
    let end = range[1] !== "" && range[2] !== "" ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= buf.length) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
    }
    const slice = buf.subarray(start, end + 1);
    return new Response(slice, { status: 206, headers: { ...headers, "Content-Length": String(slice.length), "Content-Range": `bytes ${start}-${end}/${buf.length}` } });
  }
  return new Response(buf, { headers: { ...headers, "Content-Length": String(buf.length) } });
});
