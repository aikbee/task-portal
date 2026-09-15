/**
 * Profile-picture presets shared by the server (validation) and the client (rendering).
 * `from`/`to` null means the badge is tinted with the owner's own colour, so the default "pro"
 * icon still tells people apart in lists.
 */
export const AVATAR_PRESETS = [
  { key: "pro", label: "Pro", icon: "Crown", from: null, to: null },
  { key: "rocket", label: "Rocket", icon: "Rocket", from: "#6366f1", to: "#0ea5e9" },
  { key: "star", label: "Star", icon: "Star", from: "#f59e0b", to: "#f97316" },
  { key: "bolt", label: "Bolt", icon: "Zap", from: "#eab308", to: "#ef4444" },
  { key: "flame", label: "Flame", icon: "Flame", from: "#f97316", to: "#dc2626" },
  { key: "leaf", label: "Leaf", icon: "Leaf", from: "#22c55e", to: "#0d9488" },
  { key: "wave", label: "Wave", icon: "Waves", from: "#06b6d4", to: "#2563eb" },
  { key: "sun", label: "Sun", icon: "Sun", from: "#fbbf24", to: "#f43f5e" },
  { key: "moon", label: "Moon", icon: "Moon", from: "#4f46e5", to: "#0f172a" },
  { key: "heart", label: "Heart", icon: "Heart", from: "#ec4899", to: "#be123c" },
  { key: "cat", label: "Cat", icon: "Cat", from: "#a855f7", to: "#6d28d9" },
  { key: "dog", label: "Dog", icon: "Dog", from: "#d97706", to: "#78350f" },
  { key: "bird", label: "Bird", icon: "Bird", from: "#38bdf8", to: "#1d4ed8" },
  { key: "fish", label: "Fish", icon: "Fish", from: "#14b8a6", to: "#0e7490" },
  { key: "bug", label: "Bug", icon: "Bug", from: "#84cc16", to: "#166534" },
  { key: "ghost", label: "Ghost", icon: "Ghost", from: "#94a3b8", to: "#334155" },
  { key: "robot", label: "Robot", icon: "Bot", from: "#64748b", to: "#0f172a" },
  { key: "gamepad", label: "Gamer", icon: "Gamepad2", from: "#8b5cf6", to: "#db2777" },
  { key: "music", label: "Music", icon: "Music", from: "#f43f5e", to: "#7c3aed" },
  { key: "camera", label: "Camera", icon: "Camera", from: "#0ea5e9", to: "#4338ca" },
  { key: "coffee", label: "Coffee", icon: "Coffee", from: "#a16207", to: "#451a03" },
  { key: "palette", label: "Palette", icon: "Palette", from: "#ec4899", to: "#0ea5e9" },
  { key: "shield", label: "Shield", icon: "ShieldCheck", from: "#10b981", to: "#1e3a8a" },
  { key: "sparkles", label: "Sparkles", icon: "Sparkles", from: "#c084fc", to: "#f0abfc" },
];
export const PRESET_KEYS = new Set(AVATAR_PRESETS.map((p) => p.key));
export const DEFAULT_AVATAR = "preset:pro";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Interpret a stored avatar value. */
export function parseAvatar(value) {
  if (value == null) return { kind: "default" };
  const v = String(value);
  if (v === "initials") return { kind: "initials" };
  if (v.startsWith("preset:")) {
    const key = v.slice(7);
    return PRESET_KEYS.has(key) ? { kind: "preset", key } : { kind: "default" };
  }
  const m = /^upload:(user|group):(\d+):([\w.-]+)$/.exec(v);
  if (m) return { kind: "upload", owner: m[1], id: Number(m[2]), stored: m[3], url: `/api/avatars/${m[1]}/${m[2]}?v=${encodeURIComponent(m[3])}` };
  return { kind: "default" };
}
/** The stored file name behind an uploaded avatar value, or null. */
export const uploadedFileOf = (value) => (parseAvatar(value).kind === "upload" ? parseAvatar(value).stored : null);
