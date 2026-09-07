import { cn } from "@/lib/utils";

export default function Card({ className, children, padding = true, hover = false, ...props }) {
  return (
    <div
      className={cn(
        "card",
        padding && "p-5",
        hover && "transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-app-lg",
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
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        {Icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm bg-accent/12 text-accent">
            <Icon size={17} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
