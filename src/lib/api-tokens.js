import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";

/** Personal API tokens: "tp_" + 40 url-safe characters, shown once, stored as a SHA-256 hash. */
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
export const TOKEN_SCOPES = ["read", "write"];
const SELECT = "SELECT id, name, prefix, scope, profile_id, last_used_at, expires_at, day_start, day_count, total_count, created_at FROM api_tokens";

/** Requests a token may make: per minute and per UTC day (overridable with API_RATE_PER_MINUTE / API_RATE_PER_DAY). */
export const RATE = {
  perMinute: Math.max(1, Number(process.env.API_RATE_PER_MINUTE) || 60),
  perDay: Math.max(1, Number(process.env.API_RATE_PER_DAY) || 5000),
};
const BAD_TOKEN_LIMIT = 30; // wrong tokens from one address in ten minutes before it is told to wait
const BAD_TOKEN_WINDOW_MS = 10 * 60000;

const withUsage = (r) => ({ ...r, requests_today: r.day_start && String(r.day_start) === new Date().toISOString().slice(0, 10) ? Number(r.day_count) : 0, requests_total: Number(r.total_count), limits: RATE, day_start: undefined, day_count: undefined, total_count: undefined });
export const listTokens = async (userId) => (await query(`${SELECT} WHERE user_id = ? ORDER BY id DESC`, [userId])).map(withUsage);

/** { name, scope, profile_id?, days? } → { token (once), row }. At most 20 per person. */
export async function createToken(user, body) {
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError("Give the token a name, like the tool that will use it.", 400);
  const scope = TOKEN_SCOPES.includes(body.scope) ? body.scope : "read";
  const wanted = body.profile_id ? Number(body.profile_id) : null;
  if (wanted && !user.profiles.some((p) => p.id === wanted) && !user.shared_profiles.some((p) => p.id === wanted)) throw new HttpError("That profile is not yours to use.", 400);
  const days = body.days == null || body.days === "" ? null : Number(body.days);
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new HttpError("Expiry must be between 1 and 3650 days.", 400);
  const n = await queryOne("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?", [user.id]);
  if (Number(n?.n) >= 20) throw new HttpError("That is enough tokens: revoke one first.", 400);
  const token = `tp_${crypto.randomBytes(30).toString("base64url")}`;
  const res = await execute("INSERT INTO api_tokens (user_id, name, token_hash, prefix, scope, profile_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [user.id, name, sha(token), token.slice(0, 10), scope, wanted, days ? new Date(Date.now() + days * 86400000) : null]);
  return { token, row: withUsage(await queryOne(`${SELECT} WHERE id = ?`, [res.insertId])) };
}

export async function revokeToken(userId, id) {
  const res = await execute("DELETE FROM api_tokens WHERE id = ? AND user_id = ?", [id, userId]);
  if (!res.affectedRows) throw new HttpError("Token not found.", 404);
}

/** The bearer token of a request, or null. */
export function bearerOf(request) {
  const h = request?.headers?.get?.("authorization") ?? "";
  const m = /^Bearer\s+(tp_[A-Za-z0-9_-]{20,})$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * The live token row behind a bearer string (null when unknown or expired). Every call counts one request
 * against the minute and the day (one atomic UPDATE, so several processes agree); the counters come back as
 * `usage` and the caller decides whether the request is over the limit.
 */
export async function resolveToken(token) {
  const hash = sha(token);
  const bumped = await execute(
    `UPDATE api_tokens SET
       minute_count = IF(minute_start = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00'), minute_count + 1, 1),
       minute_start = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00'),
       day_count = IF(day_start = CURDATE(), day_count + 1, 1),
       day_start = CURDATE(),
       total_count = total_count + 1,
       last_used_at = NOW()
     WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > NOW())`,
    [hash]
  );
  if (!bumped.affectedRows) return null;
  const row = await queryOne("SELECT id, user_id, scope, profile_id, expires_at, minute_count, day_count FROM api_tokens WHERE token_hash = ?", [hash]);
  if (!row) return null;
  const now = new Date();
  const minuteReset = Math.ceil((60000 - (now.getTime() % 60000)) / 1000);
  const dayReset = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000);
  const overMinute = row.minute_count > RATE.perMinute;
  const overDay = row.day_count > RATE.perDay;
  const usage = {
    limit: overDay ? RATE.perDay : RATE.perMinute,
    remaining: overDay ? 0 : Math.max(0, RATE.perMinute - row.minute_count),
    reset: overDay ? dayReset : minuteReset,
    over: overMinute || overDay,
    retry_after: overDay ? dayReset : overMinute ? minuteReset : 0,
    scope: overDay ? "day" : "minute",
  };
  return { ...row, usage };
}

/* ---------- wrong tokens: an address that keeps guessing is told to wait ---------- */
const badByIp = globalThis.__badTokens ?? (globalThis.__badTokens = new Map());
function prune() {
  const cutoff = Date.now() - BAD_TOKEN_WINDOW_MS;
  for (const [ip, hits] of badByIp) {
    const keep = hits.filter((t) => t > cutoff);
    if (keep.length) badByIp.set(ip, keep);
    else badByIp.delete(ip);
  }
}
/** Seconds the address has to wait, or 0. */
export function badTokenWait(ip) {
  if (!ip) return 0;
  if (badByIp.size > 5000) prune();
  const hits = (badByIp.get(ip) ?? []).filter((t) => t > Date.now() - BAD_TOKEN_WINDOW_MS);
  return hits.length >= BAD_TOKEN_LIMIT ? Math.ceil((hits[0] + BAD_TOKEN_WINDOW_MS - Date.now()) / 1000) : 0;
}
export function noteBadToken(ip) {
  if (!ip) return;
  const hits = (badByIp.get(ip) ?? []).filter((t) => t > Date.now() - BAD_TOKEN_WINDOW_MS);
  hits.push(Date.now());
  badByIp.set(ip, hits);
}
/** The caller's address as the reverse proxy reports it (first X-Forwarded-For hop), else "local". */
export const requestIp = (request) => (request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "local").slice(0, 45);
