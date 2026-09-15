import { Users } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { PRESET_BY_KEY, parseAvatar, presetBackground } from "@/lib/avatars";

const sizes = { xs: "h-6 w-6 text-[10px]", sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-16 w-16 text-lg" };
const glyph = { xs: 12, sm: 14, md: 18, lg: 22, xl: 30 };

/**
 * A person's (or group's) picture. `avatar` is the stored value: an uploaded photo, a preset icon,
 * "initials", or — for people — nothing, which means the default "pro" badge in their colour.
 * Objects without an `avatar` field (employees, projects…) keep plain initials.
 */
export default function Avatar({ name = "", color = "#6366f1", avatar, size = "md", className, ring = false, fallback = "initials" }) {
  const a = avatar === undefined ? { kind: "initials" } : parseAvatar(avatar);
  const base = cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white select-none", sizes[size], ring && "ring-2 ring-surface", className);
  if (a.kind === "upload") {
    return (
      <span className={cn(base, "bg-surface-3")} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={name} className="h-full w-full object-cover" draggable={false} />
      </span>
    );
  }
  const preset = a.kind === "preset" ? PRESET_BY_KEY[a.key] : a.kind === "default" && fallback === "pro" ? PRESET_BY_KEY.pro : null;
  if (preset) {
    const Icon = preset.Icon;
    return (
      <span className={cn(base, "avatar-preset")} style={{ background: presetBackground(preset, color) }} title={name}>
        <Icon size={glyph[size]} strokeWidth={2.2} className="drop-shadow-sm" />
      </span>
    );
  }
  if (a.kind === "default" && fallback === "group") {
    return (
      <span className={base} style={{ background: presetBackground(null, color) }} title={name}>
        <Users size={glyph[size] - 2} />
      </span>
    );
  }
  return (
    <span className={base} style={{ background: presetBackground(null, color) }} title={name}>
      {initials(name) || "?"}
    </span>
  );
}

export function AvatarStack({ people = [], max = 4, size = "sm" }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} avatar={p.avatar} size={size} ring />
      ))}
      {rest > 0 ? (
        <span className={cn("inline-grid place-items-center rounded-full bg-surface-3 text-fg-muted font-medium ring-2 ring-surface", sizes[size])}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
