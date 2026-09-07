import { attachmentCollectionRoutes } from "@/lib/attachment-routes";

/** Upload (multipart "files") and reorder ({ order: [ids] }) attachments of an info item. */
export const { POST, PUT } = attachmentCollectionRoutes("info");
