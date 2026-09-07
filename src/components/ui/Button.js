"use client";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-white shadow-[0_6px_16px_-6px_var(--accent)] hover:bg-accent-strong active:translate-y-px",
  secondary: "bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong",
  outline: "bg-transparent text-fg border border-line hover:bg-surface-2",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
  subtle: "bg-accent/10 text-accent hover:bg-accent/15",
  danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-[0_6px_16px_-6px_#f43f5e]",
  dangerGhost: "bg-transparent text-rose-500 hover:bg-rose-500/10",
};

const sizes = {
  xs: "h-7 px-2 text-xs gap-1 rounded-[calc(var(--radius)*0.5)]",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-app-sm",
  md: "h-9 px-3.5 text-sm gap-2 rounded-app-sm",
  lg: "h-11 px-5 text-sm gap-2 rounded-app",
  icon: "h-9 w-9 text-sm rounded-app-sm",
  iconSm: "h-8 w-8 text-xs rounded-app-sm",
  iconXs: "h-7 w-7 text-xs rounded-[calc(var(--radius)*0.5)]",
};

const Button = forwardRef(function Button(
  { variant = "primary", size = "md", loading = false, icon: Icon, iconRight: IconRight, className, children, disabled, type = "button", ...props },
  ref
) {
  const iconSize = size === "xs" || size === "iconXs" ? 13 : size === "sm" || size === "iconSm" ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-all duration-150 focus-ring",
        "disabled:opacity-60 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} strokeWidth={2} /> : null}
      {children}
      {IconRight ? <IconRight size={iconSize} strokeWidth={2} /> : null}
    </button>
  );
});

export default Button;
