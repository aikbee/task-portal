"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover } from "./Popover";
import { useT } from "@/lib/i18n";

/**
 * options: [{ value, label, sub, color, render }]
 * value: array of option values
 */
export default function MultiSelect({ options = [], value = [], onChange, placeholder = "Select…", className, renderChip }) {
  const tr = useT();
  const [q, setQ] = useState("");
  const selected = useMemo(() => options.filter((o) => value.includes(o.value)), [options, value]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(s));
  }, [options, q]);

  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover
      className={cn("block w-full", className)}
      width="w-full"
      align="start"
      trigger={({ toggle: open, open: isOpen }) => (
        <button
          type="button"
          onClick={open}
          className={cn("control flex min-h-9 items-center gap-1.5 flex-wrap py-1.5 text-left", isOpen && "border-accent ring-2 ring-accent/25")}
        >
          {selected.length === 0 ? (
            <span className="text-fg-faint">{placeholder}</span>
          ) : (
            selected.map((o) => (
              <span
                key={o.value}
                className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-0.5 pl-1.5 pr-1 text-xs font-medium text-accent"
              >
                {o.color ? <span className="h-2 w-2 rounded-full" style={{ background: o.color }} /> : null}
                {renderChip ? renderChip(o) : o.label}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                  className="rounded-full p-0.5 hover:bg-accent/20"
                >
                  <X size={11} />
                </span>
              </span>
            ))
          )}
          <ChevronDown size={15} className="ml-auto text-fg-faint" />
        </button>
      )}
    >
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Search…")}
            className="control h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {filtered.length === 0 ? <p className="px-3 py-4 text-center text-xs text-fg-muted">{tr("No matches")}</p> : null}
        {filtered.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn("flex w-full items-center gap-2.5 rounded-app-sm px-2.5 py-2 text-left text-sm hover:bg-surface-2", on && "bg-accent/5")}
            >
              <span className={cn("grid h-4 w-4 place-items-center rounded-[5px] border", on ? "bg-accent border-accent text-white" : "border-line-strong")}>
                {on ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              {o.render ? (
                o.render(o)
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{tr(o.label)}</span>
                  {o.sub ? <span className="block truncate text-xs text-fg-muted">{o.sub}</span> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {value.length > 0 ? (
        <div className="border-t border-line p-1.5">
          <button type="button" onClick={() => onChange([])} className="w-full rounded-app-sm px-2 py-1.5 text-xs text-fg-muted hover:bg-surface-2">
            Clear selection
          </button>
        </div>
      ) : null}
    </Popover>
  );
}
