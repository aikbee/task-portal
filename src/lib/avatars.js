import { Crown, Rocket, Star, Zap, Flame, Leaf, Waves, Sun, Moon, Heart, Cat, Dog, Bird, Fish, Bug, Ghost, Bot, Gamepad2, Music, Camera, Coffee, Palette, ShieldCheck, Sparkles, Users } from "lucide-react";
import { AVATAR_PRESETS, parseAvatar } from "./avatar-presets";

const ICONS = { Crown, Rocket, Star, Zap, Flame, Leaf, Waves, Sun, Moon, Heart, Cat, Dog, Bird, Fish, Bug, Ghost, Bot, Gamepad2, Music, Camera, Coffee, Palette, ShieldCheck, Sparkles, Users };
export const PRESETS = AVATAR_PRESETS.map((p) => ({ ...p, Icon: ICONS[p.icon] ?? Star }));
export const PRESET_BY_KEY = Object.fromEntries(PRESETS.map((p) => [p.key, p]));
export { parseAvatar };

/** CSS background for a preset badge; `pro` (no palette) takes the owner's colour. */
export function presetBackground(preset, color = "#6366f1") {
  const from = preset?.from ?? color;
  const to = preset?.to ?? `color-mix(in oklab, ${color} 70%, black)`;
  return `linear-gradient(135deg, ${from}, ${to})`;
}
