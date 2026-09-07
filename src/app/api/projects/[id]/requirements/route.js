import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { applyOrder } from "@/lib/ordering";
import { getProject } from "../route";
import { listRequirements } from "../../../requirements/route";

/** Reorder a project's requirements: { order: [requirementId, ...] } → ordered list */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await getProject(id, user.profile_id);
  const body = await readJson(request);
  if (!Array.isArray(body.order)) throw new HttpError("order must be an array of ids.", 400);
  await applyOrder("requirements", id, body.order);
  return ok(await listRequirements(user.profile_id, { project_id: id }));
});
