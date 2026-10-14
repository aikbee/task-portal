import { handler, ok, requireId } from "@/lib/api-utils";
import { HttpError } from "@/lib/http-error";
import { findAttachment, listAttachments } from "@/lib/attachments";
import { readStoredFile } from "@/lib/uploads";
import { moveToTrash } from "@/lib/trash";
import { logTask } from "@/lib/task-activity";
import { applyOrder } from "@/lib/ordering";
import { fileOut } from "../route";

async function fileOf(params, user) {
  const att = await findAttachment("task", requireId(params.fileId), user.profile_id);
  if (att.parent_id !== requireId(params.id)) throw new HttpError("Attachment not found.", 404);
  return att;
}

/** Download a file. */
export const GET = handler(async (_request, params, user) => {
  const att = await fileOf(params, user);
  const buf = await readStoredFile(att.stored_name);
  return new Response(buf, {
    headers: {
      "Content-Type": att.mime_type || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.original_name)}`,
      "Cache-Control": "private, max-age=0",
    },
  });
});

/** Remove a file (it goes to the recycle bin). Answers the files that are left. */
export const DELETE = handler(async (_request, params, user) => {
  const att = await fileOf(params, user);
  await moveToTrash(user, "task_attachment", att.id);
  await logTask(user, att.parent_id, { action: "attachment_removed", old: att.original_name });
  await applyOrder("task_attachments", att.parent_id, []);
  return ok((await listAttachments("task", att.parent_id)).map(fileOut(att.parent_id)));
});
