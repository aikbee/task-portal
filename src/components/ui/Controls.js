"use client";
import { forwardRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("control h-9", className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn("control resize-y leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn("control h-9 appearance-none pr-9 cursor-pointer", className)} {...props}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint" />
    </div>
  );
});

export function Checkbox({ checked, onChange, label, className, indeterminate, ...props }) {
  return (
    <label className={cn("inline-flex items-center gap-2 cursor-pointer select-none text-sm", className)}>
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-[5px] border transition",
          checked || indeterminate ? "bg-accent border-accent text-white" : "border-line-strong bg-surface"
        )}
      >
        {indeterminate ? <span className="h-0.5 w-2 bg-white rounded" /> : checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={!!checked} onChange={(e) => onChange?.(e.target.checked, e)} {...props} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, className, size = "md" }) {
  const dims = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const move = size === "sm" ? "translate-x-4" : "translate-x-5";
  return (
    <label className={cn("flex items-center justify-between gap-4 cursor-pointer select-none", className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium text-fg">{label}</span> : null}
          {description ? <span className="block text-xs text-fg-muted">{description}</span> : null}
        </span>
      )}
      <span
        role="switch"
        aria-checked={!!checked}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange?.(!checked);
          }
        }}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus-ring",
          dims,
          checked ? "bg-accent" : "bg-line-strong"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 rounded-full bg-white shadow transition-transform duration-200",
            knob,
            checked ? move : "translate-x-0"
          )}
        />
      </span>
    </label>
  );
}

export function Field({ label, hint, error, required, children, className, htmlFor }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-muted">
          {label}
          {required ? <span className="text-rose-500"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-rose-500">{error}</p> : hint ? <p className="text-xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}

/** Segmented control: options [{value,label,icon}] */
export function Segmented({ options, value, onChange, className, size = "md" }) {
  return (
    <div className={cn("inline-flex rounded-app-sm border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)*0.5)] px-2.5 font-medium transition",
              size === "sm" ? "h-7 text-xs" : "h-8 text-xs",
              active ? "bg-surface text-fg shadow-sm border border-line" : "text-fg-muted hover:text-fg"
            )}
          >
            {Icon ? <Icon size={13} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
