import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { encryptSecret, decryptSecret } from "./crypto";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from "./totp";

export const MFA_COOKIE = "ap_mfa"; // password verified, second factor pending (path /api/auth)
export const TOTP_SETUP_COOKIE = "ap_totp"; // secret shown to the user but not confirmed yet
export const TRUST_COOKIE = "ap_trust"; // "remember this browser" (path /)
export const MFA_MAX_ATTEMPTS = 5;
export const TRUST_DAYS = 30;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Two-factor status for Profile & password. */
export async function totpStatus(userId) {
  const row = await queryOne(
    `SELECT totp_enabled_at, (totp_secret IS NOT NULL) AS enabled,
       (SELECT COUNT(*) FROM recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS recovery_codes_left,
       (SELECT COUNT(*) FROM trusted_devices d WHERE d.user_id = u.id AND d.expires_at > NOW()) AS trusted_devices
     FROM users u WHERE u.id = ?`,
    [userId]
  );
  return { enabled: Boolean(row?.enabled), enabled_at: row?.totp_enabled_at ?? null, recovery_codes_left: Number(row?.recovery_codes_left ?? 0), trusted_devices: Number(row?.trusted_devices ?? 0) };
}

/** Replace the user's recovery codes; returns the plain codes (shown once). */
export async function issueRecoveryCodes(userId) {
  const codes = generateRecoveryCodes();
  await execute("DELETE FROM recovery_codes WHERE user_id = ?", [userId]);
  await execute(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ${codes.map(() => "(?, ?)").join(", ")}`, codes.flatMap((c) => [userId, hashRecoveryCode(c)]));
  return codes;
}

/**
 * Check a second factor for `user` (a users row with totp_secret / totp_last_step):
 * a 6-digit authenticator code (replay-protected) or an unused recovery code
 * (consumed on success). Returns { kind } or throws 400.
 */
export async function checkSecondFactor(user, code) {
  const raw = String(code ?? "").trim();
  if (!raw) throw new HttpError("Enter the code from your authenticator app.", 400);
  if (/^\d{6}$/.test(raw.replace(/\s+/g, ""))) {
    const step = verifyTotp(decryptSecret(user.totp_secret), raw, { lastStep: user.totp_last_step == null ? null : Number(user.totp_last_step) });
    if (step == null) throw new HttpError("That code is not valid. Codes change every 30 seconds — try the current one.", 400);
    await execute("UPDATE users SET totp_last_step = ? WHERE id = ?", [step, user.id]);
    return { kind: "totp" };
  }
  if (looksLikeRecoveryCode(raw)) {
    const r = await execute("UPDATE recovery_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL", [user.id, hashRecoveryCode(raw)]);
    if (r.affectedRows) return { kind: "recovery" };
    throw new HttpError("That recovery code is not valid or was already used.", 400);
  }
  throw new HttpError("Enter the 6-digit code from your authenticator app, or one of your recovery codes.", 400);
}

export async function enableTotp(userId, secret) {
  await execute("UPDATE users SET totp_secret = ?, totp_enabled_at = NOW(), totp_last_step = NULL WHERE id = ?", [encryptSecret(secret), userId]);
  return issueRecoveryCodes(userId);
}

/** Turn 2FA off: secret, recovery codes and trusted browsers all go. */
export async function disableTotp(userId) {
  await execute("UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?", [userId]);
  await execute("DELETE FROM recovery_codes WHERE user_id = ?", [userId]);
  await execute("DELETE FROM trusted_devices WHERE user_id = ?", [userId]);
}

/** Is this browser trusted to skip the second factor for `userId`? */
export async function isTrustedDevice(request, userId) {
  const raw = request.cookies.get(TRUST_COOKIE)?.value;
  if (!raw) return false;
  const dot = raw.indexOf(".");
  if (dot < 1) return false;
  const id = raw.slice(0, dot), token = raw.slice(dot + 1);
  if (!/^[a-f0-9]{48}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const row = await queryOne("SELECT id FROM trusted_devices WHERE id = ? AND user_id = ? AND token_hash = ? AND expires_at > NOW()", [id, userId, sha256(token)]);
  if (row) execute("UPDATE trusted_devices SET last_used_at = NOW() WHERE id = ?", [id]).catch(() => {});
  return Boolean(row);
}

/** Remember this browser for TRUST_DAYS; sets the cookie on `response`. */
export async function trustDevice(request, response, userId) {
  const id = crypto.randomBytes(24).toString("hex");
  const token = crypto.randomBytes(32).toString("hex");
  const ua = (request.headers.get("user-agent") || "").slice(0, 255) || null;
  await execute("INSERT INTO trusted_devices (id, user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))", [id, userId, sha256(token), ua, TRUST_DAYS]);
  response.cookies.set({ name: TRUST_COOKIE, value: `${id}.${token}`, httpOnly: true, sameSite: "lax", path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: TRUST_DAYS * 86400 });
}

export async function forgetTrustedDevices(userId) {
  await execute("DELETE FROM trusted_devices WHERE user_id = ?", [userId]);
}

export const listTrustedDevices = (userId) => query("SELECT id, user_agent, created_at, last_used_at, expires_at FROM trusted_devices WHERE user_id = ? AND expires_at > NOW() ORDER BY created_at DESC", [userId]);
