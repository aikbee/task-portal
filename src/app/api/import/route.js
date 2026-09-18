import { handler, ok, readJson } from "@/lib/api-utils";
import { resolveImport, commitImport } from "@/lib/import";

/**
 * Spreadsheet import: { kind, columns: [field|null per column], rows: [[cells]], options: { dry, create_missing,
 * skip_existing, date_order: "dmy"|"mdy" } }. With `dry` the answer is the preview (typed values and problems
 * per row); without it the clean rows are created and a batch id comes back for undo.
 */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  if (body.options?.dry) return ok(await resolveImport(user, body));
  return ok(await commitImport(user, body), { status: 201 });
});
