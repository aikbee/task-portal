"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import Button from "./Button";
import { useT } from "@/lib/i18n";

const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

export default function Modal({ open, onClose, title, description, children, footer, size = "md", className }) {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-app-lg border border-line bg-surface shadow-app-lg anim-pop sm:max-h-[calc(100vh-3rem)]",
          sizes[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              {title ? <h2 className="text-base font-semibold text-fg">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
            </div>
            <Button variant="ghost" size="iconSm" icon={X} onClick={onClose} aria-label={tr("Close")} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
