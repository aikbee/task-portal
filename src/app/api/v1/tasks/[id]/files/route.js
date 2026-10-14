import { handler, ok, requireId } from "@/lib/api-utils";
import { getTask } from "@/app/api/tasks/[id]/route";
import { listAttachments } from "@/lib/attachments";
import { uploadAttachments } from "@/lib/attachment-routes";
import { idempotent } from "@/lib/api-v1";
import { lastOrigin } from "@/lib/origin";

export const fileOut = (taskId) => (a) => ({
  id: a.id,
  name: a.original_name,
  size: Number(a.size_bytes),
  type: a.mime_type ?? null,
  created_at: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at,
  download_url: `${lastOrigin()}/api/v1/tasks/${taskId}/files/${a.id}`,
});

/** Files attached to a task. */
export const GET = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  return ok((await listAttachments("task", id)).map(fileOut(id)));
});

/** Attach files: multipart/form-data, one or more parts named "files" (50 MB each). Answers every file of the task. */
export const POST = handler(async (request, params, user) =>
  idempotent(request, user, async () => {
    const id = requireId(params.id);
    await getTask(id, user.profile_id);
    const form = await request.formData();
    return ok((await uploadAttachments(user, "task", id, form.getAll("files"))).map(fileOut(id)), { status: 201 });
  })
);
