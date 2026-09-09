"use client";
import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { ProgressBar } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import RequirementForm from "./RequirementForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, PersonCell, ProjectChip, InlineSelect } from "./shared";
import { REQ_TYPE, REQ_PRIORITY, REQ_STATUS, MODULE_MAP } from "@/lib/modules";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import { formatDate, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function RequirementsList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [f, setF] = useState({ project_id: "", type: "", priority: "", status: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const url = `/api/requirements${qs.toString() ? `?${qs}` : ""}`;
  const { rows, loading, error, refetch, removeLocal, setData } = useCrudList(url);
  const { data: projects } = useFetch("/api/projects");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/requirements", openNew);
  useNewShortcut(openNew);
  const del = useDeleteFlow("/api/requirements", { toast, label: "requirement", onDeleted: removeLocal });
  const mod = MODULE_MAP.requirements;

  const quickUpdate = async (row, patch) => {
    try {
      const saved = await api.put(`/api/requirements/${row.id}`, patch);
      setData((d) => d.map((r) => (r.id === row.id ? { ...r, ...saved } : r)));
    } catch (e) {
      toast.error("Could not update requirement", e.message);
    }
  };

  const columns = [
    { key: "code", label: tr("Code"), width: 90, render: (r) => <span className="font-mono text-xs text-fg-muted">{r.code}</span> },
    {
      key: "title", label: tr("Requirement"), hideable: false,
      render: (r) => (
        <span className="block max-w-md leading-tight">
          <span className="block truncate font-medium">{r.title}</span>
          {r.description ? <span className="block truncate text-[11px] text-fg-muted">{r.description}</span> : null}
        </span>
      ),
    },
    { key: "project_name", label: tr("Project"), render: (r) => <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} /> },
    { key: "type", label: tr("Type"), sortValue: (r) => Object.keys(REQ_TYPE).indexOf(r.type), render: (r) => <StatusBadge map={REQ_TYPE} value={r.type} dot={false} /> },
    { key: "priority", label: tr("Priority"), sortValue: (r) => Object.keys(REQ_PRIORITY).indexOf(r.priority), render: (r) => <StatusBadge map={REQ_PRIORITY} value={r.priority} /> },
    { key: "status", label: tr("Status"), sortValue: (r) => Object.keys(REQ_STATUS).indexOf(r.status), render: (r) => <InlineSelect value={r.status} map={REQ_STATUS} onChange={(v) => quickUpdate(r, { status: v })} /> },
    { key: "stakeholder_name", label: tr("Stakeholder"), render: (r) => <PersonCell id={r.employee_id} name={r.stakeholder_name} color={r.stakeholder_color} /> },
    {
      key: "tasks", label: tr("Tasks"), width: 140, sortValue: (r) => (r.task_count ? r.done_count / r.task_count : -1),
      render: (r) => r.task_count ? (
        <span className="block min-w-[110px]">
          <span className="mb-1 block text-[11px] text-fg-muted">{r.done_count}/{r.task_count} done</span>
          <ProgressBar value={(r.done_count / r.task_count) * 100} color={r.project_color} />
        </span>
      ) : <span className="text-fg-faint">—</span>,
    },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];
  const setFilter = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title={tr("Requirements")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<><ReportButton module="requirements" /><Button icon={Plus} onClick={openNew}>{tr("New requirement")}</Button></>} />
      <DataTable
        id="requirements"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={null}
        searchPlaceholder={tr("Search requirements…")}
        dateFields={[
          { key: "created_at", label: tr("Created") },
          { key: "updated_at", label: tr("Updated") },
        ]}
        onRowClick={(r) => router.push(`/requirements/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/requirements/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={
          <>
            <Select value={f.project_id} onChange={setFilter("project_id")} className="h-9 w-44"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={f.type} onChange={setFilter("type")} className="h-9 w-36"><option value="">{tr("All types")}</option>{Object.entries(REQ_TYPE).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
            <Select value={f.priority} onChange={setFilter("priority")} className="h-9 w-36"><option value="">{tr("Any priority")}</option>{Object.entries(REQ_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
            <Select value={f.status} onChange={setFilter("status")} className="h-9 w-36"><option value="">{tr("All statuses")}</option>{Object.entries(REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
          </>
        }
        emptyTitle={tr("No requirements yet")}
        emptyDescription="Capture what each project must deliver, prioritise with MoSCoW and link the tasks that implement it."
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New requirement")}</Button>}
      />
      <RequirementForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} requirements?` : "Delete requirement?"}
        description="Linked tasks are kept but no longer point at this requirement."
      />
    </>
  );
}
