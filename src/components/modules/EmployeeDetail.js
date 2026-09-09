"use client";
import { useState } from "react";
import Link from "next/link";
import { useNav } from "@/lib/nav";
import { Pencil, Trash2, Plus, Mail, Phone, Building2, Calendar, FolderKanban, CheckSquare, BriefcaseBusiness } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { EMPLOYEE_STATUS, PROJECT_STATUS, TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { fullName, formatDate, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/table/DataTable";
import { useToast } from "@/components/ui/Toast";
import EmployeeForm from "./EmployeeForm";
import TaskForm from "./TaskForm";
import { RowActions, ProjectChip, DueDateCell, CountsCell, InlineSelect, useDeleteFlow } from "./shared";
import { DetailSkeleton } from "./ProjectDetail";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function EmployeeDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: emp, loading, error, refetch, setData } = useFetch(`/api/employees/${id}`);
  const [tab, setTab] = useState("tasks");
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskForm, setTaskForm] = useState({ open: false, initial: null });
  const taskDel = useDeleteFlow("/api/tasks", { toast, label: "task", onDeleted: () => refetch() });

  if (error) return <EmptyState title="Employee not found" description={error.message} action={<Button onClick={() => router.push("/employees")}>Back to employees</Button>} />;
  if (loading && !emp) return <DetailSkeleton />;
  if (!emp) return null;

  const name = fullName(emp);
  const open = emp.tasks.filter((t) => t.status !== "done").length;

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/employees/${id}`);
      toast.success("Employee deleted");
      router.push("/employees");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };
  const quickUpdateTask = async (row, patch) => {
    try {
      const saved = await api.put(`/api/tasks/${row.id}`, patch);
      setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === row.id ? { ...t, ...saved } : t)) }));
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };

  const taskColumns = [
    { key: "title", label: tr("Task"), hideable: false, render: (r) => <span className="block max-w-md truncate font-medium">{r.title}</span> },
    { key: "project_name", label: tr("Project"), render: (r) => <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} /> },
    { key: "status", label: tr("Status"), render: (r) => <InlineSelect value={r.status} map={TASK_STATUS} onChange={(v) => quickUpdateTask(r, { status: v })} /> },
    { key: "priority", label: tr("Priority"), render: (r) => <StatusBadge map={TASK_PRIORITY} value={r.priority} /> },
    { key: "due_date", label: tr("Due"), render: (r) => <DueDateCell date={r.due_date} status={r.status} /> },
    { key: "counts", label: tr("Files / Outputs"), sortable: false, render: (r) => <CountsCell attachments={r.attachment_count} outputs={r.output_count} /> },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={name}
        crumbs={[{ label: tr("Employees"), href: "/employees" }]}
        hideTitle
      />
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] anim-stagger">
        <Card className="flex flex-wrap items-center gap-5">
          <Avatar name={name} color={emp.avatar_color} size="xl" className="!h-20 !w-20 !text-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <StatusBadge map={EMPLOYEE_STATUS} value={emp.status} />
            </div>
            <p className="text-sm text-fg-muted">{emp.job_title || "No title"}{emp.department ? ` · ${emp.department}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              <a href={`mailto:${emp.email}`} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-accent"><Mail size={14} /> {emp.email}</a>
              {emp.phone ? <a href={`tel:${emp.phone}`} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-accent"><Phone size={14} /> {emp.phone}</a> : null}
              {emp.department ? <span className="inline-flex items-center gap-1.5 text-fg-muted"><Building2 size={14} /> {emp.department}</span> : null}
              {emp.hired_at ? <span className="inline-flex items-center gap-1.5 text-fg-muted"><Calendar size={14} /> Since {formatDate(emp.hired_at)}</span> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <ReportButton module="employees" id={id} />
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Workload</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label={tr("Open")} value={open} tone="text-accent" />
            <Stat label={tr("Done")} value={emp.tasks.length - open} tone="text-emerald-500" />
            <Stat label={tr("Projects")} value={emp.projects.length} />
          </div>
        </Card>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "tasks", label: tr("Tasks"), icon: CheckSquare, count: emp.tasks.length },
          { key: "projects", label: tr("Projects"), icon: FolderKanban, count: emp.projects.length },
        ]}
      />

      {tab === "tasks" ? (
        <DataTable
          id="employee-tasks"
          columns={taskColumns}
          rows={emp.tasks}
          defaultSort={{ key: "due_date", dir: "asc" }}
          searchPlaceholder={`Search ${emp.first_name}'s tasks…`}
          dateFields={[
            { key: "due_date", label: tr("Due date") },
            { key: "updated_at", label: tr("Updated") },
          ]}
          onRowClick={(r) => router.push(`/tasks/${r.id}`)}
          toolbar={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>{tr("New task")}</Button>}
          rowActions={(r) => <RowActions href={`/tasks/${r.id}`} onEdit={() => setTaskForm({ open: true, initial: r })} onDelete={() => taskDel.setTarget(r)} />}
          emptyTitle="No tasks assigned"
          emptyAction={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>Assign a task</Button>}
        />
      ) : emp.projects.length === 0 ? (
        <Card><EmptyState compact icon={FolderKanban} title="Not on any project" description="Edit the employee to add them to projects." action={<Button size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>Edit employee</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 anim-stagger">
          {emp.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card hover className="h-full">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: p.color }}><FolderKanban size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="font-mono text-[11px] text-fg-muted">{p.code}</p>
                  </div>
                  <StatusBadge map={PROJECT_STATUS} value={p.status} dot={false} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
                  <span className="inline-flex items-center gap-1"><BriefcaseBusiness size={12} /> {p.role || "Member"}</span>
                  <span>{p.my_task_count} task{p.my_task_count === 1 ? "" : "s"} · {p.member_count} people</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <EmployeeForm open={editOpen} onClose={() => setEditOpen(false)} initial={emp} onSaved={refetch} />
      <TaskForm open={taskForm.open} onClose={() => setTaskForm({ open: false, initial: null })} initial={taskForm.initial} defaults={{ employee_id: emp.id }} onSaved={refetch} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title={`Delete ${name}?`} description="Their tasks are kept but become unassigned." />
      <ConfirmDialog open={!!taskDel.target} onClose={() => taskDel.setTarget(null)} onConfirm={taskDel.confirm} loading={taskDel.busy} title={tr("Delete task?")} description="Its attachments and outputs will be removed too." />
    </>
  );
}

function Stat({ label, value, tone = "text-fg" }) {
  return (
    <div className="rounded-app-sm bg-surface-2 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</p>
    </div>
  );
}
