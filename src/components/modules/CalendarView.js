"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Flag, List, LayoutGrid, Rows3, X, CalendarCheck } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { usePrefs } from "@/lib/store";
import { MODULE_MAP, TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { isoDate, parseIso, todayIso, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, WEEKDAYS, monthTitle } from "@/lib/dates";
import { cn, fullName, formatDate, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Select, Toggle, Segmented } from "@/components/ui/Controls";
import { StatusBadge } from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import TaskForm from "./TaskForm";
import { InlineSelect } from "./shared";
import { useT } from "@/lib/i18n";

const PRIORITY_DOT = { low: "bg-slate-400", medium: "bg-sky-500", high: "bg-amber-500", urgent: "bg-rose-500" };

/** Visible date range for a view anchored on `cursor`. */
function rangeFor(view, cursor) {
  if (view === "week") {
    const s = startOfWeek(cursor);
    return { start: s, end: addDays(s, 6) };
  }
  if (view === "agenda") {
    const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    return { start: s, end: addDays(s, 41) };
  }
  const s = startOfWeek(startOfMonth(cursor));
  return { start: s, end: addDays(s, 41) }; // 6 rows
}

export default function CalendarView() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const mod = MODULE_MAP.calendar;
  const view = usePrefs((s) => s.calendarView);
  const hideDone = usePrefs((s) => s.calendarHideDone);
  const showDeadlines = usePrefs((s) => s.calendarShowDeadlines);
  const setPrefs = usePrefs((s) => s.set);

  const [cursor, setCursor] = useState(() => new Date());
  const [filters, setFilters] = useState({ project_id: "", employee_id: "", status: "" });
  const [selected, setSelected] = useState(() => todayIso());
  const [taskForm, setTaskForm] = useState({ open: false, initial: null, defaults: {} });
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const { start, end } = rangeFor(view, cursor);
  const qs = new URLSearchParams({ due_from: isoDate(start), due_to: isoDate(end), has_due: "1" });
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const { data: tasks, loading, error, setData, refetch } = useFetch(`/api/tasks?${qs}`);
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");

  const today = todayIso();
  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks ?? []) {
      if (hideDone && t.status === "done") continue;
      (map[t.due_date] ??= []).push(t);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.status === "done") - (b.status === "done") || Object.keys(TASK_PRIORITY).indexOf(b.priority) - Object.keys(TASK_PRIORITY).indexOf(a.priority) || a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks, hideDone]);
  const deadlinesByDay = useMemo(() => {
    const map = {};
    if (!showDeadlines) return map;
    for (const p of projects ?? []) {
      if (!p.end_date) continue;
      if (filters.project_id && String(p.id) !== String(filters.project_id)) continue;
      (map[p.end_date] ??= []).push(p);
    }
    return map;
  }, [projects, showDeadlines, filters.project_id]);

  const days = useMemo(() => {
    const out = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(isoDate(d));
    return out;
  }, [start, end]);

  const go = (n) => setCursor((c) => (view === "month" ? addMonths(c, n) : view === "week" ? addDays(c, 7 * n) : addDays(c, 14 * n)));
  const goToday = () => {
    setCursor(new Date());
    setSelected(today);
  };

  const reschedule = async (taskId, due_date) => {
    const t = (tasks ?? []).find((x) => x.id === taskId);
    if (!t || t.due_date === due_date) return;
    setData((list) => list.map((x) => (x.id === taskId ? { ...x, due_date } : x)));
    try {
      await api.put(`/api/tasks/${taskId}`, { due_date });
      toast.success("Task rescheduled", `${t.title} → ${formatDate(due_date)}`);
    } catch (e) {
      toast.error("Could not reschedule", e.message);
      refetch();
    }
  };
  const quickStatus = async (t, status) => {
    try {
      const saved = await api.put(`/api/tasks/${t.id}`, { status });
      setData((list) => list.map((x) => (x.id === t.id ? { ...x, ...saved } : x)));
    } catch (e) {
      toast.error("Could not update task", e.message);
    }
  };

  const title =
    view === "week"
      ? `${formatDate(isoDate(start), { month: "short", day: "numeric" })} – ${formatDate(isoDate(end), { month: "short", day: "numeric", year: "numeric" })}`
      : view === "agenda"
      ? `From ${formatDate(isoDate(start))}`
      : monthTitle(cursor);
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const selectedTasks = byDay[selected] ?? [];
  const visibleCount = Object.values(byDay).reduce((a, l) => a + l.length, 0);

  return (
    <>
      <PageHeader
        title={tr("Calendar")}
        description={tr(mod.description)}
        icon={mod.icon}
        color={mod.color}
        crumbs={[]}
        actions={<Button icon={Plus} onClick={() => setTaskForm({ open: true, initial: null, defaults: { due_date: selected || today } })}>{tr("New task")}</Button>}
      />

      {/* toolbar */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="iconSm" icon={ChevronLeft} onClick={() => go(-1)} aria-label="Previous" />
          <Button variant="outline" size="sm" onClick={goToday}>{tr("Today")}</Button>
          <Button variant="ghost" size="iconSm" icon={ChevronRight} onClick={() => go(1)} aria-label="Next" />
        </div>
        <h2 className="min-w-[180px] text-base font-semibold tracking-tight">{title}</h2>
        <span className="text-xs text-fg-muted">{loading && !tasks ? "Loading…" : `${visibleCount} task${visibleCount === 1 ? "" : "s"} in view`}</span>
        <span className="flex-1" />
        <Select value={filters.project_id} onChange={setFilter("project_id")} className="h-8 w-40 text-xs"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={filters.employee_id} onChange={setFilter("employee_id")} className="h-8 w-40 text-xs"><option value="">{tr("Anyone")}</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
        <Select value={filters.status} onChange={setFilter("status")} className="h-8 w-32 text-xs"><option value="">{tr("All statuses")}</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
        <Toggle size="sm" checked={hideDone} onChange={(v) => setPrefs({ calendarHideDone: v })} label={tr("Hide done")} className="gap-2 text-xs" />
        <Toggle size="sm" checked={showDeadlines} onChange={(v) => setPrefs({ calendarShowDeadlines: v })} label={tr("Deadlines")} className="gap-2 text-xs" />
        <Segmented
          size="sm"
          value={view}
          onChange={(v) => setPrefs({ calendarView: v })}
          options={[
            { value: "month", label: tr("Month"), icon: LayoutGrid },
            { value: "week", label: tr("Week"), icon: Rows3 },
            { value: "agenda", label: tr("Agenda"), icon: List },
          ]}
        />
      </div>

      {error ? <EmptyState title="Could not load tasks" description={error.message} /> : null}

      <div className={cn("grid grid-cols-1 gap-4", view !== "agenda" && "xl:grid-cols-[1fr_320px]")}>
        {view === "agenda" ? (
          <Agenda days={days} byDay={byDay} deadlinesByDay={deadlinesByDay} today={today} loading={loading && !tasks} onOpen={(t) => router.push(`/tasks/${t.id}`)} onStatus={quickStatus} onNew={(day) => setTaskForm({ open: true, initial: null, defaults: { due_date: day } })} />
        ) : (
          <Card padding={false} className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-7 border-b border-line bg-surface-2/60 text-center text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className={cn("grid min-w-[640px] grid-cols-7", view === "week" ? "min-h-[520px]" : "")}>
              {days.map((day) => {
                const d = parseIso(day);
                const inMonth = view !== "month" || d.getMonth() === cursor.getMonth();
                const list = byDay[day] ?? [];
                const deadlines = deadlinesByDay[day] ?? [];
                const isToday = day === today;
                const isSelected = day === selected;
                const max = view === "week" ? 50 : 3;
                const overflow = list.length - max;
                return (
                  <div
                    key={day}
                    onClick={() => setSelected(day)}
                    onDoubleClick={() => setTaskForm({ open: true, initial: null, defaults: { due_date: day } })}
                    onDragOver={(e) => { if (dragId != null) { e.preventDefault(); setOverDay(day); } }}
                    onDragLeave={() => setOverDay((o) => (o === day ? null : o))}
                    onDrop={(e) => { e.preventDefault(); if (dragId != null) reschedule(dragId, day); setDragId(null); setOverDay(null); }}
                    className={cn(
                      "group relative flex min-h-[112px] cursor-pointer flex-col border-b border-r border-line/70 p-1.5 transition-colors",
                      view === "week" && "min-h-[520px]",
                      !inMonth && "bg-surface-2/40 text-fg-faint",
                      isSelected && "bg-accent/6",
                      overDay === day && dragId != null && "bg-accent/15 ring-2 ring-inset ring-accent/50"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-medium", isToday ? "bg-accent text-white" : inMonth ? "text-fg" : "text-fg-faint")}>{d.getDate()}</span>
                      <span className="flex items-center gap-1">
                        {deadlines.map((p) => (
                          <Link key={p.id} href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: p.color }} title={`${p.name} ends ${formatDate(p.end_date)}`}>
                            <Flag size={10} />
                          </Link>
                        ))}
                        <button
                          onClick={(e) => { e.stopPropagation(); setTaskForm({ open: true, initial: null, defaults: { due_date: day } }); }}
                          className="grid h-5 w-5 place-items-center rounded-md text-fg-faint opacity-0 transition hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
                          aria-label={`New task on ${day}`}
                          title="New task on this day"
                        >
                          <Plus size={12} />
                        </button>
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      {list.slice(0, max).map((t) => (
                        <TaskChip key={t.id} task={t} today={today} dragging={dragId === t.id} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverDay(null); }} onOpen={() => router.push(`/tasks/${t.id}`)} />
                      ))}
                      {overflow > 0 ? <span className="px-1 text-[11px] font-medium text-fg-muted">+{overflow} more</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {view !== "agenda" ? (
          <DayPanel
            day={selected}
            today={today}
            tasks={selectedTasks}
            deadlines={deadlinesByDay[selected] ?? []}
            loading={loading && !tasks}
            onClose={() => setSelected(null)}
            onOpen={(t) => router.push(`/tasks/${t.id}`)}
            onStatus={quickStatus}
            onNew={() => setTaskForm({ open: true, initial: null, defaults: { due_date: selected } })}
            onEdit={(t) => setTaskForm({ open: true, initial: t, defaults: {} })}
          />
        ) : null}
      </div>

      <TaskForm open={taskForm.open} onClose={() => setTaskForm({ open: false, initial: null, defaults: {} })} initial={taskForm.initial} defaults={taskForm.defaults} onSaved={refetch} />
    </>
  );
}

function TaskChip({ task: t, today, dragging, onDragStart, onDragEnd, onOpen }) {
  const overdue = t.status !== "done" && t.due_date < today;
  return (
    <button
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(t.id)); } catch {} onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      title={`${t.title}${t.project_name ? ` · ${t.project_name}` : ""}${t.assignee_name ? ` · ${t.assignee_name}` : ""}`}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border border-line/70 bg-surface px-1.5 py-1 text-left text-[11px] leading-tight transition hover:border-line-strong hover:bg-surface-2",
        dragging && "opacity-40",
        t.status === "done" && "opacity-60"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: t.project_color || "var(--line-strong)" }}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} />
      <span className={cn("min-w-0 flex-1 truncate font-medium", t.status === "done" && "line-through", overdue && "text-rose-500")}>{t.title}</span>
      {t.avatar_color ? <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-surface" style={{ background: t.avatar_color }} title={t.assignee_name} /> : null}
    </button>
  );
}

function DayPanel({ day, today, tasks, deadlines, loading, onClose, onOpen, onStatus, onNew, onEdit }) {
  const tr = useT();
  if (!day) {
    return (
      <Card className="hidden xl:block">
        <EmptyState compact icon={CalendarDays} title={tr("Pick a day")} description={tr("Click a day to see its tasks here. Double-click a day to add a task.")} />
      </Card>
    );
  }
  const d = parseIso(day);
  const isToday = day === today;
  return (
    <Card className="xl:sticky xl:top-0 xl:self-start">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{isToday ? "Today" : d.toLocaleDateString(undefined, { weekday: "long" })}</p>
          <h3 className="text-lg font-semibold tracking-tight">{formatDate(day, { month: "long", day: "numeric", year: "numeric" })}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" icon={Plus} onClick={onNew}>{tr("New task")}</Button>
          <Button variant="ghost" size="iconSm" icon={X} onClick={onClose} aria-label={tr("Close")} />
        </div>
      </div>
      {deadlines.length ? (
        <ul className="mb-3 space-y-1">
          {deadlines.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex items-center gap-2 rounded-app-sm border border-dashed border-line px-2 py-1.5 text-xs hover:bg-surface-2">
                <span className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: p.color }}><Flag size={10} /></span>
                <span className="min-w-0 flex-1 truncate"><b>{p.name}</b> ends today</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div> : tasks.length === 0 ? (
        <EmptyState compact icon={CalendarCheck} title={tr("Nothing due")} description={tr("No tasks are due on this day.")} />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const overdue = t.status !== "done" && t.due_date < today;
            return (
              <li key={t.id} className="rounded-app border border-line bg-surface p-2.5" style={{ borderLeftWidth: 3, borderLeftColor: t.project_color || "var(--line-strong)" }}>
                <button onClick={() => onOpen(t)} className="block w-full text-left">
                  <span className={cn("block text-sm font-medium", t.status === "done" && "line-through opacity-60", overdue && "text-rose-500")}>{t.title}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{[t.project_name, t.requirement_code].filter(Boolean).join(" · ") || "No project"}</span>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  {t.assignee_name ? <Avatar name={t.assignee_name} color={t.avatar_color} size="xs" /> : null}
                  <StatusBadge map={TASK_PRIORITY} value={t.priority} dot={false} />
                  <span className="flex-1" />
                  <InlineSelect value={t.status} map={TASK_STATUS} onChange={(v) => onStatus(t, v)} />
                  <button onClick={() => onEdit(t)} className="text-[11px] text-fg-muted hover:text-fg">{tr("Edit")}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Agenda({ days, byDay, deadlinesByDay, today, loading, onOpen, onStatus, onNew }) {
  const tr = useT();
  const rows = days.filter((day) => (byDay[day]?.length || deadlinesByDay[day]?.length));
  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (!rows.length) return <Card><EmptyState icon={CalendarDays} title={tr("Nothing scheduled")} description="No tasks are due in the next six weeks. Move the range with the arrows or add a task." /></Card>;
  return (
    <div className="space-y-4 anim-stagger">
      {rows.map((day) => {
        const d = parseIso(day);
        const isToday = day === today;
        return (
          <section key={day} className="grid grid-cols-[88px_1fr] gap-3">
            <button onClick={() => onNew(day)} className={cn("h-fit rounded-app border border-line p-2 text-center hover:bg-surface-2", isToday && "border-accent bg-accent/8")} title="New task on this day">
              <span className="block text-[10px] uppercase tracking-wider text-fg-muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className={cn("block text-2xl font-semibold leading-tight", isToday && "text-accent")}>{d.getDate()}</span>
              <span className="block text-[10px] text-fg-muted">{d.toLocaleDateString(undefined, { month: "short" })}</span>
            </button>
            <Card padding={false} className="divide-y divide-line">
              {(deadlinesByDay[day] ?? []).map((p) => (
                <Link key={`p${p.id}`} href={`/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-surface-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: p.color }}><Flag size={12} /></span>
                  <span><b>{p.name}</b> deadline</span>
                </Link>
              ))}
              {(byDay[day] ?? []).map((t) => {
                const overdue = t.status !== "done" && t.due_date < today;
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: t.project_color || "var(--line-strong)" }} />
                    <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                      <span className={cn("block truncate text-sm font-medium", t.status === "done" && "line-through opacity-60", overdue && "text-rose-500")}>{t.title}</span>
                      <span className="block truncate text-[11px] text-fg-muted">{[t.project_name, t.assignee_name].filter(Boolean).join(" · ") || "No project"} · updated {relativeTime(t.updated_at)}</span>
                    </button>
                    <StatusBadge map={TASK_PRIORITY} value={t.priority} dot={false} />
                    <InlineSelect value={t.status} map={TASK_STATUS} onChange={(v) => onStatus(t, v)} />
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
