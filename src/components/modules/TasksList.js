"use client";
import { useCallback, useState } from "react";
import { useNav } from "@/lib/nav";
import Link from "next/link";
import { Plus } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import TaskForm from "./TaskForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, PersonCell, ProjectChip, DueDateCell, CountsCell, InlineSelect } from "./shared";
import { TASK_STATUS, TASK_PRIORITY, MODULE_MAP } from "@/lib/modules";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { formatDate, relativeTime, fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function TasksList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [f, setF] = useState({ status: "", priority: "", project_id: "", employee_id: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const url = `/api/tasks${qs.toString() ? `?${qs}` : ""}`;
  const { rows, loading, error, refetch, removeLocal, setData } = useCrudList(url);
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/tasks", openNew);
  useNewShortcut(openNew);
  const del = useDeleteFlow("/api/tasks", { toast, label: "task", onDeleted: removeLocal });
  const mod = MODULE_MAP.tasks;

  const quickUpdate = async (row, patch) => {
    try {
      const saved = await api.put(`/api/tasks/${row.id}`, patch);
      setData((d) => d.map((t) => (t.id === row.id ? { ...t, ...saved } : t)));
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };

  const columns = [
    {
      key: "title", label: tr("Task"), hideable: false,
      render: (r) => (
        <span className="block max-w-md leading-tight">
          <span className="block truncate font-medium">{r.title}</span>
          {r.description ? <span className="block truncate text-[11px] text-fg-muted">{r.description}</span> : null}
        </span>
      ),
    },
    { key: "project_name", label: tr("Project"), render: (r) => <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} /> },
    { key: "assignee_name", label: tr("Assignee"), render: (r) => <PersonCell id={r.employee_id} name={r.assignee_name} color={r.avatar_color} /> },
    { key: "status", label: tr("Status"), sortValue: (r) => Object.keys(TASK_STATUS).indexOf(r.status), render: (r) => <InlineSelect value={r.status} map={TASK_STATUS} onChange={(v) => quickUpdate(r, { status: v })} /> },
    { key: "priority", label: tr("Priority"), sortValue: (r) => Object.keys(TASK_PRIORITY).indexOf(r.priority), render: (r) => <StatusBadge map={TASK_PRIORITY} value={r.priority} /> },
    { key: "due_date", label: tr("Due"), render: (r) => <DueDateCell date={r.due_date} status={r.status} /> },
    { key: "counts", label: tr("Files / Outputs"), sortable: false, searchable: false, render: (r) => <CountsCell attachments={r.attachment_count} outputs={r.output_count} /> },
    { key: "requirement_code", label: tr("Requirement"), defaultHidden: true, sortValue: (r) => r.requirement_code, render: (r) => r.requirement_id ? <Link href={`/requirements/${r.requirement_id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:text-accent" title={r.requirement_title}>{r.requirement_code}</Link> : <span className="text-fg-faint">—</span> },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  const setFilter = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title={tr("Tasks")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<><ReportButton module="tasks" /><Button icon={Plus} onClick={openNew}>{tr("New task")}</Button></>} />
      <DataTable
        id="tasks"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={{ key: "updated_at", dir: "desc" }}
        searchPlaceholder={tr("Search tasks…")}
        dateFields={[
          { key: "due_date", label: tr("Due date") },
          { key: "created_at", label: tr("Created") },
          { key: "updated_at", label: tr("Updated") },
        ]}
        onRowClick={(r) => router.push(`/tasks/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/tasks/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={
          <>
            <Select value={f.status} onChange={setFilter("status")} className="h-9 w-36"><option value="">{tr("All statuses")}</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
            <Select value={f.priority} onChange={setFilter("priority")} className="h-9 w-32"><option value="">{tr("Any priority")}</option>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
            <Select value={f.project_id} onChange={setFilter("project_id")} className="h-9 w-44"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={f.employee_id} onChange={setFilter("employee_id")} className="h-9 w-44"><option value="">{tr("Anyone")}</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
          </>
        }
        emptyTitle={tr("No tasks yet")}
        emptyDescription={tr("Tasks hold attachments and long-form outputs, each with their own ordering.")}
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New task")}</Button>}
      />
      <TaskForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} tasks?` : "Delete task?"}
        description="All attachments and outputs belonging to the task are removed as well."
      />
    </>
  );
}
