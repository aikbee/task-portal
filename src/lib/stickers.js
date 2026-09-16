/** The built-in sticker pack: big emoji, grouped for the picker. Shared by the picker and the server-side check. */
export const STICKER_PACK = [
  { key: "faces", label: "Faces", items: ["😀", "😂", "🤣", "😍", "🥰", "😎", "🤔", "😴", "🥳", "😭", "😡", "🤯", "🥺", "😇", "🤗", "🙃"] },
  { key: "hands", label: "Gestures", items: ["👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "🤞", "👌", "🫶", "👋", "🤙", "✊", "🖐️", "☝️"] },
  { key: "hearts", label: "Hearts & fun", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "🔥", "✨", "🎉", "🎊", "🏆", "🥇", "🎁"] },
  { key: "things", label: "Animals & things", items: ["🐶", "🐱", "🐼", "🦄", "🐸", "🦊", "🍕", "🍔", "☕", "🍺", "🚀", "⚽", "🎮", "💤", "📌", "✅"] },
];
export const STICKERS = new Set(STICKER_PACK.flatMap((g) => g.items));
