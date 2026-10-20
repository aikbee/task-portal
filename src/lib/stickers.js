import PACK from "./sticker-pack.json";

/**
 * The sticker pack: all of Google's Animated Noto Emoji (CC BY 4.0), in tabs. Each entry is one sticker as the picker shows it:
 * e (the emoji a message holds), c (the codepoint its files are named after: public/stickers/noto/<c>.webp animated, <c>-s.webp the
 * still), m (one loop's length, ms), n (English names for search, "|" between them), t (its five skin tones, light to dark, each
 * [e, c, m]) and x (other variants: the mixed-tone handshakes). Generated from Google's list; the Android app carries the same file.
 * A message keeps the plain emoji, so the chat list, notifications, exports and older app versions show it as it is.
 */
export const STICKER_GROUPS = PACK.groups;
const ART = new Map();
for (const g of PACK.groups) for (const f of g.items) for (const [e, c, m] of [[f.e, f.c, f.m], ...(f.t || []), ...(f.x || [])]) ART.set(e, [c, m]);
/** Every sticker a message may hold (the server's check). */
export const STICKERS = new Set(ART.keys());
export const STICKER_CREDIT_URL = "https://creativecommons.org/licenses/by/4.0/";
/** The still and the animation of a sticker, and one loop's length; null for an emoji without art. */
export function stickerArt(emoji) {
  const a = ART.get(emoji);
  return a ? { still: `/stickers/noto/${a[0]}-s.webp`, anim: `/stickers/noto/${a[0]}.webp`, ms: a[1] } : null;
}
/** A sticker's English name, for its tooltip. */
export const stickerName = (f) => f.n.split("|")[0].replace(/-/g, " ");
/** The sticker with a skin tone picked (0 none, 1–5 light to dark), as the emoji to send. */
export const inTone = (f, tone) => (tone && f.t ? f.t[tone - 1][0] : f.e);
/** All of a sticker's variants for its long-press list: plain, the five tones, then the others. */
export const variantsOf = (f) => [f.e, ...(f.t || []).map((v) => v[0]), ...(f.x || []).map((v) => v[0])];
const ALL = PACK.groups.flatMap((g) => g.items);
/** Stickers whose names (or the emoji itself) contain every word of a search. */
export function searchStickers(q, limit = 120) {
  const words = String(q).toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return ALL.filter((f) => words.every((w) => f.n.replace(/-/g, " ").includes(w) || f.e === w)).slice(0, limit);
}
