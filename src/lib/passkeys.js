import { query } from "./db";

export const PASSKEY_COOKIE = "ap_passkey";
export const PASSKEY_FIELDS = "id, name, device_type, backed_up, transports, created_at, last_used_at";
export const PASSKEY_ID_RE = /^[A-Za-z0-9_-]{16,255}$/;

export async function listPasskeys(userId) {
  const rows = await query(`SELECT ${PASSKEY_FIELDS} FROM passkeys WHERE user_id = ? ORDER BY created_at`, [userId]);
  return rows.map((r) => ({ ...r, backed_up: Boolean(r.backed_up), transports: r.transports ? r.transports.split(",") : [] }));
}

/** A stored row in the shape @simplewebauthn/server expects. */
export function toCredential(row) {
  return { id: row.id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports ? row.transports.split(",") : undefined };
}
