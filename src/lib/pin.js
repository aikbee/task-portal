/**
 * Local lock-screen PIN helpers. The PIN is stored as a salted SHA-256 hash in
 * localStorage. This is a convenience lock for a shared screen, not a security
 * boundary — anyone with access to the browser profile can clear it.
 */
export function randomSalt() {
  const bytes = new Uint8Array(12);
  (globalThis.crypto ?? {}).getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || String(Date.now());
}

export async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // fallback (non-secure contexts): FNV-1a, still avoids storing the PIN in clear text
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "fnv:" + h.toString(16);
}

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const isValidPin = (pin) => /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX;
