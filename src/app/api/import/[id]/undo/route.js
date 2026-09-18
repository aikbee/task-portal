import { handler, ok, requireId } from "@/lib/api-utils";
import { undoImport } from "@/lib/import";

/** Move everything an import created to the recycle bin (the importer within a day, or a manager). */
export const POST = handler(async (_request, params, user) => ok(await undoImport(user, requireId(params.id))));
