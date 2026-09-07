import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { saveFile } from "@/lib/uploads";
import { applyOrder, nextSortOrder } from "@/lib/ordering";
import { kindOf, ownedParent, listAttachments } from "@/lib/attachments";
import { notifyOwner } from "@/lib/notifications";

const MAX_BYTES = 50 * 1024 * 1024;

/** Builds POST (multipart upload) + PUT (reorder) handlers for /api/<parent>/[id]/attachments. */
export function attachmentCollectionRoutes(kind) {
  const meta = kindOf(kind);
  const POST = handler(async (request, params, user) => {
    const parentId = requireId(params.id);
    await ownedParent(kind, user.profile_id, parentId);
    const form = await request.formData();
    const files = form.getAll("files").filter((f) => typeof f === "object" && f.size > 0);
    if (!files.length) throw new HttpError("No files received.", 400);
    let order = await nextSortOrder(meta.table, parentId);
    for (const file of files) {
      if (file.size > MAX_BYTES) throw new HttpError(`${file.name} exceeds the 50 MB limit.`, 413);
      const { storedName, size } = await saveFile(file);
      await execute(
        `INSERT INTO ${meta.table} (${meta.parentCol}, stored_name, original_name, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        [parentId, storedName, file.name, file.type || null, size, order++]
      );
    }
    notifyOwner(user, {
      type: "attachment_added",
      title: `${files.length} file${files.length > 1 ? "s" : ""} attached to a ${kind}`,
      body: files.map((f) => f.name).join(", "),
      href: `/${meta.apiBase}/${parentId}`,
      entityType: kind,
      entityId: parentId,
    });
    return ok(await listAttachments(kind, parentId), { status: 201 });
  });

  const PUT = handler(async (request, params, user) => {
    const parentId = requireId(params.id);
    await ownedParent(kind, user.profile_id, parentId);
    const body = await readJson(request);
    if (!Array.isArray(body.order)) throw new HttpError("order must be an array of ids.", 400);
    await applyOrder(meta.table, parentId, body.order);
    return ok(await listAttachments(kind, parentId));
  });

  return { POST, PUT };
}
