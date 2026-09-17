"use client";
import { useState } from "react";
import { DatabaseBackup, Download, Trash2, FolderArchive, HardDrive, Files, AlertTriangle, CheckCircle2, Clock, LifeBuoy, CloudOff } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, EmptyState } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP } from "@/lib/modules";
import { cn, formatBytes, formatDateTime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const HEALTH = {
  ok: { label: "Up to date", tone: "emerald", icon: CheckCircle2 },
  stale: { label: "Overdue", tone: "amber", icon: Clock },
  failed: { label: "Last run failed", tone: "rose", icon: AlertTriangle },
  never: { label: "No backup yet", tone: "slate", icon: Clock },
};
const REASONS = { auto: { label: "Automatic", tone: "sky" }, manual: { label: "Manual", tone: "violet" }, deploy: { label: "Before an update", tone: "amber" } };

/** Admin: automatic database and file backups: state, archives, back up now, download, restore notes. */
export default function BackupsAdmin() {
  const tr = useT();
  const toast = useToast();
  const mod = MODULE_MAP.backups;
  const { data, setData, loading, error } = useFetch("/api/backups");
  const [running, setRunning] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const runNow = async () => {
    setRunning(true);
    try {
      const next = await api.post("/api/backups", {});
      setData(next);
      toast.success(tr("Backup complete"), next.result?.file);
    } catch (e) {
      toast.error(tr("The backup failed"), e.message);
      api.get("/api/backups").then(setData).catch(() => {});
    } finally {
      setRunning(false);
    }
  };
  const remove = async () => {
    setBusyDelete(true);
    try {
      setData(await api.del(`/api/backups/${removing.name}`));
      toast.success(tr("Backup deleted"));
      setRemoving(null);
    } catch (e) {
      toast.error(tr("Could not delete"), e.message);
    } finally {
      setBusyDelete(false);
    }
  };

  const header = (
    <PageHeader
      title={tr("Backups")}
      description={tr(mod.description)}
      icon={mod.icon}
      color={mod.color}
      crumbs={[]}
      actions={
        <>
          <a href="/api/backups/archive" download className={cn("btn btn-secondary inline-flex h-9 items-center gap-2 rounded-app-sm border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-3", !data?.backups?.length && "pointer-events-none opacity-60")}>
            <FolderArchive size={16} /> {tr("Download everything")}
          </a>
          <Button icon={DatabaseBackup} onClick={runNow} loading={running} className="backup-now">{tr("Back up now")}</Button>
        </>
      }
    />
  );
  if (error && !data) return <>{header}<p className="text-sm text-rose-500">{error.message}</p></>;
  if (loading && !data) return <>{header}<Skeleton className="h-96 w-full" /></>;

  const { status, backups, health, policy, disk } = data;
  const h = HEALTH[health] ?? HEALTH.never;
  const files = status?.files;
  return (
    <>
      {header}
      {health === "failed" || health === "stale" ? (
        <div className="backup-alert mb-4 flex items-start gap-3 rounded-app border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" />
          <div>
            <p className="font-medium">{health === "failed" ? tr("The last backup did not finish.") : tr("No backup has finished in the last 36 hours.")}</p>
            <p className="text-fg-muted">{status?.error || tr("Check that the daily scheduler is running, then use Back up now.")}</p>
          </div>
        </div>
      ) : null}
      {status?.warnings?.length ? (
        <div className="mb-4 rounded-app border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          {status.warnings.map((w, i) => <p key={i} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" /> {w}</p>)}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="backup-state">
          <CardHeader title={tr("Last backup")} icon={h.icon} actions={<Badge tone={h.tone} dot>{tr(h.label)}</Badge>} />
          {status?.lastOk ? (
            <>
              <p className="text-2xl font-semibold tracking-tight">{relativeTime(status.lastOk.at)}</p>
              <p className="mt-1 text-xs text-fg-muted">{formatDateTime(status.lastOk.at)} · {formatBytes(status.lastOk.bytes)}</p>
              <p className="mt-3 text-xs text-fg-muted">{tr("{n} tables", { n: status.tables ?? "—" })} · {status.engine === "node" ? tr("built-in dumper") : "mysqldump"} · {tr("checked after writing")}</p>
            </>
          ) : <p className="text-sm text-fg-muted">{tr("Nothing yet. The first automatic backup runs within a day, or use Back up now.")}</p>}
        </Card>
        <Card>
          <CardHeader title={tr("Uploaded files")} icon={Files} />
          <p className="text-2xl font-semibold tracking-tight">{files ? tr("{n} protected", { n: files.total }) : "—"}</p>
          <p className="mt-1 text-xs text-fg-muted">{files ? formatBytes(files.bytes) : ""}{files ? " · " : ""}{files?.mode === "copy" ? tr("kept as copies") : tr("no extra disk space used")}</p>
          <p className="mt-3 text-xs text-fg-muted">{tr("A file deleted in the app stays restorable for {n} days.", { n: policy.file_grace_days })}{files?.retained ? ` ${tr("{n} such files kept now.", { n: files.retained })}` : ""}</p>
        </Card>
        <Card>
          <CardHeader title={tr("Storage")} icon={HardDrive} />
          <p className="text-2xl font-semibold tracking-tight">{tr("{n} archives", { n: backups.length })}</p>
          <p className="mt-1 text-xs text-fg-muted">{formatBytes(data.total_bytes)}{disk ? ` · ${tr("{free} free on the disk", { free: formatBytes(disk.free) })}` : ""}</p>
          <p className="mt-3 text-xs text-fg-muted">{tr("Keeps the last 48 hours, then one a day for {d} days, one a week for {w} weeks and one a month for {m} months.", { d: policy.daily, w: policy.weekly, m: policy.monthly })}</p>
        </Card>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-app border border-line bg-surface-2/60 p-4 text-sm">
        <CloudOff size={18} className="mt-0.5 shrink-0 text-fg-muted" />
        <p className="text-fg-muted">
          <span className="font-medium text-fg">{tr("These backups live on the same server as the portal.")}</span>{" "}
          {tr("They undo mistakes and bad updates, but not the loss of the server. Use Download everything now and then and keep the ZIP somewhere else.")}
        </p>
      </div>

      <Card className="mt-4" padding={false}>
        <div className="p-5 pb-0"><CardHeader title={tr("Database archives")} description={tr("Taken once a day, before every update, and whenever you ask.")} icon={DatabaseBackup} /></div>
        {backups.length ? (
          <ul className="backup-list divide-y divide-line">
            {backups.map((b) => {
              const r = REASONS[b.reason] ?? REASONS.manual;
              return (
                <li key={b.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">{formatDateTime(b.at)}</p>
                    <p className="truncate text-xs text-fg-muted">{relativeTime(b.at)} · {b.name}</p>
                  </div>
                  <Badge tone={r.tone}>{tr(r.label)}</Badge>
                  <span className="w-20 text-right text-xs tabular-nums text-fg-muted">{formatBytes(b.bytes)}</span>
                  <span className="flex items-center gap-1">
                    <a href={`/api/backups/${b.name}`} download aria-label={tr("Download")} data-tip={tr("Download")} className="grid h-8 w-8 place-items-center rounded-app-sm text-fg-muted hover:bg-surface-2 hover:text-fg"><Download size={15} /></a>
                    <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={() => setRemoving(b)} aria-label={tr("Delete")} data-tip={tr("Delete")} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact icon={DatabaseBackup} title={tr("No backup yet")} description={tr("Use Back up now to take the first one.")} />}
      </Card>

      <Card className="mt-4">
        <CardHeader title={tr("Restoring")} description={tr("On the server, from the app folder. The target database must be empty, or add --force.")} icon={LifeBuoy} />
        <pre className="overflow-x-auto rounded-app-sm bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{`node --env-file=.env scripts/restore.mjs ${data.location}/db/<archive>.sql.gz\ncp -n ${data.location}/files/* "$UPLOAD_DIR"/`}</pre>
        <p className="mt-3 text-xs text-fg-muted">{tr("Keep the same DATA_KEY, or stored Info secrets cannot be read. Everybody signs in again afterwards: login sessions are never part of a backup.")}</p>
      </Card>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busyDelete}
        title="Delete this backup?"
        description={removing ? `${formatDateTime(removing.at)} · ${formatBytes(removing.bytes)}. ${tr("Old backups are removed automatically; deleting by hand is rarely needed.")}` : ""}
      />
    </>
  );
}
