import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";

/** Personal API tokens: "tp_" + 40 url-safe characters, shown once, stored as a SHA-256 hash. */
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
export const TOKEN_SCOPES = ["read", "write"];
const SELECT = "SELECT id, name, prefix, scope, profile_id, last_used_at, expires_at, created_at FROM api_tokens";

export const listTokens = (userId) => query(`${SELECT} WHERE user_id = ? ORDER BY id DESC`, [userId]);

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
  return { token, row: await queryOne(`${SELECT} WHERE id = ?`, [res.insertId]) };
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

/** The live token row behind a bearer string (null when unknown or expired); stamps last_used_at now and then. */
export async function resolveToken(token) {
  const row = await queryOne("SELECT id, user_id, scope, profile_id, expires_at, last_used_at FROM api_tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > NOW())", [sha(token)]);
  if (!row) return null;
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 5 * 60000) execute("UPDATE api_tokens SET last_used_at = NOW() WHERE id = ?", [row.id]).catch(() => {});
  return row;
}
