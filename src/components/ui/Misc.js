"use client";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={cn("animate-spin text-accent", className)} />;
}

export function Skeleton({ className }) {
  return <div className={cn("skeleton rounded-app-sm", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  const tr = useT();
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16", className)}>
      {Icon ? (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon size={22} />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-fg">{tr(title)}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-fg-muted">{typeof description === "string" ? tr(description) : description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children, className }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-fg-muted",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Divider({ className, label }) {
  if (!label) return <div className={cn("h-px w-full bg-line", className)} />;
  return (
    <div className={cn("flex items-center gap-3 text-[11px] uppercase tracking-wider text-fg-faint", className)}>
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function ProgressBar({ value = 0, color, className, size = "sm" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2.5", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color ?? "var(--accent)" }}
      />
    </div>
  );
}
