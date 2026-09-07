import crypto from "node:crypto";

/** AES-256-GCM for small secrets. Key = DATA_KEY (preferred) or derived from SESSION_SECRET. */
function key() {
  const raw = process.env.DATA_KEY || `${process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me"}:info-vault`;
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  const [v, ivB64, tagB64, encB64] = String(stored).split(".");
  if (v !== "v1") throw new Error("Unsupported secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}
