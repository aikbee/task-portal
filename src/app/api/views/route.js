import { handler, ok, readJson } from "@/lib/api-utils";
import { listViews, createView } from "@/lib/views";

/** ?module=tasks → my saved views in this profile plus the shared ones. */
export const GET = handler(async (request, _params, user) => ok(await listViews(user, request.nextUrl.searchParams.get("module") ?? "")));

/** { module, name, state, shared?, is_default? } */
export const POST = handler(async (request, _params, user) => {
  const body = await readJson(request);
  const id = await createView(user, body);
  return ok({ id, views: await listViews(user, body.module) }, { status: 201 });
});
