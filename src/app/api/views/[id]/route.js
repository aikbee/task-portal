import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { updateView, deleteView, listViews } from "@/lib/views";

/** { name?, state?, shared?, is_default? } */
export const PUT = handler(async (request, params, user) => {
  const view = await updateView(user, requireId(params.id), await readJson(request));
  return ok({ view, views: await listViews(user, view.module) });
});

export const DELETE = handler(async (_request, params, user) => {
  const gone = await deleteView(user, requireId(params.id));
  return ok({ ...gone, views: await listViews(user, gone.module) });
});
