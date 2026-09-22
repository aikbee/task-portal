import { handler, ok, requireId } from "@/lib/api-utils";
import { deleteRelease } from "@/lib/app-releases";

/** Admin: remove a build (phones that already have it keep it; the newest remaining one is offered from now on). */
export const DELETE = handler(async (_request, params) => ok({ id: (await deleteRelease(requireId(params.id))).id, deleted: true }), { role: "admin" });
