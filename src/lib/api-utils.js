import { NextResponse } from "next/server";
import { HttpError } from "./http-error";
import { requireUser, requireRole } from "./auth";

export { HttpError };

export function ok(data, init) {
  return NextResponse.json({ data }, init);
}

export function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

/**
 * Wrap a route handler: awaits params, enforces the session (unless
 * { auth: false }) and an optional role, and maps errors to HTTP statuses.
 * The handler receives (request, params, user).
 */
export function handler(fn, { auth = true, role } = {}) {
  return async (request, context) => {
    try {
      const params = context?.params ? await context.params : {};
      let user = null;
      if (auth) {
        user = await requireUser(request);
        if (role) requireRole(user, role);
      }
      return await fn(request, params, user);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status, err.details);
      if (err?.code === "ER_DUP_ENTRY") return fail("A record with that unique value already exists.", 409);
      if (err?.code === "ER_NO_REFERENCED_ROW_2") return fail("Referenced record does not exist.", 400);
      if (err?.code === "ECONNREFUSED" || err?.code === "ER_BAD_DB_ERROR") {
        return fail("Database is not reachable. Run `npm run db:setup` and make sure MySQL is running.", 503);
      }
      console.error("[api]", err);
      return fail(err?.message || "Internal server error", 500);
    }
  };
}

export function requireId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError("Invalid id.", 400);
  return id;
}

export async function readJson(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

/** Pick + normalise fields from a body; empty strings become null. */
export function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    out[f] = v;
  }
  return out;
}

export function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] == null || obj[f] === "");
  if (missing.length) throw new HttpError(`Missing required field(s): ${missing.join(", ")}.`, 400, { missing });
}

export function oneOf(value, allowed, field) {
  if (value == null) return;
  if (!allowed.includes(value)) throw new HttpError(`Invalid ${field}: ${value}.`, 400);
}

/** Build a safe ORDER BY from ?sort=&dir= against an allow-list. */
export function orderBy(searchParams, allowed, fallback) {
  const sort = searchParams.get("sort");
  const dir = (searchParams.get("dir") || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const col = allowed[sort] ?? allowed[fallback];
  return `${col} ${dir}`;
}
