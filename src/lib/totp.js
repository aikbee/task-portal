import crypto from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 s) and recovery codes.
 * Pure Node so the smoke test can import it to compute codes.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 160-bit secret in base32 (what authenticator apps expect). */
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secret, step = currentStep()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The time step a code matches (current step ± `window`), or null. Steps at or before
 * `lastStep` are refused so a code that was already used cannot be replayed.
 */
export function verifyTotp(secret, code, { lastStep = null, window = 1, now = Date.now() } = {}) {
  const c = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const base = currentStep(now);
  for (let d = -window; d <= window; d++) {
    const step = base + d;
    if (lastStep != null && step <= lastStep) continue;
    if (same(totpCode(secret, step), c)) return step;
  }
  return null;
}

export function otpauthUri({ secret, account, issuer = "Task Portal" }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

/** Ten one-time recovery codes such as "k7m2p-9x4qz" (50 bits each). */
export function generateRecoveryCodes(n = 10) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
  return Array.from({ length: n }, () => {
    const bytes = crypto.randomBytes(10);
    let s = "";
    for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normaliseRecoveryCode = (code) => String(code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const looksLikeRecoveryCode = (code) => normaliseRecoveryCode(code).length === 10;
export const hashRecoveryCode = (code) => crypto.createHash("sha256").update(normaliseRecoveryCode(code)).digest("hex");
