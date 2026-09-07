"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";

const GAP = 6;

/**
 * Popover: renders `trigger({ open, toggle, close })` and a floating panel.
 * The panel is portalled to <body> with fixed positioning, so it is never
 * clipped by scrolling or overflow-hidden ancestors (tables, cards, modals).
 * It flips above the trigger when there is more room there and scrolls
 * internally when taller than the available space.
 *
 * width: a Tailwind width class (e.g. "w-64"), a number of pixels, or
 *        "w-full" to match the trigger's width.
 */
export function Popover({ trigger, children, align = "end", side = "bottom", width = "w-64", open: openProp, onOpenChange, className, panelClassName }) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const anchorRef = useRef(null);
  const panelRef = useRef(null);

  const setOpen = useCallback(
    (v) => {
      if (!controlled) setOpenState(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange]
  );

  // Position the panel from the trigger's rect (DOM writes only, no React state).
  const position = useCallback(() => {
    const a = anchorRef.current;
    const p = panelRef.current;
    if (!a || !p) return;
    const st = computeStyle(a.getBoundingClientRect(), { align, side, width });
    Object.assign(p.style, { top: "", bottom: "", left: "", right: "", transform: "", width: "" });
    for (const [k, v] of Object.entries(st)) p.style[k] = typeof v === "number" ? `${v}px` : v;
  }, [align, side, width]);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  // close on outside click / follow the trigger on scroll & resize
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position, setOpen]);

  const widthClass = typeof width === "string" && width !== "w-full" ? width : undefined;
  const close = () => setOpen(false);

  return (
    <div ref={anchorRef} className={cn("relative inline-block", className)}>
      {trigger({ open, toggle: () => setOpen(!open), close })}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                "fixed z-[120] overflow-y-auto overflow-x-hidden rounded-app border border-line bg-surface shadow-app-lg anim-pop",
                widthClass,
                panelClassName
              )}
            >
              {typeof children === "function" ? children({ close }) : children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function computeStyle(r, { align, side, width }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const style = { maxWidth: vw - 16 };
  if (typeof width === "number") style.width = width;
  else if (width === "w-full") style.width = r.width;

  if (side === "right") {
    style.left = Math.min(r.right + GAP + 2, vw - 8);
    style.top = Math.max(8, Math.min(r.top, vh - 8));
    style.maxHeight = vh - style.top - 8;
    return style;
  }

  const spaceBelow = vh - r.bottom - GAP;
  const spaceAbove = r.top - GAP;
  const above = side === "top" ? spaceAbove >= 120 || spaceAbove > spaceBelow : spaceBelow < 260 && spaceAbove > spaceBelow;
  if (above) {
    style.bottom = vh - r.top + GAP;
    style.maxHeight = Math.max(120, spaceAbove - 8);
  } else {
    style.top = r.bottom + GAP;
    style.maxHeight = Math.max(120, spaceBelow - 8);
  }

  if (align === "end") style.right = Math.max(8, vw - r.right);
  else if (align === "center") {
    style.left = r.left + r.width / 2;
    style.transform = "translateX(-50%)";
  } else style.left = Math.max(8, r.left);
  return style;
}

/** Menu of items: [{ label, icon, onClick, href, danger, disabled, divider, hint }] */
export function DropdownMenu({ trigger, items, align = "end", side = "bottom", width = "w-52" }) {
  return (
    <Popover trigger={trigger} align={align} side={side} width={width}>
      {({ close }) => (
        <div className="p-1">
          {items.filter(Boolean).map((it, i) =>
            it.divider ? <div key={i} className="my-1 h-px bg-line" /> : <MenuItem key={i} item={it} close={close} />
          )}
        </div>
      )}
    </Popover>
  );
}

function MenuItem({ item, close }) {
  const Icon = item.icon;
  const cls = cn(
    "flex w-full items-center gap-2.5 rounded-app-sm px-2.5 py-2 text-left text-sm transition",
    item.danger ? "text-rose-500 hover:bg-rose-500/10" : "text-fg hover:bg-surface-2",
    item.disabled && "opacity-50 pointer-events-none"
  );
  const inner = (
    <>
      {Icon ? <Icon size={15} className={item.danger ? "" : "text-fg-muted"} /> : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.hint ? <span className="text-[11px] text-fg-faint">{item.hint}</span> : null}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} className={cls} onClick={close}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() => {
        close();
        item.onClick?.();
      }}
    >
      {inner}
    </button>
  );
}
