import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { readStoredFile, deleteStoredFile } from "@/lib/uploads";
import { setPosition, applyOrder } from "@/lib/ordering";
import { kindOf, findAttachment, listAttachments } from "@/lib/attachments";

/** Serve the file. ?download=1 forces a download. kind = task | requirement */
export const GET = handler(async (request, params, user) => {
  const att = await findAttachment(params.kind, requireId(params.id), user.profile_id);
  const buf = await readStoredFile(att.stored_name);
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(buf, {
    headers: {
      "Content-Type": att.mime_type || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(att.original_name)}`,
      "Cache-Control": "private, max-age=0",
    },
  });
});

/** Rename and/or move: { original_name?, position? } → ordered list for the parent */
export const PATCH = handler(async (request, params, user) => {
  const meta = kindOf(params.kind);
  const att = await findAttachment(params.kind, requireId(params.id), user.profile_id);
  const body = await readJson(request);
  if (typeof body.original_name === "string" && body.original_name.trim()) {
    await execute(`UPDATE ${meta.table} SET original_name = ? WHERE id = ?`, [body.original_name.trim().slice(0, 255), att.id]);
  }
  if (body.position != null) await setPosition(meta.table, att.parent_id, att.id, body.position);
  return ok(await listAttachments(params.kind, att.parent_id));
});

export const DELETE = handler(async (_req, params, user) => {
  const meta = kindOf(params.kind);
  const att = await findAttachment(params.kind, requireId(params.id), user.profile_id);
  await execute(`DELETE FROM ${meta.table} WHERE id = ?`, [att.id]);
  await deleteStoredFile(att.stored_name).catch(() => {});
  await applyOrder(meta.table, att.parent_id, []);
  return ok(await listAttachments(params.kind, att.parent_id));
});
