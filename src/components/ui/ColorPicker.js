"use client";
import { Check } from "lucide-react";
import { PALETTE } from "@/lib/modules";
import { cn } from "@/lib/utils";

export default function ColorPicker({ value, onChange, colors = PALETTE, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn("grid h-7 w-7 place-items-center rounded-full text-white transition hover:scale-110", value === c && "ring-2 ring-offset-2 ring-offset-surface")}
          style={{ background: c, "--tw-ring-color": c }}
          aria-label={c}
        >
          {value === c ? <Check size={14} strokeWidth={3} /> : null}
        </button>
      ))}
      <label className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-[10px] text-fg-muted" title="Custom">
        <input type="color" value={value || "#6366f1"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        +
      </label>
    </div>
  );
}
