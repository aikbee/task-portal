import { handler, ok, readJson } from "@/lib/api-utils";
import { offFor, SWITCHABLE_MODULES, FEATURES, MODULE_NEEDS } from "@/lib/access-control";
import { readDefaultAccess, saveDefaultAccess } from "@/lib/access-defaults";

const shape = (access) => {
  const off = offFor({ role: "user", module_access: access });
  return { user: null, access, effective: { modules_off: [...off.modules], features_off: [...off.features] }, modules: SWITCHABLE_MODULES, features: FEATURES, needs: MODULE_NEEDS };
};

/** Admin: what new accounts start with (same shape as /api/users/:id/access, without a user). */
export const GET = handler(async () => ok(shape(await readDefaultAccess())), { role: "admin" });

/** Admin: { modules_off, features_off }. Seeds accounts created from now on; existing people are not touched. */
export const PUT = handler(async (request, _params, user) => ok(shape(await saveDefaultAccess(await readJson(request), user.id))), { role: "admin" });
