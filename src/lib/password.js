/**
 * Password hashing with Node's built-in scrypt. Plain Node module (no framework
 * imports) so the DB setup script can reuse it.
 * Stored format: scrypt$<N>$<salt b64>$<hash b64>
 */
import crypto from "node:crypto";

const N = 16384;
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, n, saltB64, hashB64] = String(stored).split("$");
    if (algo !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(n), r: 8, p: 1 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const PASSWORD_MIN = 6;
