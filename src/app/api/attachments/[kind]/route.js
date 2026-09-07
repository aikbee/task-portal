import { GET as kindGet, PATCH as kindPatch, DELETE as kindDelete } from "./[id]/route";

/**
 * Legacy path: /api/attachments/:id (a task attachment id) → same as /api/attachments/task/:id.
 * The single segment lands in `kind`; we reinterpret it as the id.
 */
const legacy = (fn) => (request, context) =>
  fn(request, { params: Promise.resolve(context.params).then((p) => ({ kind: "task", id: p.kind })) });

export const GET = legacy(kindGet);
export const PATCH = legacy(kindPatch);
export const DELETE = legacy(kindDelete);
