"use client";
import { useMemo, useState } from "react";
import { Trash2, RotateCcw, CheckSquare, FolderKanban, ClipboardList, Users, Brush, BookOpen, CalendarDays, Paperclip, Flame } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import { useNav } from "@/lib/nav";
import { MODULE_MAP } from "@/lib/modules";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

const KIND = {
  task: { icon: CheckSquare, color: "#10b981", href: (id) => `/tasks/${id}` },
  project: { icon: FolderKanban, color: "#6366f1", href: (id) => `/projects/${id}` },
  requirement: { icon: ClipboardList, color: "#ec4899", href: (id) => `/requirements/${id}` },
  employee: { icon: Users, color: "#0ea5e9", href: (id) => `/employees/${id}` },
  drawboard: { icon: Brush, color: "#f97316", href: (id) => `/drawboards/${id}` },
  info: { icon: BookOpen, color: "#8b5cf6", href: (id) => `/info/${id}` },
  event: { icon: CalendarDays, color: "#0ea5e9", href: () => "/calendar" },
};
const kindOf = (entity) => KIND[entity] ?? { icon: Paperclip, color: "#64748b", href: null };

/** What was deleted in this profile during the last 30 days: restore it, or delete it for good. */
export default function TrashPage() {
  const tr = useT();
  const nav = useNav();
  const toast = useToast();
  const { canDelete } = useAccess();
  const mod = MODULE_MAP.trash;
  const { data, loading, error, refetch } = useFetch(canDelete ? "/api/trash" : null);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toPurge, setToPurge] = useState(null); // an item, or "all"
  const [purging, setPurging] = useState(false);
  const items = useMemo(() => data?.items ?? [], [data]);
  const labels = useMemo(() => [...new Set(items.map((i) => i.label))], [items]);
  const shown = filter ? items.filter((i) => i.label === filter) : items;

  const restore = async (item) => {
    setBusyId(item.id);
    try {
      const res = await api.post(`/api/trash/${item.id}/restore`, {});
      const href = kindOf(res.entity).href?.(res.id);
      toast.show({ type: "success", title: tr("Restored"), description: item.title, action: href ? { label: tr("Open"), onClick: () => nav.push(href) } : null });
      refetch();
    } catch (e) {
      toast.error(tr("Could not restore"), e.message);
    } finally {
      setBusyId(null);
    }
  };
  const purge = async () => {
    setPurging(true);
    try {
      if (toPurge === "all") await api.del("/api/trash");
      else await api.del(`/api/trash/${toPurge.id}`);
      toast.success(toPurge === "all" ? tr("The recycle bin is empty") : tr("Deleted for good"));
      setToPurge(null);
      refetch();
    } catch (e) {
      toast.error(tr("Could not delete"), e.message);
    } finally {
      setPurging(false);
    }
  };

  const header = (
    <PageHeader
      title={tr("Recycle bin")}
      description={tr(mod.description)}
      icon={mod.icon}
      color={mod.color}
      crumbs={[]}
      actions={items.length ? <Button variant="dangerGhost" icon={Flame} onClick={() => setToPurge("all")} className="trash-empty">{tr("Empty the bin")}</Button> : null}
    />
  );
  if (!canDelete) return <>{header}<Card><EmptyState icon={Trash2} title={tr("Not available with your role")} description={tr("Only the owner and managers of this profile can look into its recycle bin.")} /></Card></>;

  return (
    <>
      {header}
      {error ? <EmptyState title={tr("Could not load the recycle bin")} description={error.message} /> : null}
      {loading && !data ? <Skeleton className="h-64 w-full" /> : null}
      {data && !items.length ? <Card><EmptyState icon={Trash2} title={tr("Nothing in the bin")} description={tr("What you delete lands here and stays for {n} days before it is removed for good.", { n: data.days })} /></Card> : null}
      {items.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {["", ...labels].map((l) => (
              <button key={l || "all"} type="button" onClick={() => setFilter(l)} className={cn("rounded-full border px-3 py-1 text-xs transition", filter === l ? "border-accent bg-accent/10 font-medium text-accent" : "border-line text-fg-muted hover:bg-surface-2")}>
                {l ? tr(l) : tr("Everything")} <span className="tabular-nums opacity-70">{l ? items.filter((i) => i.label === l).length : items.length}</span>
              </button>
            ))}
            <span className="ml-auto text-[11px] text-fg-muted">{tr("Removed for good {n} days after deletion.", { n: data.days })}</span>
          </div>
          <Card padding={false}>
            <ul className="trash-list divide-y divide-line">
              {shown.map((item) => {
                const k = kindOf(item.entity);
                const Icon = k.icon;
                return (
                  <li key={item.id} className="trash-item flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: k.color }}><Icon size={16} /></span>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {tr(item.label)}{item.detail ? ` · ${item.detail}` : ""}{item.file_count ? ` · ${tr("{n} files", { n: item.file_count })}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-[11px] leading-tight text-fg-muted">
                      <p title={formatDateTime(item.deleted_at)}>{tr("deleted {when} by {who}", { when: relativeTime(item.deleted_at), who: item.deleted_by_name ?? tr("Someone") })}</p>
                      <p className={cn(item.days_left <= 3 && "font-medium text-rose-500")}>{item.days_left > 0 ? tr("{n} days left", { n: item.days_left }) : tr("goes today")}</p>
                    </div>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => restore(item)} loading={busyId === item.id} className="trash-restore">{tr("Restore")}</Button>
                      <Button size="iconSm" variant="dangerGhost" icon={Trash2} onClick={() => setToPurge(item)} aria-label={tr("Delete for good")} data-tip={tr("Delete for good")} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      ) : null}
      <ConfirmDialog
        open={!!toPurge}
        onClose={() => setToPurge(null)}
        onConfirm={purge}
        loading={purging}
        title={toPurge === "all" ? "Empty the recycle bin?" : "Delete this for good?"}
        description={toPurge === "all" ? tr("{n} entries and their files are removed permanently. This cannot be undone.", { n: items.length }) : toPurge ? `${toPurge.title}. ${tr("It and its files are removed permanently. This cannot be undone.")}` : ""}
        confirmText="Delete for good"
      />
    </>
  );
}
