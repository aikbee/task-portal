"use client";
import { useCallback, useState } from "react";
import { useNav } from "@/lib/nav";
import { Plus, FolderKanban } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/Misc";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import ProjectForm from "./ProjectForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow } from "./shared";
import { PROJECT_STATUS, MODULE_MAP } from "@/lib/modules";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function ProjectsList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const url = `/api/projects${status ? `?status=${status}` : ""}`;
  const { rows, loading, error, refetch, removeLocal } = useCrudList(url);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/projects", openNew);
  useNewShortcut(openNew);

  const del = useDeleteFlow("/api/projects", { toast, label: "project", onDeleted: removeLocal });
  const mod = MODULE_MAP.projects;

  const columns = [
    {
      key: "name", label: tr("Project"), hideable: false, sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: r.color }}><FolderKanban size={15} /></span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{r.name}</span>
            <span className="block font-mono text-[11px] text-fg-muted">{r.code}</span>
          </span>
        </span>
      ),
    },
    { key: "status", label: tr("Status"), render: (r) => <StatusBadge map={PROJECT_STATUS} value={r.status} /> },
    { key: "members", label: tr("Team"), sortValue: (r) => r.member_count, render: (r) => (r.members.length ? <AvatarStack people={r.members} /> : <span className="text-fg-faint">—</span>) },
    {
      key: "progress", label: tr("Progress"), width: 180, sortValue: (r) => (r.task_count ? r.done_count / r.task_count : 0),
      render: (r) => (
        <span className="block min-w-[140px]">
          <span className="mb-1 flex justify-between text-[11px] text-fg-muted"><span>{r.done_count}/{r.task_count} tasks</span><span>{r.task_count ? Math.round((r.done_count / r.task_count) * 100) : 0}%</span></span>
          <ProgressBar value={r.task_count ? (r.done_count / r.task_count) * 100 : 0} color={r.color} />
        </span>
      ),
    },
    { key: "budget", label: tr("Budget"), align: "right", sortValue: (r) => Number(r.budget ?? 0), render: (r) => <span className="tabular-nums">{formatMoney(r.budget) || <span className="text-fg-faint">—</span>}</span> },
    { key: "start_date", label: tr("Start"), render: (r) => formatDate(r.start_date) || <span className="text-fg-faint">—</span> },
    { key: "end_date", label: tr("End"), render: (r) => formatDate(r.end_date) || <span className="text-fg-faint">—</span> },
    { key: "description", label: tr("Description"), defaultHidden: true, render: (r) => <span className="block max-w-xs truncate text-fg-muted">{r.description || "—"}</span> },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={tr("Projects")}
        description={tr(mod.description)}
        icon={mod.icon}
        color={mod.color}
        crumbs={[]}
        actions={<><ReportButton module="projects" /><Button icon={Plus} onClick={openNew}>{tr("New project")}</Button></>}
      />
      <DataTable
        id="projects"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={{ key: "updated_at", dir: "desc" }}
        searchPlaceholder={tr("Search projects…")}
        dateFields={[
          { key: "start_date", label: "Start date" },
          { key: "end_date", label: "End date" },
          { key: "created_at", label: tr("Created") },
          { key: "updated_at", label: tr("Updated") },
        ]}
        onRowClick={(r) => router.push(`/projects/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/projects/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40">
            <option value="">{tr("All statuses")}</option>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        }
        emptyTitle={tr("No projects yet")}
        emptyDescription={tr("Create your first project to start grouping employees and tasks.")}
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New project")}</Button>}
      />
      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} projects?` : "Delete project?"}
        description="Tasks in this project will be kept but unlinked. Team assignments are removed."
      />
    </>
  );
}
