"use client";
import { useState } from "react";
import Link from "next/link";
import { useNav } from "@/lib/nav";
import { Pencil, Trash2, CheckSquare, FolderKanban, Calendar, Clock, Paperclip, FileText, Flag, ClipboardList, UserRoundPen, MessageSquare, Lock, Repeat, X, ArrowUp } from "lucide-react";
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
import TaskActivity from "./TaskActivity";
import TaskChecklist from "./TaskChecklist";
import TaskDependencies from "./TaskDependencies";
import TaskTime from "./TaskTime";
import { REPEAT_RULES } from "@/lib/recurrence";
import { TagChips, putTask } from "./shared";
import { DetailSkeleton } from "./ProjectDetail";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CanEdit, CanDelete, useAccess } from "@/lib/auth-context";
import ReportButton from "@/components/report/ReportButton";

export default function TaskDetail({ id }) {
  const { canEdit } = useAccess();
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: task, loading, error, refetch, setData } = useFetch(`/api/tasks/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: employees } = useFetch("/api/employees");

  if (error) return <EmptyState title="Task not found" description={error.message} action={<Button onClick={() => router.push("/tasks")}>Back to tasks</Button>} />;
  if (loading && !task) return <DetailSkeleton />;
  if (!task) return null;

  const patch = async (p) => {
    try {
      const saved = await putTask(id, p, { toast, tr });
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

  const setPeople = (ids) => patch({ assignee_ids: ids });
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
            <ReportButton module="tasks" id={id} />
            <CanEdit><Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button></CanEdit>
            <CanDelete><Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button></CanDelete>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <StatusBadge map={TASK_STATUS} value={task.status} />
          <StatusBadge map={TASK_PRIORITY} value={task.priority} dot={false} />
          {task.repeat_rule ? <span className="task-repeats inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-600"><Repeat size={11} /> {tr(REPEAT_RULES[task.repeat_rule]?.label ?? "Repeats")}</span> : null}
          {task.repeat_next_id ? <Link href={`/tasks/${task.repeat_next_id}`} className="task-next inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] hover:border-accent hover:text-accent">{tr("Next in the series")} →</Link> : null}
          {Number(task.blocked_by_open) > 0 && task.status !== "done" ? <span className="task-blocked inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600"><Lock size={11} /> {tr("Blocked")}</span> : null}
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
          <TaskChecklist taskId={task.id} items={task.checklist ?? []} onChange={(checklist) => setData((t) => ({ ...t, checklist, checklist_total: checklist.length, checklist_done: checklist.filter((i) => i.done).length }))} />
          <AttachmentsPanel kind="task" parentId={task.id} attachments={task.attachments} onChange={(attachments) => setData((t) => ({ ...t, attachments, attachment_count: attachments.length }))} />
          <TaskOutputs taskId={task.id} outputs={task.outputs} onChange={(outputs) => setData((t) => ({ ...t, outputs, output_count: outputs.length }))} />
          <TaskActivity taskId={task.id} version={`${task.updated_at}:${task.dependency_count}:${task.attachments.length}:${task.outputs.length}:${(task.checklist ?? []).map((i) => `${i.id}${i.done}`).join()}`} onCount={(n) => setData((t) => ({ ...t, comment_count: n }))} />
        </div>

        <div className="min-w-0 space-y-4 anim-stagger xl:sticky xl:top-0 xl:self-start">
          <Card className="space-y-4">
            <fieldset disabled={!canEdit} className="contents">
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
            <Row label={tr("Start date")}>
              <Input type="date" value={task.start_date || ""} max={task.due_date || undefined} onChange={(e) => patch({ start_date: e.target.value || null })} className="h-8 text-xs" />
            </Row>
            <Row label={tr("Due date")}>
              <Input type="date" value={task.due_date || ""} onChange={(e) => patch({ due_date: e.target.value || null })} className={cn("h-8 text-xs", overdue && "border-rose-500 text-rose-500")} />
            </Row>
            <Row label={tr("Estimate (hours)")}>
              <Input type="number" min="0" max="9999" step="0.25" inputMode="decimal" key={`est-${task.estimate_hours}`} defaultValue={task.estimate_hours ?? ""} placeholder="—" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (task.estimate_hours ?? null)) patch({ estimate_hours: v }); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="h-8 text-xs" />
            </Row>
            <Row label={tr("Tags")}>
              <TagChips tags={task.tags} className="mb-1.5" max={20} />
              <Input key={`tags-${task.tags}`} defaultValue={String(task.tags ?? "").split(",").filter(Boolean).join(", ")} placeholder={tr("bug, client-x")} onBlur={(e) => { const next = e.target.value; if (next.split(",").map((x) => x.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean).join(",") !== (task.tags ?? "")) patch({ tags: next }); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="task-tags-inline h-8 text-xs" />
            </Row>
            <Row label={tr("Repeats")}>
              <Select value={task.repeat_rule ?? ""} onChange={(e) => patch({ repeat_rule: e.target.value || null })} className="task-repeat-inline h-8 text-xs">
                <option value="">{tr("Does not repeat")}</option>
                {Object.entries(REPEAT_RULES).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
              {task.repeat_rule ? <Input type="date" value={task.repeat_until || ""} onChange={(e) => patch({ repeat_until: e.target.value || null })} className="mt-1.5 h-8 text-xs" aria-label={tr("Repeat until")} title={tr("Repeat until")} /> : null}
            </Row>
            <Row label={tr("Assignees")}>
              {(task.assignees ?? []).length ? (
                <ul className="task-assignees mb-1.5 space-y-1">
                  {task.assignees.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5">
                      <Avatar name={p.name} color={p.avatar_color} size="xs" />
                      <Link href={`/employees/${p.id}`} className="min-w-0 flex-1 leading-tight hover:text-accent">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-[11px] text-fg-muted">{[i === 0 && task.assignees.length > 1 ? tr("Lead") : null, p.job_title].filter(Boolean).join(" · ")}</span>
                      </Link>
                      {i > 0 ? <Button variant="ghost" size="iconXs" icon={ArrowUp} onClick={() => setPeople([p.id, ...task.assignees.filter((x) => x.id !== p.id).map((x) => x.id)])} aria-label={tr("Make lead")} data-tip={tr("Make lead")} /> : null}
                      <Button variant="ghost" size="iconXs" icon={X} onClick={() => setPeople(task.assignees.filter((x) => x.id !== p.id).map((x) => x.id))} aria-label={tr("Remove assignee")} data-tip={tr("Remove")} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="relative">
                <UserRoundPen size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
                <Select value="" onChange={(e) => e.target.value && setPeople([...(task.assignees ?? []).map((x) => x.id), Number(e.target.value)])} className="task-add-assignee h-8 pl-8 text-xs" aria-label={tr("Add assignee")}>
                  <option value="">{(task.assignees ?? []).length ? tr("Add another person…") : tr("Unassigned: pick someone…")}</option>
                  {people.filter((e) => !(task.assignees ?? []).some((x) => x.id === e.id)).map((e) => (
                    <option key={e.id} value={e.id}>{fullName(e)}{e.status !== "active" ? ` (${tr(e.status === "on_leave" ? "On leave" : "Inactive").toLowerCase()})` : ""}</option>
                  ))}
                </Select>
              </div>
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
            </fieldset>
          </Card>
          <TaskTime taskId={task.id} estimateHours={task.estimate_hours} onTotal={(m) => setData((t) => ({ ...t, minutes_logged: m }))} />
          <TaskDependencies taskId={task.id} onChange={(d) => setData((t) => ({ ...t, blocked_by_open: d.open, dependency_count: d.blocked_by.length }))} />
          <Card className="space-y-2 text-xs text-fg-muted">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Meta")}</p>
            <p className="flex items-center gap-2"><Paperclip size={13} /> {task.attachments.length} attachment{task.attachments.length === 1 ? "" : "s"}</p>
            <p className="flex items-center gap-2"><FileText size={13} /> {task.outputs.length} output{task.outputs.length === 1 ? "" : "s"}</p>
            <p className="flex items-center gap-2"><MessageSquare size={13} /> {task.comment_count ?? 0} comment{task.comment_count === 1 ? "" : "s"}</p>
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
