import { cn } from "@/lib/utils";
import { CardToggle } from "./DetailCards";

export default function Card({ className, children, padding = true, hover = false, ...props }) {
  return (
    <div
      className={cn(
        "ui-card card",
        padding && "p-5",
        hover && "ui-card-hover transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-app-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, icon: Icon, actions, className }) {
  return (
    <div className={cn("ui-card-header dc-head mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        {Icon ? (
          <span className="ui-card-icon grid h-9 w-9 shrink-0 place-items-center rounded-app-sm bg-accent/12 text-accent">
            <Icon size={17} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
        </div>
      </div>
      <div className="dc-actions flex shrink-0 items-center gap-2 empty:hidden">
        {actions}
        <CardToggle className="-mr-1.5" />
      </div>
    </div>
  );
}

/** The small upper-case title of the compact cards (Details, Meta, Time…). Inside DetailCards it carries the collapse chevron. */
export function CardLabel({ icon: Icon, children, className }) {
  return (
    <div className={cn("dc-head flex items-center gap-2", className)}>
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {Icon ? <Icon size={13} className="shrink-0" /> : null}
        {children}
      </p>
      <CardToggle className="-my-1.5 -mr-1.5" />
    </div>
  );
}
