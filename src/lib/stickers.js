/**
 * The built-in sticker pack: Google's animated Noto Emoji, grouped for the picker. Shared by the picker and the server-side check.
 * The message keeps the plain emoji, so the chat list, notifications, exports and older app versions show it as it is.
 */
export const STICKER_PACK = [
  { key: "faces", label: "Faces", items: ["😀", "😂", "🤣", "😍", "🥰", "😎", "🤔", "😴", "🥳", "😭", "😡", "🤯", "🥺", "😇", "🤗", "🙃"] },
  { key: "hands", label: "Gestures", items: ["👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "🤞", "👌", "🫶", "👋", "🤙", "✊", "🖐️", "☝️"] },
  { key: "hearts", label: "Hearts & fun", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "🔥", "✨", "🎉", "🎊", "🏆", "🥇", "🎁"] },
  { key: "things", label: "Animals & things", items: ["🐕", "😺", "🐼", "🦄", "🐸", "🦊", "🍕", "🍔", "☕", "🍻", "🚀", "⚽", "👀", "🥱", "💡", "✅"] },
];
export const STICKERS = new Set(STICKER_PACK.flatMap((g) => g.items));
/**
 * Each sticker's art: the codepoint its files are named after (public/stickers/noto/<cp>.webp animated, <cp>-s.webp the still)
 * and how long one loop of the animation runs, in ms. Animated Noto Emoji by Google, CC BY 4.0 (resized and re-encoded, see the
 * LICENSE.txt there). A sticker from before the pack changed has no art and shows as the plain emoji.
 */
const ART = { "😀": ["1f600", 2100], "😂": ["1f602", 1770], "🤣": ["1f923", 900], "😍": ["1f60d", 1560], "🥰": ["1f970", 1470], "😎": ["1f60e", 2190], "🤔": ["1f914", 1800], "😴": ["1f634", 1800], "🥳": ["1f973", 1620], "😭": ["1f62d", 1800], "😡": ["1f621", 2700], "🤯": ["1f92f", 2610], "🥺": ["1f97a", 3090], "😇": ["1f607", 3090], "🤗": ["1f917", 1800], "🙃": ["1f643", 1590], "👍": ["1f44d", 720], "👎": ["1f44e", 780], "👏": ["1f44f", 660], "🙌": ["1f64c", 1414], "🙏": ["1f64f", 750], "💪": ["1f4aa", 1410], "🤝": ["1f91d", 1080], "✌️": ["270c_fe0f", 1656], "🤞": ["1f91e", 1680], "👌": ["1f44c", 810], "🫶": ["1faf6", 1290], "👋": ["1f44b", 1380], "🤙": ["1f919", 2310], "✊": ["270a", 1211], "🖐️": ["1f590_fe0f", 1482], "☝️": ["261d_fe0f", 1380], "❤️": ["2764_fe0f", 1800], "🧡": ["1f9e1", 1650], "💛": ["1f49b", 1650], "💚": ["1f49a", 1650], "💙": ["1f499", 1650], "💜": ["1f49c", 1650], "🖤": ["1f5a4", 1650], "💔": ["1f494", 2970], "💯": ["1f4af", 2040], "🔥": ["1f525", 990], "✨": ["2728", 1830], "🎉": ["1f389", 1380], "🎊": ["1f38a", 2160], "🏆": ["1f3c6", 2040], "🥇": ["1f947", 1800], "🎁": ["1f381", 2130], "🐕": ["1f415", 2100], "😺": ["1f63a", 2226], "🐼": ["1f43c", 2312], "🦄": ["1f984", 3427], "🐸": ["1f438", 3660], "🦊": ["1f98a", 1890], "🍕": ["1f355", 2100], "🍔": ["1f354", 2200], "☕": ["2615", 1830], "🍻": ["1f37b", 1590], "🚀": ["1f680", 600], "⚽": ["26bd", 1800], "👀": ["1f440", 1355], "🥱": ["1f971", 2130], "💡": ["1f4a1", 872], "✅": ["2705", 1310] };
export const STICKER_CREDIT_URL = "https://creativecommons.org/licenses/by/4.0/";
/** The still and the animation of a sticker, and one loop's length; null for an emoji without art. */
export function stickerArt(emoji) {
  const a = ART[emoji];
  return a ? { still: `/stickers/noto/${a[0]}-s.webp`, anim: `/stickers/noto/${a[0]}.webp`, ms: a[1] } : null;
}
