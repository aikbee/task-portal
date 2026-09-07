"use client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const tones = {
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
  amber: "bg-amber-500/14 text-amber-700 dark:text-amber-300 ring-amber-500/25",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25",
  accent: "bg-accent/12 text-accent ring-accent/25",
};

const dots = {
  slate: "bg-slate-400",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
  accent: "bg-accent",
};

export default function Badge({ tone = "slate", dot = false, children, className, size = "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        tones[tone] ?? tones.slate,
        className
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone] ?? dots.slate)} /> : null}
      {children}
    </span>
  );
}

/** Renders a badge from a status map like TASK_STATUS. */
export function StatusBadge({ map, value, dot = true, size }) {
  const tr = useT();
  const meta = map[value] ?? { label: value ?? "—", tone: "slate" };
  return (
    <Badge tone={meta.tone} dot={dot} size={size}>
      {tr(meta.label)}
    </Badge>
  );
}
