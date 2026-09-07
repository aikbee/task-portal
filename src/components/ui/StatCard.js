import Card from "./Card";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, icon: Icon, color = "var(--accent)", hint, className, onClick }) {
  return (
    <Card
      hover={!!onClick}
      onClick={onClick}
      className={cn("relative overflow-hidden", onClick && "cursor-pointer", className)}
    >
      <span
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-fg">{value}</p>
          {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-app-sm text-white shadow-app" style={{ background: color }}>
            <Icon size={18} />
          </span>
        ) : null}
      </div>
    </Card>
  );
}
