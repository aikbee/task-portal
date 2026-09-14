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
  const tint = color ?? "var(--accent)";
  return (
    <div className={cn("page-header mb-5 flex flex-wrap items-end justify-between gap-4 anim-rise", className)} style={{ "--ph-color": tint }}>
      <div className="ph-main flex items-center gap-3 min-w-0">
        {Icon ? (
          <span
            className="ph-icon grid h-11 w-11 shrink-0 place-items-center rounded-app text-white shadow-app"
            style={{ background: `linear-gradient(135deg, ${tint}, color-mix(in oklab, ${tint} 65%, black))` }}
          >
            <Icon size={20} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="ph-title truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description ? <p className="ph-desc text-sm text-fg-muted">{description}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="ph-actions flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
