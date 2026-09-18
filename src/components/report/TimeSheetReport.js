"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/hooks";
import { Toggle } from "@/components/ui/Controls";
import { formatMinutes } from "@/lib/duration";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ReportShell, DocHeader, Section, KV, RTable, LoadingDoc } from "./primitives";

const iso = (d) => d.toISOString().slice(0, 10);
const monthBounds = () => { const n = new Date(); return [iso(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1))), iso(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)))]; };
const hours = (min) => (Math.round((min / 60) * 100) / 100).toFixed(2);
const GROUPS = { person: "Person", project: "Project", task: "Task", day: "Day" };
const keyOf = { person: (e) => `u:${e.user_id}`, project: (e) => `p:${e.project_id ?? 0}`, task: (e) => `t:${e.task_id}`, day: (e) => e.spent_on };

/** A timesheet on paper: totals per person, project, task or day, the entries under each with subtotals, signatures. */
export default function TimeSheetReport() {
  const tr = useT();
  const sp = useSearchParams();
  const [mFrom, mTo] = monthBounds();
  const [from, setFrom] = useState(sp.get("from") || mFrom);
  const [to, setTo] = useState(sp.get("to") || mTo);
  const [group, setGroup] = useState(GROUPS[sp.get("group")] ? sp.get("group") : "person");
  const [projectId, setProjectId] = useState(sp.get("project_id") || "");
  const [userId, setUserId] = useState(sp.get("user_id") || "");
  const [detail, setDetail] = useState(true); // entries under each group
  const [notes, setNotes] = useState(true);
  const [decimal, setDecimal] = useState(false); // 1.50 instead of 1h 30m
  const [signatures, setSignatures] = useState(false);
  const qs = new URLSearchParams({ from, to, group });
  if (projectId) qs.set("project_id", projectId);
  if (userId) qs.set("user_id", userId);
  const { data, loading, error } = useFetch(`/api/time/report?${qs}`);
  const { data: projects } = useFetch("/api/projects");
  const fmt = (min) => (decimal ? hours(min) : formatMinutes(min));

  const byGroup = useMemo(() => {
    const map = new Map();
    for (const e of data?.entries ?? []) { const k = keyOf[group](e); if (!map.has(k)) map.set(k, []); map.get(k).push(e); }
    for (const list of map.values()) list.sort((a, b) => (a.spent_on < b.spent_on ? -1 : a.spent_on > b.spent_on ? 1 : a.id - b.id));
    return map;
  }, [data, group]);
  const projectName = projectId ? (projects ?? []).find((p) => String(p.id) === String(projectId))?.name : null;
  const personName = userId ? (data?.people ?? []).find((p) => String(p.id) === String(userId))?.name : null;
  const label = (g) => (group === "day" ? formatDate(g.label) : g.label === "No project" ? tr("No project") : g.label);

  const totalColumns = [
    { key: "label", label: tr(GROUPS[group]), render: (g) => <span className="font-medium">{label(g)}{g.project_name ? <span className="font-normal text-fg-muted"> · {g.project_name}</span> : null}</span> },
    { key: "entries", label: tr("Entries"), align: "right" },
    ...(group === "person" ? [{ key: "tasks", label: tr("Tasks"), align: "right" }] : [{ key: "people", label: tr("People"), align: "right" }]),
    ...(group === "task" || group === "project" ? [{ key: "estimate", label: tr("Estimate"), align: "right", render: (g) => (g.estimate_minutes != null ? fmt(g.estimate_minutes) : "—") }] : []),
    { key: "share", label: tr("Share"), align: "right", render: (g) => `${Math.round(g.share * 100)}%` },
    { key: "minutes", label: decimal ? tr("Hours") : tr("Time"), align: "right", render: (g) => <span className="font-semibold">{fmt(g.minutes)}</span> },
  ];
  const entryColumns = [
    ...(group !== "day" ? [{ key: "spent_on", label: tr("Date"), render: (e) => formatDate(e.spent_on) }] : []),
    ...(group !== "person" ? [{ key: "user_name", label: tr("Person") }] : []),
    ...(group !== "task" ? [{ key: "task_title", label: tr("Task") }] : []),
    ...(group !== "project" && group !== "task" ? [{ key: "project_name", label: tr("Project"), render: (e) => e.project_name ?? "—" }] : []),
    ...(notes ? [{ key: "note", label: tr("Note"), render: (e) => e.note || "—" }] : []),
    { key: "minutes", label: decimal ? tr("Hours") : tr("Time"), align: "right", render: (e) => fmt(e.minutes) },
  ];

  const field = "control h-8 w-full text-xs";
  const controls = (
    <div className="space-y-3 text-xs">
      <label className="block space-y-1"><span className="font-medium text-fg-muted">{tr("From")}</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${field} ts-from`} /></label>
      <label className="block space-y-1"><span className="font-medium text-fg-muted">{tr("To")}</span><input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${field} ts-to`} /></label>
      <label className="block space-y-1"><span className="font-medium text-fg-muted">{tr("Group by")}</span>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${field} ts-group`}>{Object.entries(GROUPS).map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="font-medium text-fg-muted">{tr("Project")}</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${field} ts-project`}><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="font-medium text-fg-muted">{tr("Person")}</span>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${field} ts-person`}><option value="">{tr("Everyone")}</option>{(data?.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <Toggle size="sm" checked={detail} onChange={setDetail} label={tr("List the entries")} className="ts-detail" />
      {detail ? <Toggle size="sm" checked={notes} onChange={setNotes} label={tr("Show notes")} /> : null}
      <Toggle size="sm" checked={decimal} onChange={setDecimal} label={tr("Decimal hours (1.50)")} className="ts-decimal" />
      <Toggle size="sm" checked={signatures} onChange={setSignatures} label={tr("Signature lines")} className="ts-sign" />
    </div>
  );

  return (
    <ReportShell title={`${tr("Time")} · ${tr("Report")}`} backHref="/time" controls={controls}>
      {error ? <p className="text-sm text-rose-500">{error.message}</p> : loading && !data ? <LoadingDoc /> : (
        <>
          <DocHeader kicker={tr("Time report")} title={`${formatDate(data.from)} – ${formatDate(data.to)}`} subtitle={[projectName ? `${tr("Project")}: ${projectName}` : null, personName ? `${tr("Person")}: ${personName}` : null].filter(Boolean).join(" · ") || tr("Everything logged in this profile.")} badges={[fmt(data.total_minutes), tr("{n} entries", { n: data.entry_count })]} />
          <Section title={tr("Summary")}>
            <KV items={[[tr("Logged"), `${formatMinutes(data.total_minutes)} (${hours(data.total_minutes)} h)`], [tr("Entries"), data.entry_count], [tr("People"), data.people_count], [tr("Tasks"), data.task_count], [tr("Days with time"), data.days.length], [tr("Average per day"), data.days.length ? fmt(data.total_minutes / data.days.length) : "—"]]} />
          </Section>
          <Section title={tr("Totals by {x}", { x: tr(GROUPS[group]).toLowerCase() })} count={data.groups.length}>
            <RTable rows={data.groups.map((g) => ({ ...g, id: g.key }))} columns={totalColumns} empty={tr("No time logged in this period")} />
            {data.groups.length ? <p className="ts-total mt-2 flex justify-end gap-6 border-t-2 border-fg/70 pt-2 text-sm font-bold"><span>{tr("Total")}</span><span className="tabular-nums">{fmt(data.total_minutes)}</span></p> : null}
          </Section>
          {detail ? data.groups.map((g) => (
            <Section key={g.key} title={label(g)} count={fmt(g.minutes)}>
              <RTable rows={byGroup.get(g.key) ?? []} columns={entryColumns} />
            </Section>
          )) : null}
          {data.truncated ? <p className="text-xs text-fg-muted">{tr("Only the newest 5000 entries are shown. Narrow the period.")}</p> : null}
          {signatures ? (
            <div className="ts-signatures mt-14 grid grid-cols-2 gap-10 text-xs text-fg-muted" style={{ breakInside: "avoid" }}>
              {[tr("Prepared by"), tr("Approved by")].map((who) => (
                <div key={who}><div className="h-12 border-b border-fg/70" /><p className="mt-1.5 flex justify-between"><span>{who}</span><span>{tr("Date")}</span></p></div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </ReportShell>
  );
}
