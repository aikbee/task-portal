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
    <div className={cn("page-header mb-4 flex flex-wrap items-end justify-between gap-3 anim-rise md:mb-5 md:gap-4", className)} style={{ "--ph-color": tint }}>
      <div className="ph-main flex min-w-0 items-center gap-3">
        {Icon ? (
          <span
            className="ph-icon grid h-9 w-9 shrink-0 place-items-center rounded-app text-white shadow-app md:h-11 md:w-11"
            style={{ background: `linear-gradient(135deg, ${tint}, color-mix(in oklab, ${tint} 65%, black))` }}
          >
            <Icon size={20} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="ph-title truncate text-lg font-semibold tracking-tight text-fg md:text-xl">{title}</h1>
          {description ? <p className="ph-desc line-clamp-2 text-[13px] text-fg-muted md:line-clamp-none md:text-sm">{description}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="ph-actions flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-0.5">{actions}</div> : null}
    </div>
  );
}
