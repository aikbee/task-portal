import { attachmentCollectionRoutes } from "@/lib/attachment-routes";

/** Upload (multipart "files") and reorder ({ order: [ids] }) images placed on a draw board. */
export const { POST, PUT } = attachmentCollectionRoutes("drawboard");
