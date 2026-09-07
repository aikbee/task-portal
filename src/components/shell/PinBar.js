"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pin, X } from "lucide-react";
import { usePrefs, useUI } from "@/lib/store";
import { MODULE_MAP, moduleFromPath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { Kbd } from "@/components/ui/Misc";
import { useT } from "@/lib/i18n";

/** Describes the current page as a pin: { href, label, module }. */
export function useCurrentPin() {
  const pathname = usePathname();
  const title = useUI((s) => s.pageMeta.title);
  const mod = moduleFromPath(pathname);
  return { href: pathname, label: title || mod.label, module: mod.key, hasTitle: Boolean(title) };
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Horizontal strip of pinned pages under the top bar for quick switching. */
export default function PinBar() {
  const tr = useT();
  const pathname = usePathname();
  const mounted = useMounted();
  const pins = usePrefs((s) => s.pins);
  const showPinBar = usePrefs((s) => s.showPinBar);
  const togglePin = usePrefs((s) => s.togglePin);
  const removePin = usePrefs((s) => s.removePin);
  const movePin = usePrefs((s) => s.movePin);
  const updatePinLabel = usePrefs((s) => s.updatePinLabel);
  const current = useCurrentPin();
  const isPinned = pins.some((p) => p.href === current.href);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  // keep a pin's label in sync with the page title (e.g. after renaming a record)
  useEffect(() => {
    if (isPinned && current.hasTitle) updatePinLabel(current.href, current.label);
  }, [isPinned, current.hasTitle, current.href, current.label, updatePinLabel]);

  // "p" (outside inputs) pins / unpins the current page
  useEffect(() => {
    const onKey = (e) => {
      if (!isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        togglePin({ href: current.href, label: current.label, module: current.module });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current.href, current.label, current.module, togglePin]);

  if (!mounted || !showPinBar || pins.length === 0) return null;

  return (
    <div className="relative z-20 flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto glass border-b px-3 anim-fade">
      <Pin size={13} className="mr-0.5 shrink-0 text-fg-faint" />
      {pins.map((p, i) => {
        const mod = MODULE_MAP[p.module] ?? MODULE_MAP.dashboard;
        const Icon = mod.icon;
        const active = pathname === p.href;
        return (
          <div
            key={p.href}
            draggable
            onDragStart={(e) => {
              setDragIdx(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(i);
            }}
            onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx != null) movePin(dragIdx, i);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-1 text-xs transition",
              active ? "border-accent/40 bg-accent/12 text-accent" : "border-line bg-surface/60 text-fg-muted hover:bg-surface-2 hover:text-fg",
              dragIdx === i && "opacity-40",
              overIdx === i && dragIdx !== i && "ring-2 ring-accent/40"
            )}
          >
            <Link href={p.href} className="flex max-w-[200px] items-center gap-1.5" title={tr(p.label)}>
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded text-white" style={{ background: mod.color }}>
                <Icon size={10} />
              </span>
              <span className="truncate font-medium">{tr(p.label)}</span>
            </Link>
            <button
              onClick={() => removePin(p.href)}
              className={cn("grid h-5 w-5 place-items-center rounded-full transition hover:bg-black/10 dark:hover:bg-white/10", active ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100")}
              aria-label={`Unpin ${p.label}`}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      <span className="flex-1" />
      {!isPinned ? (
        <button
          onClick={() => togglePin({ href: current.href, label: current.label, module: current.module })}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-fg-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <Pin size={11} />{tr("Pin this page")}<Kbd>P</Kbd>
        </button>
      ) : null}
    </div>
  );
}
