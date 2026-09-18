import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { normaliseAccess, offFor, SWITCHABLE_MODULES, FEATURES, MODULE_NEEDS } from "@/lib/access-control";
import { notify } from "@/lib/notifications";

const find = async (id) => {
  const u = await queryOne("SELECT id, name, email, role, module_access FROM users WHERE id = ?", [id]);
  if (!u) throw new HttpError("User not found.", 404);
  return u;
};
const shape = (u) => {
  const access = normaliseAccess(u.module_access);
  const off = offFor(u);
  return { user: { id: u.id, name: u.name, email: u.email, role: u.role }, access, effective: { modules_off: [...off.modules], features_off: [...off.features] }, modules: SWITCHABLE_MODULES, features: FEATURES, needs: MODULE_NEEDS };
};

/** Admin: which modules and features are turned off for this account, plus what can be switched. */
export const GET = handler(async (_request, params) => ok(shape(await find(requireId(params.id)))), { role: "admin" });

/** Admin: { modules_off: [...], features_off: [...] } (unknown keys are dropped; empty lists = everything on). */
export const PUT = handler(
  async (request, params, me) => {
    const u = await find(requireId(params.id));
    const access = normaliseAccess(await readJson(request));
    const empty = !access.modules_off.length && !access.features_off.length;
    await execute("UPDATE users SET module_access = ? WHERE id = ?", [empty ? null : JSON.stringify(access), u.id]);
    const fresh = await find(u.id);
    const before = JSON.stringify(normaliseAccess(u.module_access));
    if (before !== JSON.stringify(access) && u.id !== me.id) {
      notify({ userId: u.id, type: "user_updated", title: "An administrator changed what you can use", body: empty ? "Everything is available to you again." : "Some modules or features were turned on or off for your account.", href: "/", entityType: "user", entityId: u.id, actorId: me.id, email: false }).catch(() => {});
    }
    return ok(shape(fresh));
  },
  { role: "admin" }
);
