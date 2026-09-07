"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import Button from "./Button";
import { useT } from "@/lib/i18n";

export default function Drawer({ open, onClose, title, description, children, footer, width = "w-[380px]", className }) {
  const tr = useT();
  const mounted = useMounted();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full max-w-[92vw] flex-col glass shadow-app-lg anim-slide-right border-l",
          width,
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
          </div>
          <Button variant="ghost" size="iconSm" icon={X} onClick={onClose} aria-label={tr("Close")} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
      </aside>
    </div>,
    document.body
  );
}
