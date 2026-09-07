"use client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function Tabs({ tabs, value, onChange, className }) {
  const tr = useT();
  return (
    <div className={cn("flex items-center gap-1 border-b border-line", className)}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "relative -mb-px flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition",
              active ? "text-accent" : "text-fg-muted hover:text-fg"
            )}
          >
            {Icon ? <Icon size={15} /> : null}
            {tr(t.label)}
            {t.count != null ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-accent/15 text-accent" : "bg-surface-3 text-fg-muted")}>
                {t.count}
              </span>
            ) : null}
            {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}
