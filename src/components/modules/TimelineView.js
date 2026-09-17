"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X, CalendarDays, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { usePrefs } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { useAccess, CanEdit } from "@/lib/auth-context";
import { MODULE_MAP } from "@/lib/modules";
import { TASK_STATUS } from "@/lib/constants";
import { todayIso } from "@/lib/dates";
import { cn, fullName, formatDate, getDateLocale } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Select, Segmented, Toggle } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import TaskForm from "./TaskForm";
import { useT } from "@/lib/i18n";

const DAY_W = { week: 40, month: 18, quarter: 7 };
const MIN_DAYS = { week: 70, month: 150, quarter: 400 };
const ROW = 36;
const HEAD = 50;
const DAY = 86400000;

/** Whole days since the epoch for a YYYY-MM-DD string: date maths without time zones or daylight saving. */
const dayNum = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
};
const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Tasks as bars between their start and due dates, grouped, with dependency arrows. */
export default function TimelineView() {
  const tr = useT();
  const nav = useNav();
  const toast = useToast();
  const { canEdit } = useAccess();
  const mod = MODULE_MAP.timeline;
  const zoom = usePrefs((s) => s.timelineZoom) ?? "month";
  const groupBy = usePrefs((s) => s.timelineGroup) ?? "project";
  const hideDone = usePrefs((s) => s.timelineHideDone) ?? false;
  const setPrefs = usePrefs((s) => s.set);
  const tasksQ = useFetch("/api/tasks");
  const { data: deps, refetch: refetchDeps } = useFetch("/api/tasks/dependencies");
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");
  const [filters, setFilters] = useState({ q: "", project_id: "", employee_id: "" });
  const [dragState, setDragState] = useState(null); // { id, mode: move|start|due|none, x0, delta, moved }
  // the handlers read the ref: a quick click releases before React has re-rendered with the new state
  const dragRef = useRef(null);
  const setDrag = (next) => {
    dragRef.current = typeof next === "function" ? next(dragRef.current) : next;
    setDragState(dragRef.current);
  };
  const [taskForm, setTaskForm] = useState({ open: false, initial: null, defaults: {} });
  const scroller = useRef(null);
  const today = todayIso();
  const todayN = dayNum(today);
  const w = DAY_W[zoom] ?? DAY_W.month;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const LEFT = narrow ? 132 : 280;

  const tasks = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return (tasksQ.data ?? []).filter(
      (t) =>
        (!hideDone || t.status !== "done") &&
        (!filters.project_id || String(t.project_id) === filters.project_id) &&
        (!filters.employee_id || String(t.employee_id) === filters.employee_id) &&
        (!q || t.title.toLowerCase().includes(q) || String(t.tags ?? "").includes(q))
    );
  }, [tasksQ.data, filters, hideDone]);

  // the window of days on screen: everything dated, today, some air on both sides, never absurdly long
  const range = useMemo(() => {
    let lo = todayN, hi = todayN;
    for (const t of tasks) {
      for (const d of [t.start_date, t.due_date]) if (d) { const n = dayNum(d); lo = Math.min(lo, n); hi = Math.max(hi, n); }
    }
    lo = Math.max(lo, todayN - 365) - 7;
    hi = Math.min(hi, todayN + 730) + 21;
    if (hi - lo + 1 < MIN_DAYS[zoom]) hi = lo + MIN_DAYS[zoom] - 1;
    return { start: lo, days: hi - lo + 1 };
  }, [tasks, todayN, zoom]);

  const rows = useMemo(() => {
    const sortKey = (t) => t.start_date || t.due_date || "9999";
    const sorted = [...tasks].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a.id - b.id));
    if (groupBy === "none") return sorted.map((t) => ({ kind: "task", task: t }));
    const groups = new Map();
    for (const t of sorted) {
      const key = groupBy === "project" ? t.project_id ?? 0 : t.employee_id ?? 0;
      if (!groups.has(key)) groups.set(key, { key, label: groupBy === "project" ? t.project_name ?? tr("No project") : t.assignee_name ?? tr("Unassigned"), color: groupBy === "project" ? t.project_color : t.avatar_color, tasks: [] });
      groups.get(key).tasks.push(t);
    }
    const ordered = [...groups.values()].sort((a, b) => (a.key === 0) - (b.key === 0) || a.label.localeCompare(b.label));
    return ordered.flatMap((g) => {
      const project = groupBy === "project" ? (projects ?? []).find((p) => p.id === g.key) : null;
      return [{ kind: "group", group: g, project }, ...g.tasks.map((t) => ({ kind: "task", task: t }))];
    });
  }, [tasks, groupBy, projects, tr]);

  /** Where a task's bar sits, in days from the window start, with a drag in progress applied. */
  const spanOf = (t, drag = dragState) => {
    let s = t.start_date ? dayNum(t.start_date) : null;
    let d = t.due_date ? dayNum(t.due_date) : null;
    if (s == null && d == null) return null;
    if (drag?.id === t.id && drag.delta) {
      if (drag.mode === "move") { if (s != null) s += drag.delta; if (d != null) d += drag.delta; }
      if (drag.mode === "start") s = Math.min((s ?? d) + drag.delta, d ?? Infinity);
      if (drag.mode === "due") d = Math.max((d ?? s) + drag.delta, s ?? -Infinity);
    }
    const from = (s ?? d) - range.start, to = (d ?? s) - range.start;
    return { s, d, from, to, milestone: s == null && drag?.id !== t.id };
  };

  const save = async (t, patch) => {
    const before = tasksQ.data;
    tasksQ.setData((rowsNow) => (rowsNow ?? []).map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    try {
      const saved = await api.put(`/api/tasks/${t.id}`, patch);
      tasksQ.setData((rowsNow) => (rowsNow ?? []).map((x) => (x.id === t.id ? { ...x, ...saved } : x)));
    } catch (e) {
      tasksQ.setData(before);
      toast.error(tr("Could not move the task"), e.message);
    }
  };
  const onBarDown = (e, t, mode) => {
    if (e.button != null && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: t.id, mode: canEdit ? mode : "none", x0: e.clientX, delta: 0, moved: false });
  };
  const onBarMove = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    const dx = e.clientX - cur.x0;
    const delta = cur.mode === "none" ? 0 : Math.round(dx / w);
    if (delta !== cur.delta || (!cur.moved && Math.abs(dx) > 4)) setDrag((d) => (d ? { ...d, delta, moved: d.moved || Math.abs(dx) > 4 } : d));
  };
  const onBarUp = (e, t) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const span = spanOf(t, d);
    setDrag(null);
    if (!d.moved) return nav.push(`/tasks/${t.id}`);
    if (!d.delta || !span) return;
    const patch = {};
    if (d.mode === "move") { if (t.start_date) patch.start_date = isoOf(span.s); if (t.due_date) patch.due_date = isoOf(span.d); }
    if (d.mode === "start") patch.start_date = isoOf(span.s);
    if (d.mode === "due") patch.due_date = isoOf(span.d);
    save(t, patch);
  };
  /** An unscheduled task gets its dates by clicking a day on its row. */
  const place = (e, t) => {
    if (!canEdit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const day = isoOf(range.start + clamp(Math.floor((e.clientX - rect.left) / w), 0, range.days - 1));
    save(t, { start_date: day, due_date: day });
  };

  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, (todayN - range.start) * w - el.clientWidth / 3), behavior: "smooth" });
  };
  // filters change the window of days; keep the same day under the reader's eyes instead of letting the bars slide away
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const prev = anchor.current;
    if (el && prev && prev.w === w && prev.start !== range.start) el.scrollLeft = Math.max(0, el.scrollLeft + (prev.start - range.start) * w);
    anchor.current = { start: range.start, w };
  }, [range.start, w]);
  const loaded = Boolean(tasksQ.data);
  useEffect(() => {
    const el = scroller.current;
    if (el && loaded) el.scrollLeft = Math.max(0, (todayN - range.start) * w - el.clientWidth / 3);
    // only when the scale changes or the data first arrives, never while dragging or filtering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, zoom]);

  // calendar header: one segment per month, ticks per day or per week
  const header = useMemo(() => {
    const months = [];
    const ticks = [];
    const fmt = new Intl.DateTimeFormat(getDateLocale?.() || undefined, { month: zoom === "quarter" ? "short" : "long", year: "numeric", timeZone: "UTC" });
    for (let i = 0; i < range.days; i++) {
      const date = new Date((range.start + i) * DAY);
      const dom = date.getUTCDate(), dow = date.getUTCDay();
      if (i === 0 || dom === 1) months.push({ i, label: fmt.format(date) });
      if (zoom === "week" || (zoom === "month" && dow === 1) || (zoom === "quarter" && dow === 1 && dom <= 7)) ticks.push({ i, label: dom, weekend: dow === 0 || dow === 6 });
    }
    const weekends = [];
    if (zoom !== "quarter") for (let i = 0; i < range.days; i++) { const dow = new Date((range.start + i) * DAY).getUTCDay(); if (dow === 0 || dow === 6) weekends.push(i); }
    return { months, ticks, weekends };
  }, [range, zoom]);

  const taskRowIndex = useMemo(() => new Map(rows.map((r, i) => [r.kind === "task" ? r.task.id : `g${i}`, i])), [rows]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const arrows = (deps ?? []).flatMap((p) => {
    const from = byId.get(p.depends_on_id), to = byId.get(p.task_id);
    if (!from || !to) return [];
    const a = spanOf(from), b = spanOf(to);
    if (!a || !b) return [];
    const x1 = (a.to + 1) * w - (a.milestone ? w / 2 : 0), y1 = taskRowIndex.get(from.id) * ROW + ROW / 2;
    const x2 = b.from * w + (b.milestone ? w / 2 : 0), y2 = taskRowIndex.get(to.id) * ROW + ROW / 2;
    const gap = 9;
    const path = x2 >= x1 + gap * 2
      ? `M${x1},${y1} H${x1 + gap} V${y2} H${x2 - 2}`
      : `M${x1},${y1} H${x1 + gap} V${y1 + (y2 > y1 ? 1 : -1) * (ROW / 2)} H${x2 - gap} V${y2} H${x2 - 2}`;
    return [{ key: `${p.task_id}-${p.depends_on_id}`, path, late: from.status !== "done" && b.from <= a.to, done: from.status === "done" }];
  });

  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date).length;
  const width = range.days * w;
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title={tr("Timeline")}
        description={tr(mod.description)}
        icon={mod.icon}
        color={mod.color}
        crumbs={[]}
        actions={<CanEdit><Button icon={Plus} onClick={() => setTaskForm({ open: true, initial: null, defaults: { start_date: today, due_date: today, ...(filters.project_id ? { project_id: Number(filters.project_id) } : {}) } })}>{tr("New task")}</Button></CanEdit>}
      />
      <div className="tool-bar card mb-4 flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input value={filters.q} onChange={setFilter("q")} placeholder={tr("Filter tasks…")} className="control h-8 pl-8 pr-7 text-xs" />
          {filters.q ? <button onClick={() => setFilters((f) => ({ ...f, q: "" }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg" aria-label={tr("Clear")}><X size={13} /></button> : null}
        </div>
        <Select value={filters.project_id} onChange={setFilter("project_id")} className="h-8 w-40 text-xs"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={filters.employee_id} onChange={setFilter("employee_id")} className="h-8 w-36 text-xs"><option value="">{tr("Anyone")}</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
        <Toggle size="sm" checked={hideDone} onChange={(v) => setPrefs({ timelineHideDone: v })} label={tr("Hide done")} className="gap-2 text-xs" />
        <span className="flex-1" />
        <Button size="sm" variant="secondary" icon={CalendarDays} onClick={scrollToToday} className="timeline-today">{tr("Today")}</Button>
        <Segmented size="sm" value={groupBy} onChange={(v) => setPrefs({ timelineGroup: v })} options={[{ value: "project", label: tr("Project") }, { value: "assignee", label: tr("Assignee") }, { value: "none", label: tr("Flat") }]} />
        <Segmented size="sm" value={zoom} onChange={(v) => setPrefs({ timelineZoom: v })} options={[{ value: "week", label: tr("Weeks") }, { value: "month", label: tr("Months") }, { value: "quarter", label: tr("Quarter") }]} />
      </div>

      {tasksQ.error ? <EmptyState title={tr("Could not load tasks")} description={tasksQ.error.message} /> : null}
      {tasksQ.loading && !tasksQ.data ? <Skeleton className="h-96 w-full" /> : null}
      {tasksQ.data && !rows.length ? <EmptyState icon={mod.icon} title={tr("Nothing to show")} description={tr("No task matches these filters.")} /> : null}

      {tasksQ.data && rows.length ? (
        <div ref={scroller} className="timeline card relative overflow-auto overscroll-x-contain" style={{ maxHeight: "calc(100dvh - 15rem)" }}>
          <div className="relative" style={{ width: LEFT + width }}>
            {/* calendar header */}
            <div className="sticky top-0 z-30 flex border-b border-line bg-surface" style={{ height: HEAD }}>
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-faint" style={{ width: LEFT }}>
                {tr("Task")} <span className="ml-auto font-normal normal-case tracking-normal">{tasks.length}</span>
              </div>
              <div className="relative shrink-0" style={{ width }}>
                {header.months.map((m, k) => (
                  <div key={m.i} className="absolute top-0 truncate border-l border-line px-2 pt-1.5 text-xs font-semibold" style={{ left: m.i * w, width: ((header.months[k + 1]?.i ?? range.days) - m.i) * w, height: HEAD / 2 }}>{m.label}</div>
                ))}
                {header.ticks.map((t) => (
                  <div key={t.i} className={cn("absolute text-center text-[10px] tabular-nums", t.weekend ? "text-fg-faint" : "text-fg-muted", range.start + t.i === todayN && "font-bold text-accent")} style={{ left: t.i * w, width: zoom === "week" ? w : w * 7, top: HEAD / 2 + 4, textAlign: zoom === "week" ? "center" : "left", paddingLeft: zoom === "week" ? 0 : 3 }}>{t.label}</div>
                ))}
              </div>
            </div>

            {/* body */}
            <div className="relative" style={{ height: rows.length * ROW }}>
              <div className="pointer-events-none absolute inset-y-0" style={{ left: LEFT, width }}>
                {header.weekends.map((i) => <div key={i} className="absolute inset-y-0 bg-fg/[0.035]" style={{ left: i * w, width: w }} />)}
                {header.months.map((m) => <div key={m.i} className="absolute inset-y-0 border-l border-line/70" style={{ left: m.i * w }} />)}
                <div className="timeline-today-line absolute inset-y-0 z-10 w-px bg-accent" style={{ left: (todayN - range.start) * w + w / 2 }} />
              </div>

              {rows.map((r, i) => {
                if (r.kind === "group") {
                  const p = r.project;
                  const ps = p?.start_date ? dayNum(p.start_date) - range.start : null, pe = p?.end_date ? dayNum(p.end_date) - range.start : null;
                  return (
                    <div key={`g-${r.group.key}`} className="timeline-group absolute left-0 flex bg-surface-2/60" style={{ top: i * ROW, height: ROW, width: LEFT + width }}>
                      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-surface-2 px-3 text-xs font-semibold" style={{ width: LEFT }}>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.group.color || "var(--line-strong)" }} />
                        <span className="truncate">{r.group.label}</span>
                        <span className="ml-auto font-normal text-fg-faint">{r.group.tasks.length}</span>
                      </div>
                      <div className="relative shrink-0" style={{ width }}>
                        {ps != null && pe != null && pe >= ps ? <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-50" style={{ left: clamp(ps, 0, range.days) * w, width: Math.max(0, clamp(pe + 1, 0, range.days) - clamp(ps, 0, range.days)) * w, background: r.group.color || "var(--accent)" }} title={`${p.name}: ${formatDate(p.start_date)} – ${formatDate(p.end_date)}`} /> : null}
                      </div>
                    </div>
                  );
                }
                const t = r.task;
                const span = spanOf(t);
                const done = t.status === "done";
                const overdue = !done && t.due_date && t.due_date < today;
                const color = t.project_color || "var(--accent)";
                const dragging = dragState?.id === t.id && dragState.moved;
                return (
                  <div key={t.id} className="timeline-row group absolute left-0 flex border-b border-line/60" style={{ top: i * ROW, height: ROW, width: LEFT + width }}>
                    <button type="button" onClick={() => nav.push(`/tasks/${t.id}`)} className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-3 text-left text-xs hover:bg-surface-2" style={{ width: LEFT }} title={t.title}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", done ? "bg-emerald-500" : overdue ? "bg-rose-500" : "bg-fg-faint")} />
                      <span className={cn("min-w-0 flex-1 truncate", done && "text-fg-muted line-through")}>{t.title}</span>
                      {Number(t.blocked_by_open) > 0 && !done ? <Lock size={11} className="shrink-0 text-amber-500" /> : null}
                    </button>
                    <div className={cn("relative shrink-0", !span && canEdit && "cursor-copy")} style={{ width }} onClick={!span ? (e) => place(e, t) : undefined}>
                      {!span ? (
                        <span className="pointer-events-none sticky left-[calc(var(--tl-left)+0.75rem)] top-0 inline-block py-2.5 text-[11px] text-fg-faint opacity-0 transition group-hover:opacity-100" style={{ "--tl-left": `${LEFT}px` }}>{canEdit ? tr("No dates yet: click a day to place it") : tr("No dates yet")}</span>
                      ) : span.milestone ? (
                        <div
                          className={cn("timeline-bar timeline-milestone absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] shadow-sm", canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", overdue && "ring-2 ring-rose-500")}
                          style={{ left: span.to * w + w / 2, background: done ? "var(--fg-faint)" : color, touchAction: "none" }}
                          onPointerDown={(e) => onBarDown(e, t, "move")} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, t)} onPointerCancel={() => setDrag(null)}
                          title={`${t.title} · ${tr("due")} ${formatDate(t.due_date)}`}
                        />
                      ) : (
                        <div
                          className={cn("timeline-bar absolute top-1.5 z-10 flex items-center overflow-hidden rounded-md text-[11px] font-medium text-white shadow-sm", canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", done && "opacity-50", overdue && "ring-2 ring-rose-500", dragging && "z-20 shadow-app-lg")}
                          style={{ left: span.from * w, width: Math.max(w, (span.to - span.from + 1) * w), height: ROW - 12, background: color, touchAction: "none" }}
                          onPointerDown={(e) => onBarDown(e, t, "move")} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, t)} onPointerCancel={() => setDrag(null)}
                          title={`${t.title} · ${span.s != null ? formatDate(isoOf(span.s)) : "…"} – ${span.d != null ? formatDate(isoOf(span.d)) : "…"}${t.assignee_name ? ` · ${t.assignee_name}` : ""} · ${tr(TASK_STATUS[t.status]?.label ?? t.status)}`}
                        >
                          {canEdit ? <span className="timeline-handle absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => onBarDown(e, t, "start")} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, t)} /> : null}
                          <span className="pointer-events-none truncate px-2.5">{(span.to - span.from + 1) * w > 60 ? t.title : ""}</span>
                          {canEdit ? <span className="timeline-handle absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => onBarDown(e, t, "due")} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, t)} /> : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <svg className="timeline-arrows pointer-events-none absolute top-0 z-[15]" style={{ left: LEFT }} width={width} height={rows.length * ROW} aria-hidden>
                <defs>
                  {["muted", "late", "done"].map((k) => (
                    <marker key={k} id={`tl-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" className={k === "late" ? "fill-rose-500" : k === "done" ? "fill-emerald-500" : "fill-fg-muted"} />
                    </marker>
                  ))}
                </defs>
                {arrows.map((a) => <path key={a.key} d={a.path} fill="none" strokeWidth="1.5" strokeLinejoin="round" className={a.late ? "stroke-rose-500" : a.done ? "stroke-emerald-500/70" : "stroke-fg-muted/70"} markerEnd={`url(#tl-arrow-${a.late ? "late" : a.done ? "done" : "muted"})`} />)}
              </svg>
            </div>
          </div>
        </div>
      ) : null}

      {tasksQ.data && rows.length ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
          {canEdit ? <span>{tr("Drag a bar to move it, an edge to stretch it. Click a bar to open the task.")}</span> : <span>{tr("Click a bar to open the task.")}</span>}
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-fg-muted" /> {tr("due date only")}</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-rose-500" /> {tr("starts before the task it waits for ends")}</span>
          {unscheduled ? <span>{tr("{n} without dates", { n: unscheduled })}</span> : null}
        </p>
      ) : null}

      <TaskForm open={taskForm.open} onClose={() => setTaskForm((f) => ({ ...f, open: false }))} initial={taskForm.initial} defaults={taskForm.defaults} onSaved={() => { tasksQ.refetch(); refetchDeps(); }} />
    </>
  );
}
