"use client";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/store";

/** Sets the top bar breadcrumbs/title and renders a page heading. */
export default function PageHeader({ title, description, icon: Icon, color, actions, crumbs = [], className, children, hideTitle = false }) {
  const setPageMeta = useUI((s) => s.setPageMeta);
  const crumbKey = JSON.stringify(crumbs);
  useEffect(() => {
    setPageMeta({ title, crumbs });
    return () => setPageMeta({ title: "", crumbs: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, crumbKey]);

  if (hideTitle) return null;
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-4 anim-rise", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon ? (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-app text-white shadow-app"
            style={{ background: `linear-gradient(135deg, ${color ?? "var(--accent)"}, color-mix(in oklab, ${color ?? "var(--accent)"} 65%, black))` }}
          >
            <Icon size={20} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
