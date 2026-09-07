import { attachmentCollectionRoutes } from "@/lib/attachment-routes";

/** Upload (multipart "files") and reorder ({ order: [ids] }) attachments of a requirement. */
export const { POST, PUT } = attachmentCollectionRoutes("requirement");
