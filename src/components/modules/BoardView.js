"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Paperclip, FileText, CalendarClock, Search, X, Rows3, LayoutGrid } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { usePrefs } from "@/lib/store";
import { MODULE_MAP, TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { todayIso } from "@/lib/dates";
import { cn, fullName, formatDate } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { Select, Segmented, Toggle } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TaskForm from "./TaskForm";
import { useT } from "@/lib/i18n";

const TONE_BAR = { slate: "bg-slate-400", sky: "bg-sky-500", violet: "bg-violet-500", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" };
const PRIORITY_DOT = { low: "bg-slate-400", medium: "bg-sky-500", high: "bg-amber-500", urgent: "bg-rose-500" };
const UNASSIGNED = "__none";

/** Column definitions per grouping: [{ key, label, tone, color, field, value }] */
function columnsFor(groupBy, employees) {
  if (groupBy === "priority") return Object.entries(TASK_PRIORITY).map(([k, v]) => ({ key: k, label: v.label, tone: v.tone, field: "priority", value: k }));
  if (groupBy === "assignee") {
    return [
      { key: UNASSIGNED, label: "Unassigned", tone: "slate", field: "employee_id", value: null },
      ...(employees ?? []).map((e) => ({ key: String(e.id), label: fullName(e), tone: "indigo", color: e.avatar_color, field: "employee_id", value: e.id })),
    ];
  }
  return Object.entries(TASK_STATUS).map(([k, v]) => ({ key: k, label: v.label, tone: v.tone, field: "status", value: k }));
}
const columnKeyOf = (task, groupBy) => (groupBy === "priority" ? task.priority : groupBy === "assignee" ? (task.employee_id ? String(task.employee_id) : UNASSIGNED) : task.status);

export default function BoardView() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const mod = MODULE_MAP.board;
  const groupBy = usePrefs((s) => s.boardGroupBy);
  const compact = usePrefs((s) => s.boardCompact);
  const setPrefs = usePrefs((s) => s.set);

  const [filters, setFilters] = useState({ project_id: "", employee_id: "", priority: "", q: "" });
  const [pendingDrop, setPendingDrop] = useState(null); // assignee change awaiting confirmation
  const qs = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v && k !== "q"));
  const { data: tasks, loading, error, setData, refetch } = useFetch(`/api/tasks${qs.toString() ? `?${qs}` : ""}`);
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");
  const [taskForm, setTaskForm] = useState({ open: false, initial: null, defaults: {} });
  const [drag, setDrag] = useState(null); // { id, from }
  const [over, setOver] = useState(null); // { col, index }
  const today = todayIso();

  const columns = useMemo(() => columnsFor(groupBy, employees), [groupBy, employees]);
  const byColumn = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const map = Object.fromEntries(columns.map((c) => [c.key, []]));
    for (const t of tasks ?? []) {
      if (q && !`${t.title} ${t.description ?? ""} ${t.project_name ?? ""} ${t.assignee_name ?? ""}`.toLowerCase().includes(q)) continue;
      const k = columnKeyOf(t, groupBy);
      (map[k] ??= []).push(t);
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    return map;
  }, [tasks, columns, groupBy, filters.q]);

  /** Apply a drop of task `id` (from column `from`) into column `col` at `index`: optimistic local update, then API. */
  const applyDrop = async ({ id, from }, col, index) => {
    const task = (tasks ?? []).find((t) => t.id === id);
    if (!task) return;
    const column = columns.find((c) => c.key === col);
    const source = byColumn[from] ?? [];
    const target = col === from ? source.filter((t) => t.id !== id) : [...(byColumn[col] ?? [])];
    const clamped = Math.max(0, Math.min(index, target.length));
    target.splice(clamped, 0, task);
    const orderIds = target.map((t) => t.id);
    const patch = col !== from ? { [column.field]: column.value } : null;

    setData((list) =>
      list.map((t) => {
        const pos = orderIds.indexOf(t.id);
        if (t.id === id && patch) t = { ...t, ...patch, ...(column.field === "employee_id" ? { assignee_name: column.value ? column.label : null, avatar_color: column.color ?? null } : {}) };
        return pos >= 0 ? { ...t, sort_order: pos + 1 } : t;
      })
    );
    setDrag(null);
    setOver(null);
    try {
      if (patch) {
        const saved = await api.put(`/api/tasks/${id}`, patch);
        setData((list) => list.map((t) => (t.id === id ? { ...t, ...saved, sort_order: orderIds.indexOf(t.id) + 1 } : t)));
      }
      await api.put("/api/tasks/reorder", { order: orderIds });
    } catch (e) {
      toast.error("Could not move task", e.message);
      refetch();
    }
  };

  /** Drop handler: moving a card into another assignee's column asks for confirmation first. */
  const dropTo = (col, index) => {
    if (!drag) return;
    const snapshot = { id: drag.id, from: drag.from };
    const column = columns.find((c) => c.key === col);
    if (column?.field === "employee_id" && col !== drag.from) {
      const task = (tasks ?? []).find((t) => t.id === drag.id);
      setPendingDrop({ ...snapshot, col, index, title: task?.title ?? "", fromName: task?.assignee_name ?? null, toName: column.value ? column.label : null });
      setDrag(null);
      setOver(null);
      return;
    }
    applyDrop(snapshot, col, index);
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const defaultsFor = (col) => {
    const c = columns.find((x) => x.key === col);
    const d = {};
    if (c?.field === "status") d.status = c.value;
    if (c?.field === "priority") d.priority = c.value;
    if (c?.field === "employee_id" && c.value) d.employee_id = c.value;
    if (filters.project_id) d.project_id = filters.project_id;
    return d;
  };
  const quickAdd = async (col, title) => {
    try {
      const saved = await api.post("/api/tasks", { title, ...defaultsFor(col) });
      setData((list) => [saved, ...(list ?? [])]);
      toast.success("Task added", saved.title);
    } catch (e) {
      toast.error("Could not add task", e.message);
    }
  };
  const total = (tasks ?? []).length;

  return (
    <>
      <PageHeader
        title={tr("Board")}
        description={tr(mod.description)}
        icon={mod.icon}
        color={mod.color}
        crumbs={[]}
        actions={<Button icon={Plus} onClick={() => setTaskForm({ open: true, initial: null, defaults: filters.project_id ? { project_id: filters.project_id } : {} })}>{tr("New task")}</Button>}
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input value={filters.q} onChange={setFilter("q")} placeholder={tr("Filter cards…")} className="control h-8 pl-8 pr-7 text-xs" />
          {filters.q ? <button onClick={() => setFilters((f) => ({ ...f, q: "" }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg" aria-label={tr("Clear")}><X size={13} /></button> : null}
        </div>
        <Select value={filters.project_id} onChange={setFilter("project_id")} className="h-8 w-40 text-xs"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        {groupBy !== "assignee" ? <Select value={filters.employee_id} onChange={setFilter("employee_id")} className="h-8 w-36 text-xs"><option value="">{tr("Anyone")}</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select> : null}
        {groupBy !== "priority" ? <Select value={filters.priority} onChange={setFilter("priority")} className="h-8 w-32 text-xs"><option value="">{tr("Any priority")}</option>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select> : null}
        <span className="text-xs text-fg-muted">{loading && !tasks ? "Loading…" : `${total} task${total === 1 ? "" : "s"}`}</span>
        <span className="flex-1" />
        <Toggle size="sm" checked={compact} onChange={(v) => setPrefs({ boardCompact: v })} label={tr("Compact")} className="gap-2 text-xs" />
        <Segmented
          size="sm"
          value={groupBy}
          onChange={(v) => setPrefs({ boardGroupBy: v })}
          options={[
            { value: "status", label: tr("Status") },
            { value: "priority", label: tr("Priority") },
            { value: "assignee", label: tr("Assignee") },
          ]}
        />
      </div>

      {error ? <EmptyState title="Could not load tasks" description={error.message} /> : null}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3" style={{ minHeight: "calc(100vh - var(--topbar-h) - var(--bottombar-h) - 230px)" }}>
        {columns.map((c) => {
          const list = byColumn[c.key] ?? [];
          const isOverCol = drag && over?.col === c.key;
          return (
            <section
              key={c.key}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                // insertion index from the pointer position among cards
                const cards = [...e.currentTarget.querySelectorAll("[data-card]")].filter((el) => Number(el.dataset.card) !== drag.id);
                let index = cards.length;
                for (let i = 0; i < cards.length; i++) {
                  const r = cards[i].getBoundingClientRect();
                  if (e.clientY < r.top + r.height / 2) { index = i; break; }
                }
                if (over?.col !== c.key || over?.index !== index) setOver({ col: c.key, index });
              }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o?.col === c.key ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); dropTo(c.key, over?.col === c.key ? over.index : list.length); }}
              className={cn("card flex w-[288px] shrink-0 flex-col p-0 transition-shadow", isOverCol && "ring-2 ring-accent/50")}
            >
              <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                {c.color ? <Avatar name={c.label} color={c.color} size="xs" /> : <span className={cn("h-2.5 w-2.5 rounded-full", TONE_BAR[c.tone])} />}
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{tr(c.label)}</h3>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-fg-muted">{list.length}</span>
                <button onClick={() => setTaskForm({ open: true, initial: null, defaults: defaultsFor(c.key) })} className="grid h-6 w-6 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={`New task in ${c.label}`} title={tr("New task here")}>
                  <Plus size={14} />
                </button>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {loading && !tasks ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />) : null}
                {list.map((t, i) => (
                  <div key={t.id}>
                    {isOverCol && over.index === i && drag.id !== t.id ? <div className="mb-2 h-1 rounded-full bg-accent" /> : null}
                    <Card
                      task={t}
                      compact={compact}
                      today={today}
                      dragging={drag?.id === t.id}
                      onDragStart={() => setDrag({ id: t.id, from: c.key })}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onOpen={() => router.push(`/tasks/${t.id}`)}
                      onEdit={() => setTaskForm({ open: true, initial: t, defaults: {} })}
                    />
                  </div>
                ))}
                {isOverCol && over.index >= list.filter((t) => t.id !== drag?.id).length ? <div className="h-1 rounded-full bg-accent" /> : null}
                {!loading && list.length === 0 && !isOverCol ? <p className="rounded-app border border-dashed border-line px-3 py-6 text-center text-xs text-fg-faint">{tr("Drop tasks here")}</p> : null}
              </div>
              <QuickAdd onAdd={(title) => quickAdd(c.key, title)} />
            </section>
          );
        })}
      </div>

      <TaskForm open={taskForm.open} onClose={() => setTaskForm({ open: false, initial: null, defaults: {} })} initial={taskForm.initial} defaults={taskForm.defaults} onSaved={refetch} />
      <ConfirmDialog
        open={!!pendingDrop}
        onClose={() => setPendingDrop(null)}
        onConfirm={() => {
          const p = pendingDrop;
          setPendingDrop(null);
          applyDrop({ id: p.id, from: p.from }, p.col, p.index);
        }}
        danger={false}
        title={tr(pendingDrop?.toName ? "Reassign this task?" : "Remove the assignee?")}
        description={
          pendingDrop?.toName
            ? tr("“{title}” moves from {from} to {to}. It shows up in their tasks and workload right away.", { title: pendingDrop.title, from: pendingDrop.fromName ?? tr("Unassigned"), to: pendingDrop.toName })
            : tr("“{title}” will no longer be assigned to {from}.", { title: pendingDrop?.title ?? "", from: pendingDrop?.fromName ?? "" })
        }
        confirmText={tr(pendingDrop?.toName ? "Reassign" : "Remove")}
      />
    </>
  );
}

function Card({ task: t, compact, today, dragging, onDragStart, onDragEnd, onOpen, onEdit }) {
  const overdue = t.status !== "done" && t.due_date && t.due_date < today;
  return (
    <article
      data-card={t.id}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(t.id)); } catch {} onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      className={cn(
        "group cursor-grab rounded-app border border-line bg-surface p-2.5 shadow-sm transition hover:border-line-strong hover:shadow-app active:cursor-grabbing",
        dragging && "opacity-40",
        t.status === "done" && "opacity-70"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: t.project_color || "var(--line-strong)" }}
      title="Click to open · double-click to edit · drag to move"
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} title={TASK_PRIORITY[t.priority]?.label} />
        <p className={cn("min-w-0 flex-1 text-sm font-medium leading-snug", t.status === "done" && "line-through", compact && "truncate")}>{t.title}</p>
      </div>
      {!compact && t.description ? <p className="mt-1 line-clamp-2 pl-4 text-[11px] text-fg-muted">{t.description}</p> : null}
      <div className="mt-2 flex items-center gap-2 pl-4 text-[11px] text-fg-muted">
        {t.project_name ? (
          <Link href={`/projects/${t.project_id}`} onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 hover:text-fg">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.project_color }} />
            <span className="truncate font-mono">{t.project_code}</span>
          </Link>
        ) : null}
        {t.requirement_code ? <span className="font-mono text-fg-faint">{t.requirement_code}</span> : null}
        <span className="flex-1" />
        {t.attachment_count ? <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{t.attachment_count}</span> : null}
        {t.output_count ? <span className="inline-flex items-center gap-0.5"><FileText size={11} />{t.output_count}</span> : null}
        {t.due_date ? <span className={cn("inline-flex items-center gap-0.5", overdue && "font-medium text-rose-500")}><CalendarClock size={11} />{formatDate(t.due_date, { month: "short", day: "numeric" })}</span> : null}
        {t.assignee_name ? <Avatar name={t.assignee_name} color={t.avatar_color} size="xs" /> : null}
      </div>
    </article>
  );
}

function QuickAdd({ onAdd }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    await onAdd(v);
    setTitle("");
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-left text-xs text-fg-muted transition hover:bg-surface-2 hover:text-fg">
        <Plus size={13} /> Add task
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="border-t border-line p-2">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setTitle(""); } }} placeholder={tr("Task title, then Enter")} className="control h-8 text-xs" />
      <div className="mt-1.5 flex items-center gap-1">
        <Button type="submit" size="xs">{tr("Add")}</Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => { setOpen(false); setTitle(""); }}>{tr("Cancel")}</Button>
      </div>
    </form>
  );
}
