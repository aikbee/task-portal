"use client";
import Link from "next/link";
import { FolderKanban, Users, CheckSquare, AlertTriangle, ArrowRight, Paperclip, FileText, StickyNote } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { TASK_STATUS, TASK_PRIORITY, PROJECT_STATUS, MODULE_MAP } from "@/lib/modules";
import { fullName, formatDate, relativeTime, isOverdue, cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Card, { CardHeader } from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { ProgressBar, Skeleton, EmptyState } from "@/components/ui/Misc";
import { useUI } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

const TONE_HEX = { slate: "#94a3b8", sky: "#0ea5e9", violet: "#8b5cf6", emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", indigo: "#6366f1" };

export default function DashboardView() {
  const tr = useT();
  const { data, loading, error } = useFetch("/api/stats");
  const setActiveTool = useUI((s) => s.setActiveTool);
  const { user } = useAuth();

  if (error) return <EmptyState title="Could not load dashboard" description={error.message} />;
  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return null;
  const { counts, tasksByStatus, tasksByPriority, projects, workload, recentTasks, upcoming } = data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const statusCount = tasksByStatus.reduce((a, s) => a + s.n, 0);
  const priorityCount = tasksByPriority.reduce((a, s) => a + s.n, 0);
  const statusTotal = statusCount || 1; // divide-by-zero guards for the bars / donut
  const priorityTotal = priorityCount || 1;
  const donut = (() => {
    let acc = 0;
    const stops = Object.keys(TASK_PRIORITY).map((k) => {
      const n = tasksByPriority.find((p) => p.priority === k)?.n ?? 0;
      const from = (acc / priorityTotal) * 100;
      acc += n;
      const to = (acc / priorityTotal) * 100;
      return `${TONE_HEX[TASK_PRIORITY[k].tone]} ${from}% ${to}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  })();

  return (
    <>
      <PageHeader title={tr("Dashboard")} crumbs={[]} hideTitle />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 anim-rise">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr(greeting)} 👋</h1>
          <p className="text-sm text-fg-muted">
            {tr("Here's what's happening in")}
            {user?.profile ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-px text-xs font-medium text-fg">
                <span className="h-2 w-2 rounded-full" style={{ background: user.profile.color }} />
                {user.profile.name}
              </span>
            ) : (
              " your workspace"
            )}
            .
          </p>
        </div>
        <button onClick={() => setActiveTool("notes")} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg">
          <StickyNote size={13} className="text-amber-500" /> {tr(counts.notes === 1 ? "{n} sticky note" : "{n} sticky notes", { n: counts.notes })}
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 anim-stagger">
        <Link href="/projects"><StatCard label={tr("Projects")} value={counts.projects} hint={tr("{n} active", { n: counts.active_projects })} icon={FolderKanban} color={MODULE_MAP.projects.color} onClick={() => {}} /></Link>
        <Link href="/employees"><StatCard label={tr("Employees")} value={counts.employees} hint={tr("{n} active", { n: counts.active_employees })} icon={Users} color={MODULE_MAP.employees.color} onClick={() => {}} /></Link>
        <Link href="/tasks"><StatCard label={tr("Open tasks")} value={counts.open_tasks} hint={tr("{n} total", { n: counts.tasks })} icon={CheckSquare} color={MODULE_MAP.tasks.color} onClick={() => {}} /></Link>
        <Link href="/tasks"><StatCard label={tr("Overdue")} value={counts.overdue_tasks} hint={tr(counts.overdue_tasks ? "Needs attention" : "All on track")} icon={AlertTriangle} color={counts.overdue_tasks ? "#f43f5e" : "#10b981"} onClick={() => {}} /></Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 anim-stagger">
        {/* tasks by status */}
        <Card>
          <CardHeader title={tr("Tasks by status")} description={tr(statusCount === 1 ? "{n} task" : "{n} tasks", { n: statusCount })} />
          <div className="space-y-3">
            {Object.entries(TASK_STATUS).map(([k, v]) => {
              const n = tasksByStatus.find((s) => s.status === k)?.n ?? 0;
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: TONE_HEX[v.tone] }} />{tr(v.label)}</span>
                    <span className="tabular-nums text-fg-muted">{n} · {Math.round((n / statusTotal) * 100)}%</span>
                  </div>
                  <ProgressBar value={(n / statusTotal) * 100} color={TONE_HEX[v.tone]} />
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center gap-5 border-t border-line pt-4">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: donut }}>
              <span className="grid h-16 w-16 place-items-center rounded-full bg-surface text-center leading-tight">
                <span className="text-lg font-semibold">{priorityCount}</span>
              </span>
            </div>
            <ul className="flex-1 space-y-1 text-xs">
              {Object.entries(TASK_PRIORITY).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: TONE_HEX[v.tone] }} />{tr(v.label)}</span>
                  <span className="tabular-nums text-fg-muted">{tasksByPriority.find((p) => p.priority === k)?.n ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* projects */}
        <Card>
          <CardHeader title={tr("Project progress")} description={tr("Active, planned and on-hold")} actions={<Link href="/projects" className="text-xs text-accent hover:underline">{tr("All projects")}</Link>} />
          {projects.length === 0 ? <EmptyState compact title={tr("No projects")} /> : (
            <ul className="space-y-3">
              {projects.map((p) => {
                const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="group block rounded-app-sm p-1.5 -m-1.5 hover:bg-surface-2">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-accent">{p.name}</span>
                        <StatusBadge map={PROJECT_STATUS} value={p.status} dot={false} />
                      </div>
                      <ProgressBar value={pct} color={p.color} />
                      <div className="mt-1 flex justify-between text-[11px] text-fg-muted">
                        <span>{tr("{a}/{b} tasks · {n} people", { a: p.done_count, b: p.task_count, n: p.member_count })}</span>
                        <span>{p.end_date ? tr("due {date}", { date: formatDate(p.end_date) }) : tr("no end date")}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* workload */}
        <Card>
          <CardHeader title={tr("Team workload")} description={tr("Open tasks per active employee")} actions={<Link href="/employees" className="text-xs text-accent hover:underline">{tr("All people")}</Link>} />
          {workload.length === 0 ? <EmptyState compact title={tr("No employees")} /> : (
            <ul className="space-y-2.5">
              {workload.map((w) => {
                const max = Math.max(1, ...workload.map((x) => Number(x.open_count)));
                return (
                  <li key={w.id}>
                    <Link href={`/employees/${w.id}`} className="flex items-center gap-3 rounded-app-sm p-1 -m-1 hover:bg-surface-2">
                      <Avatar name={fullName(w)} color={w.avatar_color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium">{fullName(w)}</span>
                          <span className="tabular-nums text-fg-muted">{tr("{n} open", { n: w.open_count })}</span>
                        </div>
                        <ProgressBar value={(Number(w.open_count) / max) * 100} color={w.avatar_color} className="mt-1" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* upcoming */}
        <Card className="xl:col-span-1">
          <CardHeader title={tr("Upcoming deadlines")} description={tr("Open tasks by due date")} />
          <TaskList items={upcoming} emptyTitle={tr("Nothing due")} showDue />
        </Card>

        {/* recent */}
        <Card className="xl:col-span-2">
          <CardHeader title={tr("Recently updated tasks")} actions={<Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">{tr("All tasks")}<ArrowRight size={12} /></Link>} />
          <TaskList items={recentTasks} emptyTitle={tr("No tasks yet")} showUpdated />
        </Card>
      </div>
    </>
  );
}

function TaskList({ items, emptyTitle, showDue, showUpdated }) {
  if (!items.length) return <EmptyState compact title={emptyTitle} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const overdue = isOverdue(t.due_date, t.status);
        return (
          <li key={t.id}>
            <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 py-2 hover:bg-surface-2 -mx-2 px-2 rounded-app-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.project_color || "var(--line-strong)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-[11px] text-fg-muted">{t.project_name || "No project"}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</span>
              </span>
              <StatusBadge map={TASK_STATUS} value={t.status} dot={false} />
              {showDue ? <span className={cn("w-20 text-right text-xs tabular-nums", overdue ? "font-medium text-rose-500" : "text-fg-muted")}>{formatDate(t.due_date, { month: "short", day: "numeric" })}</span> : null}
              {showUpdated ? <span className="w-24 text-right text-xs text-fg-muted">{relativeTime(t.updated_at)}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
    </div>
  );
}
