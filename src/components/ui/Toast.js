"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

const ToastCtx = createContext(null);
let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const mounted = useMounted();

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    ({ title, description, type = "info", action = null, duration = action ? 8000 : 3800 }) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, title, description, type, action }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      show: (opts) => push(typeof opts === "string" ? { title: opts } : opts),
      success: (title, description) => push({ title, description, type: "success" }),
      error: (title, description) => push({ title, description, type: "error", duration: 6000 }),
      info: (title, description) => push({ title, description, type: "info" }),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
              {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body
          )
        : null}
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const tr = useT();
  const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : Info;
  const color = toast.type === "success" ? "text-emerald-500" : toast.type === "error" ? "text-rose-500" : "text-accent";
  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-app border border-line bg-surface p-3.5 shadow-app-lg anim-slide-up">
      <Icon size={18} className={cn("mt-0.5 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-xs text-fg-muted break-words">{toast.description}</p> : null}
        {toast.action ? (
          <button
            onClick={() => {
              toast.action.onClick?.();
              onClose();
            }}
            className="mt-1.5 text-xs font-semibold text-accent hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button onClick={onClose} className="text-fg-faint hover:text-fg" aria-label={tr("Dismiss")}>
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
