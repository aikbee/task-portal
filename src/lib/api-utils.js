import { rememberOrigin } from "./origin";
import { NextResponse } from "next/server";
import { HttpError } from "./http-error";
import { requireUser, requireRole } from "./auth";
import { assertAccess } from "./sharing";
import { bearerOf, badTokenWait, noteBadToken, requestIp } from "./api-tokens";
import { refusalFor, FEATURES } from "./access-control";

export { HttpError };

export function ok(data, init) {
  return NextResponse.json({ data }, init);
}

export function fail(message, status = 400, details, headers) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status, headers });
}
/** What a token's response tells the caller about its budget. */
const rateHeaders = (usage) => ({ "X-RateLimit-Limit": String(usage.limit), "X-RateLimit-Remaining": String(usage.remaining), "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + usage.reset) });

/**
 * Wrap a route handler: awaits params, enforces the session (unless
 * { auth: false }) and an optional role, and maps errors to HTTP statuses.
 * The handler receives (request, params, user).
 */
export function handler(fn, { auth = true, role } = {}) {
  return async (request, context) => {
    try {
      const params = context?.params ? await context.params : {};
      rememberOrigin(request);
      let user = null;
      const bearer = auth ? bearerOf(request) : null;
      if (bearer) {
        // an address that keeps sending wrong tokens waits before the database is asked again
        const wait = badTokenWait(requestIp(request));
        if (wait) throw new HttpError(`Too many wrong tokens from this address. Try again in ${wait} seconds.`, 429, { retry_after: wait }, { "Retry-After": String(wait) });
      }
      if (auth) {
        try {
          user = await requireUser(request);
        } catch (e) {
          if (bearer && e?.status === 401) noteBadToken(requestIp(request));
          throw e;
        }
        if (user.token) assertTokenMay(user, request.method, new URL(request.url).pathname);
        // modules and features an administrator turned off for this account
        const refused = refusalFor(user, request.method, new URL(request.url).pathname);
        if (refused) throw new HttpError(refused.kind === "module" ? "This module is turned off for your account." : `${FEATURES[refused.key]?.label ?? "This feature"} is turned off for your account.`, 403, { off: refused });
        if (role) requireRole(user, role);
        // inside a profile somebody shared with this user, the member's role decides what a workspace route allows
        if (user.access !== "owner") assertAccess(user, request.method, new URL(request.url).pathname);
      }
      const res = await fn(request, params, user);
      if (user?.token?.usage) for (const [k, v] of Object.entries(rateHeaders(user.token.usage))) res.headers.set(k, v);
      return res;
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status, err.details, err.headers);
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

// What an API token may not do, whatever the account behind it: account and administration routes, and
// writes on a read token. Everything else is the same API a browser session uses.
const TOKEN_DENIED = /^\/api\/(auth|tokens|users|mail|backups|settings|chat|push|profiles\/\d+\/(members|membership|transfer|webhooks|invites))(\/|$)/;
function assertTokenMay(user, method, pathname) {
  if (TOKEN_DENIED.test(pathname)) throw new HttpError("API tokens cannot use this route.", 403);
  if (user.token.scope === "read" && !["GET", "HEAD", "OPTIONS"].includes(method)) throw new HttpError("This token can only read.", 403);
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
