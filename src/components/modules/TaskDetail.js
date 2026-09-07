"use client";
import { useState } from "react";
import Link from "next/link";
import { useNav } from "@/lib/nav";
import { Pencil, Trash2, CheckSquare, FolderKanban, Calendar, Clock, Paperclip, FileText, Flag, ClipboardList, UserRoundPen } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { formatDate, formatDateTime, relativeTime, isOverdue, fullName } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import { Select, Input } from "@/components/ui/Controls";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import TaskForm from "./TaskForm";
import AttachmentsPanel from "./AttachmentsPanel";
import TaskOutputs from "./TaskOutputs";
import { DetailSkeleton } from "./ProjectDetail";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function TaskDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: task, loading, error, refetch, setData } = useFetch(`/api/tasks/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reassign, setReassign] = useState(null); // { employee_id, name } awaiting confirmation
  const [reassigning, setReassigning] = useState(false);
  const { data: employees } = useFetch("/api/employees");

  if (error) return <EmptyState title="Task not found" description={error.message} action={<Button onClick={() => router.push("/tasks")}>Back to tasks</Button>} />;
  if (loading && !task) return <DetailSkeleton />;
  if (!task) return null;

  const patch = async (p) => {
    try {
      const saved = await api.put(`/api/tasks/${id}`, p);
      setData(saved);
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/tasks/${id}`);
      toast.success("Task deleted");
      router.push("/tasks");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };
  const overdue = isOverdue(task.due_date, task.status);

  /** Assignee changes are confirmed first: they move the task in the other person's workload. */
  const askReassign = (value) => {
    const employee_id = value ? Number(value) : null;
    if (employee_id === (task.employee_id ?? null)) return;
    const emp = (employees ?? []).find((e) => e.id === employee_id);
    setReassign({ employee_id, name: emp ? fullName(emp) : null });
  };
  const confirmReassign = async () => {
    if (!reassign) return;
    setReassigning(true);
    try {
      const saved = await api.put(`/api/tasks/${id}`, { employee_id: reassign.employee_id });
      setData(saved);
      toast.success(reassign.employee_id ? tr("Reassigned to {name}", { name: reassign.name }) : tr("Assignee removed"));
      setReassign(null);
    } catch (e) {
      toast.error("Could not update task", e.message);
    } finally {
      setReassigning(false);
    }
  };
  const people = [...(employees ?? [])].sort((a, b) => (a.status === "active") === (b.status === "active") ? fullName(a).localeCompare(fullName(b)) : a.status === "active" ? -1 : 1);

  return (
    <>
      <PageHeader
        title={tr(task.title)}
        icon={CheckSquare}
        color={task.project_color || undefined}
        crumbs={[{ label: tr("Tasks"), href: "/tasks" }]}
        actions={
          <>
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <StatusBadge map={TASK_STATUS} value={task.status} />
          <StatusBadge map={TASK_PRIORITY} value={task.priority} dot={false} />
          {task.project_name ? (
            <Link href={`/projects/${task.project_id}`} className="inline-flex items-center gap-1 hover:text-accent">
              <span className="h-2 w-2 rounded-full" style={{ background: task.project_color }} /> {task.project_name}
            </Link>
          ) : null}
          <span>· updated {relativeTime(task.updated_at)}</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4 anim-stagger">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Description")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{task.description || <span className="text-fg-faint">No description. Click Edit to add one.</span>}</p>
          </Card>
          <AttachmentsPanel kind="task" parentId={task.id} attachments={task.attachments} onChange={(attachments) => setData((t) => ({ ...t, attachments, attachment_count: attachments.length }))} />
          <TaskOutputs taskId={task.id} outputs={task.outputs} onChange={(outputs) => setData((t) => ({ ...t, outputs, output_count: outputs.length }))} />
        </div>

        <div className="min-w-0 space-y-4 anim-stagger xl:sticky xl:top-0 xl:self-start">
          <Card className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Details")}</p>
            <Row label={tr("Status")}>
              <Select value={task.status} onChange={(e) => patch({ status: e.target.value })} className="h-8 text-xs">
                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
            </Row>
            <Row label={tr("Priority")}>
              <Select value={task.priority} onChange={(e) => patch({ priority: e.target.value })} className="h-8 text-xs">
                {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
            </Row>
            <Row label={tr("Due date")}>
              <Input type="date" value={task.due_date || ""} onChange={(e) => patch({ due_date: e.target.value || null })} className={cn("h-8 text-xs", overdue && "border-rose-500 text-rose-500")} />
            </Row>
            <Row label={tr("Assignee")}>
              {task.assignee_name ? (
                <Link href={`/employees/${task.employee_id}`} className="mb-1.5 flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 hover:bg-surface-2">
                  <Avatar name={task.assignee_name} color={task.avatar_color} size="xs" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium">{task.assignee_name}</span>
                    <span className="block truncate text-[11px] text-fg-muted">{task.assignee_title}</span>
                  </span>
                </Link>
              ) : null}
              <div className="relative">
                <UserRoundPen size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
                <Select value={task.employee_id ?? ""} onChange={(e) => askReassign(e.target.value)} className="h-8 pl-8 text-xs" aria-label={tr("Change assignee")}>
                  <option value="">{tr("Unassigned")}</option>
                  {people.map((e) => (
                    <option key={e.id} value={e.id}>{fullName(e)}{e.status !== "active" ? ` (${tr(e.status === "on_leave" ? "On leave" : "Inactive").toLowerCase()})` : ""}</option>
                  ))}
                </Select>
              </div>
              <ConfirmDialog
                open={!!reassign}
                onClose={() => setReassign(null)}
                onConfirm={confirmReassign}
                loading={reassigning}
                danger={false}
                title={tr(reassign?.employee_id ? "Reassign this task?" : "Remove the assignee?")}
                description={
                  reassign?.employee_id
                    ? tr("“{title}” moves from {from} to {to}. It shows up in their tasks and workload right away.", { title: task.title, from: task.assignee_name ?? tr("Unassigned"), to: reassign.name })
                    : tr("“{title}” will no longer be assigned to {from}.", { title: task.title, from: task.assignee_name ?? "" })
                }
                confirmText={tr(reassign?.employee_id ? "Reassign" : "Remove")}
              />
            </Row>
            <Row label={tr("Requirement")}>
              {task.requirement_id ? (
                <Link href={`/requirements/${task.requirement_id}`} className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 hover:bg-surface-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-pink-500/15 text-pink-500"><ClipboardList size={12} /></span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium">{task.requirement_title}</span>
                    <span className="block font-mono text-[11px] text-fg-muted">{task.requirement_code}</span>
                  </span>
                </Link>
              ) : (
                <button onClick={() => setEditOpen(true)} className="w-full rounded-app-sm border border-dashed border-line px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-surface-2">Not linked — link a requirement</button>
              )}
            </Row>
            <Row label={tr("Project")}>
              {task.project_name ? (
                <Link href={`/projects/${task.project_id}`} className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 hover:bg-surface-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: task.project_color }}><FolderKanban size={12} /></span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium">{task.project_name}</span>
                    <span className="block font-mono text-[11px] text-fg-muted">{task.project_code}</span>
                  </span>
                </Link>
              ) : (
                <button onClick={() => setEditOpen(true)} className="w-full rounded-app-sm border border-dashed border-line px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-surface-2">No project — link one</button>
              )}
            </Row>
          </Card>
          <Card className="space-y-2 text-xs text-fg-muted">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Meta")}</p>
            <p className="flex items-center gap-2"><Paperclip size={13} /> {task.attachments.length} attachment{task.attachments.length === 1 ? "" : "s"}</p>
            <p className="flex items-center gap-2"><FileText size={13} /> {task.outputs.length} output{task.outputs.length === 1 ? "" : "s"}</p>
            <p className="flex items-center gap-2"><Flag size={13} /> Sort order #{task.sort_order}</p>
            <p className="flex items-center gap-2"><Calendar size={13} /> Created {formatDateTime(task.created_at)}</p>
            <p className="flex items-center gap-2"><Clock size={13} /> Updated {formatDateTime(task.updated_at)}</p>
            {task.due_date ? <p className={cn("flex items-center gap-2", overdue && "font-medium text-rose-500")}><Calendar size={13} /> Due {formatDate(task.due_date)}{overdue ? " (overdue)" : ""}</p> : null}
          </Card>
        </div>
      </div>

      <TaskForm open={editOpen} onClose={() => setEditOpen(false)} initial={task} onSaved={refetch} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title="Delete this task?" description="All attachments and outputs are permanently removed." />
    </>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{label}</p>
      {children}
    </div>
  );
}
