"use client";
import { useState } from "react";
import { useNav } from "@/lib/nav";
import { Pencil, Trash2, Plus, FolderKanban, Users, CheckSquare, Calendar, Wallet, Hash, ClipboardList, BookOpen } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { PROJECT_STATUS, TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { ProgressBar, Skeleton, EmptyState } from "@/components/ui/Misc";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/table/DataTable";
import { useToast } from "@/components/ui/Toast";
import ProjectForm from "./ProjectForm";
import ProjectMembers from "./ProjectMembers";
import ProjectRequirements from "./ProjectRequirements";
import ProjectInfo from "./ProjectInfo";
import TaskForm from "./TaskForm";
import { RowActions, PersonCell, DueDateCell, CountsCell, InlineSelect, useDeleteFlow } from "./shared";
import { useT } from "@/lib/i18n";

export default function ProjectDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: project, loading, error, refetch, setData } = useFetch(`/api/projects/${id}`);
  const [tab, setTab] = useState("members");
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskForm, setTaskForm] = useState({ open: false, initial: null });
  const taskDel = useDeleteFlow("/api/tasks", { toast, label: "task", onDeleted: () => refetch() });

  if (error) return <EmptyState title="Project not found" description={error.message} action={<Button onClick={() => router.push("/projects")}>Back to projects</Button>} />;
  if (loading && !project) return <DetailSkeleton />;
  if (!project) return null;

  const pct = project.task_count ? Math.round((project.done_count / project.task_count) * 100) : 0;

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/projects/${id}`);
      toast.success("Project deleted");
      router.push("/projects");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };

  const quickUpdateTask = async (row, patch) => {
    try {
      const saved = await api.put(`/api/tasks/${row.id}`, patch);
      setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === row.id ? { ...t, ...saved } : t)), done_count: p.tasks.filter((t) => (t.id === row.id ? saved.status : t.status) === "done").length }));
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };

  const taskColumns = [
    { key: "title", label: tr("Task"), hideable: false, render: (r) => <span className="block max-w-md truncate font-medium">{r.title}</span> },
    { key: "assignee_name", label: tr("Assignee"), render: (r) => <PersonCell id={r.employee_id} name={r.assignee_name} color={r.avatar_color} /> },
    { key: "status", label: tr("Status"), render: (r) => <InlineSelect value={r.status} map={TASK_STATUS} onChange={(v) => quickUpdateTask(r, { status: v })} /> },
    { key: "priority", label: tr("Priority"), render: (r) => <StatusBadge map={TASK_PRIORITY} value={r.priority} /> },
    { key: "due_date", label: tr("Due"), render: (r) => <DueDateCell date={r.due_date} status={r.status} /> },
    { key: "counts", label: tr("Files / Outputs"), sortable: false, render: (r) => <CountsCell attachments={r.attachment_count} outputs={r.output_count} /> },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={project.name}
        icon={FolderKanban}
        color={project.color}
        crumbs={[{ label: tr("Projects"), href: "/projects" }]}
        actions={
          <>
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <StatusBadge map={PROJECT_STATUS} value={project.status} />
          <span className="font-mono">{project.code}</span>
          <span>· updated {relativeTime(project.updated_at)}</span>
        </div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] anim-stagger">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("About")}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg">{project.description || <span className="text-fg-faint">No description yet.</span>}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
            <Info icon={Hash} label={tr("Code")} value={<span className="font-mono">{project.code}</span>} />
            <Info icon={Calendar} label={tr("Start")} value={formatDate(project.start_date) || "—"} />
            <Info icon={Calendar} label={tr("End")} value={formatDate(project.end_date) || "—"} />
            <Info icon={Wallet} label={tr("Budget")} value={formatMoney(project.budget) || "—"} />
          </dl>
        </Card>
        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Progress")}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{pct}%</p>
            <p className="text-xs text-fg-muted">{project.done_count} of {project.task_count} tasks done</p>
            <ProgressBar value={pct} color={project.color} size="md" className="mt-3" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <button onClick={() => setTab("members")} className="flex items-center gap-2 rounded-app-sm border border-line px-3 py-2 text-left hover:bg-surface-2">
              <Users size={15} className="text-accent" /><span><b>{project.employees.length}</b> <span className="text-fg-muted">members</span></span>
            </button>
            <button onClick={() => setTab("requirements")} className="flex items-center gap-2 rounded-app-sm border border-line px-3 py-2 text-left hover:bg-surface-2">
              <ClipboardList size={15} className="text-accent" /><span><b>{(project.requirements ?? []).length}</b> <span className="text-fg-muted">reqs</span></span>
            </button>
            <button onClick={() => setTab("tasks")} className="flex items-center gap-2 rounded-app-sm border border-line px-3 py-2 text-left hover:bg-surface-2">
              <CheckSquare size={15} className="text-accent" /><span><b>{project.task_count - project.done_count}</b> <span className="text-fg-muted">{tr("open")}</span></span>
            </button>
          </div>
        </Card>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "members", label: tr("Members"), icon: Users, count: project.employees.length },
          { key: "requirements", label: tr("Requirements"), icon: ClipboardList, count: (project.requirements ?? []).length },
          { key: "tasks", label: tr("Tasks"), icon: CheckSquare, count: project.tasks.length },
          { key: "info", label: tr("Info"), icon: BookOpen },
        ]}
      />

      {tab === "members" ? (
        <ProjectMembers project={project} onChange={setData} />
      ) : tab === "requirements" ? (
        <ProjectRequirements project={project} onChange={setData} />
      ) : tab === "info" ? (
        <ProjectInfo project={project} />
      ) : (
        <DataTable
          id="project-tasks"
          columns={taskColumns}
          rows={project.tasks}
          defaultSort={{ key: "status", dir: "asc" }}
          searchPlaceholder="Search tasks in this project…"
          dateFields={[
            { key: "due_date", label: tr("Due date") },
            { key: "updated_at", label: tr("Updated") },
          ]}
          onRowClick={(r) => router.push(`/tasks/${r.id}`)}
          toolbar={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>{tr("New task")}</Button>}
          rowActions={(r) => <RowActions href={`/tasks/${r.id}`} onEdit={() => setTaskForm({ open: true, initial: r })} onDelete={() => taskDel.setTarget(r)} />}
          emptyTitle="No tasks in this project"
          emptyAction={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>Create task</Button>}
        />
      )}

      <ProjectForm open={editOpen} onClose={() => setEditOpen(false)} initial={project} onSaved={(p) => setData({ ...project, ...p })} />
      <TaskForm open={taskForm.open} onClose={() => setTaskForm({ open: false, initial: null })} initial={taskForm.initial} defaults={{ project_id: project.id }} onSaved={refetch} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title="Delete this project?" description="Tasks are kept but unlinked from the project. This cannot be undone." />
      <ConfirmDialog open={!!taskDel.target} onClose={() => taskDel.setTarget(null)} onConfirm={taskDel.confirm} loading={taskDel.busy} title={tr("Delete task?")} description="Its attachments and outputs will be removed too." />
    </>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-fg-faint"><Icon size={11} /> {label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
