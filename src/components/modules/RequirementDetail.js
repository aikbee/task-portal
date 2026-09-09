"use client";
import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Plus, ClipboardList, FolderKanban, Calendar, Clock, Hash, ListChecks } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { REQ_TYPE, REQ_PRIORITY, REQ_STATUS, TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { formatDateTime, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState, ProgressBar } from "@/components/ui/Misc";
import { Select } from "@/components/ui/Controls";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/table/DataTable";
import { useToast } from "@/components/ui/Toast";
import RequirementForm from "./RequirementForm";
import TaskForm from "./TaskForm";
import AttachmentsPanel from "./AttachmentsPanel";
import { DetailSkeleton } from "./ProjectDetail";
import { RowActions, PersonCell, DueDateCell, InlineSelect, useDeleteFlow } from "./shared";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function RequirementDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: req, loading, error, refetch, setData } = useFetch(`/api/requirements/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taskForm, setTaskForm] = useState({ open: false, initial: null });
  const taskDel = useDeleteFlow("/api/tasks", { toast, label: "task", onDeleted: () => refetch() });

  if (error) return <EmptyState title="Requirement not found" description={error.message} action={<Button onClick={() => router.push("/requirements")}>Back to requirements</Button>} />;
  if (loading && !req) return <DetailSkeleton />;
  if (!req) return null;

  const patch = async (p) => {
    try {
      setData(await api.put(`/api/requirements/${id}`, p));
    } catch (e) {
      toast.error("Could not update requirement", e.message);
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/requirements/${id}`);
      toast.success("Requirement deleted");
      router.push("/requirements");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };
  const quickUpdateTask = async (row, p) => {
    try {
      const saved = await api.put(`/api/tasks/${row.id}`, p);
      setData((r) => ({ ...r, tasks: r.tasks.map((t) => (t.id === row.id ? { ...t, ...saved } : t)) }));
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };
  const done = req.tasks.filter((t) => t.status === "done").length;
  const pct = req.tasks.length ? Math.round((done / req.tasks.length) * 100) : 0;
  const criteria = (req.acceptance_criteria || "").split("\n").map((l) => l.trim()).filter(Boolean);

  const taskColumns = [
    { key: "title", label: tr("Task"), hideable: false, render: (r) => <span className="block max-w-md truncate font-medium">{r.title}</span> },
    { key: "assignee_name", label: tr("Assignee"), render: (r) => <PersonCell id={r.employee_id} name={r.assignee_name} color={r.avatar_color} /> },
    { key: "status", label: tr("Status"), render: (r) => <InlineSelect value={r.status} map={TASK_STATUS} onChange={(v) => quickUpdateTask(r, { status: v })} /> },
    { key: "priority", label: tr("Priority"), render: (r) => <StatusBadge map={TASK_PRIORITY} value={r.priority} /> },
    { key: "due_date", label: tr("Due"), render: (r) => <DueDateCell date={r.due_date} status={r.status} /> },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={`${req.code} · ${req.title}`}
        icon={ClipboardList}
        color={req.project_color || undefined}
        crumbs={[{ label: tr("Requirements"), href: "/requirements" }]}
        actions={
          <>
            <ReportButton module="requirements" id={id} />
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <StatusBadge map={REQ_STATUS} value={req.status} />
          <StatusBadge map={REQ_PRIORITY} value={req.priority} />
          <StatusBadge map={REQ_TYPE} value={req.type} dot={false} />
          <Link href={`/projects/${req.project_id}`} className="inline-flex items-center gap-1 hover:text-accent">
            <span className="h-2 w-2 rounded-full" style={{ background: req.project_color }} /> {req.project_name}
          </Link>
          <span>· updated {relativeTime(req.updated_at)}</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4 anim-stagger">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Description")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{req.description || <span className="text-fg-faint">No description. Click Edit to add one.</span>}</p>
          </Card>
          <Card>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><ListChecks size={13} />{tr("Acceptance criteria")}</p>
            {criteria.length ? (
              <ul className="mt-3 space-y-1.5">
                {criteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="leading-relaxed">{c.replace(/^[-*•]\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-fg-faint">No acceptance criteria yet — add one per line in Edit.</p>
            )}
          </Card>
          <AttachmentsPanel kind="requirement" parentId={req.id} attachments={req.attachments ?? []} onChange={(attachments) => setData((r) => ({ ...r, attachments }))} />
          <DataTable
            id="requirement-tasks"
            columns={taskColumns}
            rows={req.tasks}
            defaultSort={{ key: "status", dir: "asc" }}
            searchPlaceholder="Search linked tasks…"
            onRowClick={(r) => router.push(`/tasks/${r.id}`)}
            toolbar={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>{tr("New task")}</Button>}
            rowActions={(r) => <RowActions href={`/tasks/${r.id}`} onEdit={() => setTaskForm({ open: true, initial: r })} onDelete={() => taskDel.setTarget(r)} />}
            emptyTitle="No tasks implement this yet"
            emptyDescription="Create a task here, or link an existing one from its edit form."
            emptyAction={<Button size="sm" icon={Plus} onClick={() => setTaskForm({ open: true, initial: null })}>Create task</Button>}
          />
        </div>

        <div className="min-w-0 space-y-4 anim-stagger xl:sticky xl:top-0 xl:self-start">
          <Card className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Details")}</p>
            <Row label={tr("Status")}>
              <Select value={req.status} onChange={(e) => patch({ status: e.target.value })} className="h-8 text-xs">
                {Object.entries(REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
            </Row>
            <Row label={tr("Priority")}>
              <Select value={req.priority} onChange={(e) => patch({ priority: e.target.value })} className="h-8 text-xs">
                {Object.entries(REQ_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
            </Row>
            <Row label={tr("Type")}>
              <Select value={req.type} onChange={(e) => patch({ type: e.target.value })} className="h-8 text-xs">
                {Object.entries(REQ_TYPE).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </Select>
            </Row>
            <Row label={tr("Stakeholder")}>
              {req.stakeholder_name ? (
                <Link href={`/employees/${req.employee_id}`} className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 hover:bg-surface-2">
                  <Avatar name={req.stakeholder_name} color={req.stakeholder_color} size="xs" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium">{req.stakeholder_name}</span>
                    <span className="block truncate text-[11px] text-fg-muted">{req.stakeholder_title}</span>
                  </span>
                </Link>
              ) : (
                <button onClick={() => setEditOpen(true)} className="w-full rounded-app-sm border border-dashed border-line px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-surface-2">Unassigned — assign</button>
              )}
            </Row>
            <Row label={tr("Project")}>
              <Link href={`/projects/${req.project_id}`} className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 hover:bg-surface-2">
                <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: req.project_color }}><FolderKanban size={12} /></span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">{req.project_name}</span>
                  <span className="block font-mono text-[11px] text-fg-muted">{req.project_code}</span>
                </span>
              </Link>
            </Row>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Delivery")}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{pct}%</p>
            <p className="text-xs text-fg-muted">{done} of {req.tasks.length} linked task{req.tasks.length === 1 ? "" : "s"} done</p>
            <ProgressBar value={pct} color={req.project_color} size="md" className="mt-3" />
          </Card>
          <Card className="space-y-2 text-xs text-fg-muted">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Meta")}</p>
            <p className="flex items-center gap-2"><Hash size={13} /> {req.code} · position #{req.sort_order} in project</p>
            <p className="flex items-center gap-2"><Calendar size={13} /> Created {formatDateTime(req.created_at)}</p>
            <p className="flex items-center gap-2"><Clock size={13} /> Updated {formatDateTime(req.updated_at)}</p>
          </Card>
        </div>
      </div>

      <RequirementForm open={editOpen} onClose={() => setEditOpen(false)} initial={req} onSaved={refetch} />
      <TaskForm open={taskForm.open} onClose={() => setTaskForm({ open: false, initial: null })} initial={taskForm.initial} defaults={{ project_id: req.project_id, requirement_id: req.id }} onSaved={refetch} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title={`Delete ${req.code}?`} description="Linked tasks are kept but unlinked." />
      <ConfirmDialog open={!!taskDel.target} onClose={() => taskDel.setTarget(null)} onConfirm={taskDel.confirm} loading={taskDel.busy} title={tr("Delete task?")} description="Its attachments and outputs will be removed too." />
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
