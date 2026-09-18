"use client";
import { useMemo, useState } from "react";
import { Timer, Users, ListChecks, CalendarDays, Download, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { Segmented, Select, Input } from "@/components/ui/Controls";
import { Skeleton, EmptyState } from "@/components/ui/Misc";
import DataTable from "@/components/table/DataTable";
import { useFetch } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import { MODULE_MAP } from "@/lib/modules";
import { formatMinutes } from "@/lib/duration";
import { toCsv } from "@/lib/csv";
import { formatDate, cn } from "@/lib/utils";
import { PersonCell, ProjectChip } from "./shared";
import { useT } from "@/lib/i18n";

const iso = (d) => d.toISOString().slice(0, 10);
/** Date bounds of a preset, in UTC dates (DATE columns compare as plain strings). */
function bounds(preset) {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), day = now.getUTCDay() || 7; // Monday = 1
  const monday = new Date(Date.UTC(y, m, now.getUTCDate() - day + 1));
  switch (preset) {
    case "week": return [iso(monday), iso(new Date(monday.getTime() + 6 * 86400000))];
    case "lastweek": return [iso(new Date(monday.getTime() - 7 * 86400000)), iso(new Date(monday.getTime() - 86400000))];
    case "lastmonth": return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
    case "quarter": { const q = Math.floor(m / 3) * 3; return [iso(new Date(Date.UTC(y, q, 1))), iso(new Date(Date.UTC(y, q + 3, 0)))]; }
    case "year": return [`${y}-01-01`, `${y}-12-31`];
    default: return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
  }
}
const hours = (min) => (Math.round((min / 60) * 100) / 100).toString();

/** Hours logged per person, project, task or day for a period, with the entries behind them. */
export default function TimeReport() {
  const tr = useT();
  const router = useNav();
  const mod = MODULE_MAP.time;
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState(null); // { from, to } when the person typed dates
  const [group, setGroup] = useState("person");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, to] = custom ?? bounds(preset);
  const qs = new URLSearchParams({ from, to, group });
  if (projectId) qs.set("project_id", projectId);
  if (userId) qs.set("user_id", userId);
  const { data, loading, error } = useFetch(`/api/time/report?${qs}`);
  const { data: projects } = useFetch("/api/projects");

  const maxDay = useMemo(() => Math.max(1, ...(data?.days ?? []).map((d) => d.minutes)), [data]);
  const busiest = useMemo(() => (data?.days ?? []).reduce((b, d) => (!b || d.minutes > b.minutes ? d : b), null), [data]);
  const exportGroups = () => {
    const head = [tr(GROUP_LABEL[group]), tr("Hours"), tr("Entries"), tr("People"), tr("Tasks"), tr("Estimate (hours)")];
    const rows = (data?.groups ?? []).map((g) => [g.label, hours(g.minutes), g.entries, g.people, g.tasks, g.estimate_minutes != null ? hours(g.estimate_minutes) : ""]);
    const blob = new Blob(["﻿" + toCsv([head, ...rows, [tr("Total"), hours(data?.total_minutes ?? 0), data?.entry_count ?? 0, "", "", ""]])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `time-${group}-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const drill = (g) => {
    if (group === "person") { setUserId(String(g.id)); setGroup("task"); }
    else if (group === "project") { setProjectId(String(g.id ?? "")); setGroup("task"); }
    else if (group === "task") router.push(`/tasks/${g.id}`);
    else if (group === "day") { setCustom([g.key, g.key]); setGroup("task"); }
  };

  const columns = [
    { key: "spent_on", label: tr("Date"), render: (r) => formatDate(r.spent_on) },
    { key: "user_name", label: tr("Person"), render: (r) => <PersonCell name={r.user_name} color={r.avatar_color} avatar={r.avatar} link={false} /> },
    { key: "task_title", label: tr("Task"), render: (r) => <span className="font-medium">{r.task_title}</span> },
    { key: "project_name", label: tr("Project"), render: (r) => (r.project_name ? <ProjectChip name={r.project_name} color={r.project_color} /> : <span className="text-fg-faint">—</span>) },
    { key: "minutes", label: tr("Time"), sortValue: (r) => Number(r.minutes), render: (r) => <span className="tabular-nums font-medium">{formatMinutes(r.minutes)}</span> },
    { key: "hours", label: tr("Hours"), defaultHidden: true, sortValue: (r) => Number(r.minutes) / 60, render: (r) => hours(r.minutes) },
    { key: "note", label: tr("Note"), render: (r) => r.note || <span className="text-fg-faint">—</span> },
  ];
  const presets = [["week", "This week"], ["lastweek", "Last week"], ["month", "This month"], ["lastmonth", "Last month"], ["quarter", "This quarter"], ["year", "This year"]];

  return (
    <>
      <PageHeader title={tr("Time")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button variant="secondary" icon={Download} onClick={exportGroups} disabled={!data?.groups?.length} className="time-export">{tr("Export totals")}</Button>} />
      <div className="time-toolbar mb-4 flex flex-wrap items-center gap-2">
        <Select value={custom ? "custom" : preset} onChange={(e) => { if (e.target.value === "custom") setCustom([from, to]); else { setCustom(null); setPreset(e.target.value); } }} className="time-preset h-9 w-40">
          {presets.map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}
          <option value="custom">{tr("Custom dates")}</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setCustom([e.target.value || from, to])} className="time-from h-9 w-40" />
        <span className="text-fg-muted">–</span>
        <Input type="date" value={to} min={from} onChange={(e) => setCustom([from, e.target.value || to])} className="time-to h-9 w-40" />
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="time-project h-9 w-44"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="time-person h-9 w-44"><option value="">{tr("Everyone")}</option>{(data?.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        {projectId || userId || custom ? <Button variant="ghost" size="sm" icon={X} onClick={() => { setProjectId(""); setUserId(""); setCustom(null); }}>{tr("Clear")}</Button> : null}
        <span className="flex-1" />
        <Segmented value={group} onChange={setGroup} className="time-group shrink-0 [&_button]:whitespace-nowrap" options={[{ value: "person", label: tr("By person") }, { value: "project", label: tr("By project") }, { value: "task", label: tr("By task") }, { value: "day", label: tr("By day") }]} />
      </div>

      {error ? <p className="text-sm text-rose-500">{error.message}</p> : null}
      {loading && !data ? <Skeleton className="h-64 w-full" /> : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={tr("Logged")} value={formatMinutes(data.total_minutes)} icon={Timer} color={mod.color} hint={tr("{from} – {to}", { from: formatDate(data.from), to: formatDate(data.to) })} className="time-total" />
            <StatCard label={tr("Entries")} value={data.entry_count} icon={ListChecks} color="#6366f1" hint={tr("{n} tasks", { n: data.task_count })} />
            <StatCard label={tr("People")} value={data.people_count} icon={Users} color="#0ea5e9" hint={data.people_count ? tr("{h} per person", { h: formatMinutes(data.total_minutes / data.people_count) }) : ""} />
            <StatCard label={tr("Busiest day")} value={busiest ? formatMinutes(busiest.minutes) : "—"} icon={CalendarDays} color="#f59e0b" hint={busiest ? formatDate(busiest.date) : tr("Nothing logged")} />
          </div>

          {data.days.length ? (
            <Card className="time-days mt-4">
              <CardHeader title={tr("Per day")} description={tr("{n} days with time logged", { n: data.days.length })} icon={CalendarDays} />
              <div className="flex h-28 items-end gap-[3px] overflow-x-auto pb-1">
                {data.days.map((d) => (
                  <button key={d.date} onClick={() => { setCustom([d.date, d.date]); setGroup("task"); }} className="group flex h-full min-w-[10px] flex-1 flex-col justify-end" title={`${formatDate(d.date)}: ${formatMinutes(d.minutes)}`}>
                    <span className="block w-full rounded-t-sm bg-accent/70 transition group-hover:bg-accent" style={{ height: `${Math.max(4, (d.minutes / maxDay) * 100)}%` }} />
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-fg-muted"><span>{formatDate(data.days[0].date)}</span><span>{formatDate(data.days[data.days.length - 1].date)}</span></div>
            </Card>
          ) : null}

          <Card className="mt-4" padding={false}>
            <div className="p-5 pb-0"><CardHeader title={tr(GROUP_TITLE[group])} description={tr("Click a row to drill down.")} icon={Timer} /></div>
            {data.groups.length ? (
              <table className="time-groups mt-3 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-fg-muted">
                  <tr><th className="px-5 py-2">{tr(GROUP_LABEL[group])}</th><th className="px-3 py-2 text-right">{tr("Hours")}</th><th className="hidden px-3 py-2 text-right sm:table-cell">{tr("Entries")}</th><th className="hidden px-3 py-2 text-right md:table-cell">{group === "person" ? tr("Tasks") : tr("People")}</th><th className="px-3 py-2">{tr("Share")}</th>{group === "task" || group === "project" ? <th className="hidden px-5 py-2 text-right lg:table-cell">{tr("Against estimate")}</th> : null}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.groups.map((g) => {
                    const over = g.estimate_minutes != null && g.minutes > g.estimate_minutes;
                    return (
                      <tr key={g.key} onClick={() => drill(g)} className="cursor-pointer hover:bg-surface-2/60">
                        <td className="px-5 py-2">
                          <span className="flex items-center gap-2">
                            {group === "person" ? <Avatar name={g.label} color={g.color} avatar={g.avatar} size="xs" /> : group === "project" ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color ?? "var(--fg-faint)" }} /> : null}
                            <span className="font-medium">{group === "day" ? formatDate(g.label) : g.label}</span>
                            {g.project_name ? <span className="text-xs text-fg-muted">· {g.project_name}</span> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMinutes(g.minutes)}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{g.entries}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{group === "person" ? g.tasks : g.people}</td>
                        <td className="w-40 px-3 py-2"><span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(g.share * 100)}%` }} /></span><span className="w-9 text-right text-xs tabular-nums text-fg-muted">{Math.round(g.share * 100)}%</span></span></td>
                        {group === "task" || group === "project" ? <td className={cn("hidden px-5 py-2 text-right text-xs tabular-nums lg:table-cell", over ? "text-rose-500" : "text-fg-muted")}>{g.estimate_minutes != null ? `${formatMinutes(g.minutes)} / ${formatMinutes(g.estimate_minutes)}` : "—"}</td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="p-5"><EmptyState icon={Timer} title={tr("No time logged in this period")} description={tr("Log time on a task, or start its timer, and it shows up here.")} /></div>}
          </Card>

          <div className="mt-4">
            <DataTable id="time-entries" columns={columns} rows={data.entries} defaultSort={{ key: "spent_on", dir: "desc" }} searchPlaceholder={tr("Search entries…")} onRowClick={(r) => router.push(`/tasks/${r.task_id}`)} emptyTitle={tr("No entries")} dense />
          </div>
          {data.truncated ? <p className="mt-2 text-xs text-amber-500">{tr("Only the newest 5000 entries are shown. Narrow the period.")}</p> : null}
        </>
      ) : null}
    </>
  );
}
const GROUP_LABEL = { person: "Person", project: "Project", task: "Task", day: "Day" };
const GROUP_TITLE = { person: "Hours per person", project: "Hours per project", task: "Hours per task", day: "Hours per day" };
