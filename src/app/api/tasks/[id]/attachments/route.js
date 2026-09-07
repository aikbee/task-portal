import { attachmentCollectionRoutes } from "@/lib/attachment-routes";

/** Upload (multipart "files") and reorder ({ order: [ids] }) attachments of a task. */
export const { POST, PUT } = attachmentCollectionRoutes("task");
