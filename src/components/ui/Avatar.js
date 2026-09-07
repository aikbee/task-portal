import { cn, initials } from "@/lib/utils";

const sizes = { xs: "h-6 w-6 text-[10px]", sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-16 w-16 text-lg" };

export default function Avatar({ name = "", color = "#6366f1", size = "md", className, ring = false }) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none",
        sizes[size],
        ring && "ring-2 ring-surface",
        className
      )}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}
      title={name}
    >
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
        <Avatar key={p.id} name={p.name} color={p.color} size={size} ring />
      ))}
      {rest > 0 ? (
        <span className={cn("inline-grid place-items-center rounded-full bg-surface-3 text-fg-muted font-medium ring-2 ring-surface", sizes[size])}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
