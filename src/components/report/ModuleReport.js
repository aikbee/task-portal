"use client";
import { useMemo, useState } from "react";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP, TASK_STATUS, TASK_PRIORITY, PROJECT_STATUS, REQ_STATUS, REQ_PRIORITY, REQ_TYPE, EMPLOYEE_STATUS, INFO_CATEGORY } from "@/lib/modules";
import { formatDate, formatMoney, fullName } from "@/lib/utils";
import { Toggle } from "@/components/ui/Controls";
import { useT } from "@/lib/i18n";
import { ReportShell, DocHeader, Section, RTable, Checklist, LoadingDoc } from "./primitives";

const label = (map, v) => (v == null ? null : map?.[v]?.label ?? v);

/** Column set, status map and grouping key per module. */
function spec(module, tr) {
  switch (module) {
    case "projects":
      return { statusMap: PROJECT_STATUS, statusKey: "status", columns: [{ key: "code", label: tr("Code") }, { key: "name", label: tr("Name") }, { key: "status", label: tr("Status"), render: (r) => label(PROJECT_STATUS, r.status) }, { key: "start_date", label: tr("Start"), render: (r) => (r.start_date ? formatDate(r.start_date) : "—") }, { key: "end_date", label: tr("End"), render: (r) => (r.end_date ? formatDate(r.end_date) : "—") }, { key: "budget", label: tr("Budget"), align: "right", render: (r) => (r.budget != null ? formatMoney(r.budget) : "—") }] };
    case "requirements":
      return { statusMap: REQ_STATUS, statusKey: "status", groupKey: "project_name", columns: [{ key: "code", label: tr("Code") }, { key: "title", label: tr("Title") }, { key: "project_name", label: tr("Project") }, { key: "type", label: tr("Type"), render: (r) => label(REQ_TYPE, r.type) }, { key: "priority", label: tr("Priority"), render: (r) => label(REQ_PRIORITY, r.priority) }, { key: "status", label: tr("Status"), render: (r) => label(REQ_STATUS, r.status) }] };
    case "employees":
      return { statusMap: EMPLOYEE_STATUS, statusKey: "status", groupKey: "department", columns: [{ key: "name", label: tr("Name"), render: (r) => fullName(r) }, { key: "job_title", label: tr("Role") }, { key: "department", label: tr("Department") }, { key: "email", label: tr("Email") }, { key: "status", label: tr("Status"), render: (r) => label(EMPLOYEE_STATUS, r.status) }] };
    case "tasks":
      return { statusMap: TASK_STATUS, statusKey: "status", groupKey: "project_name", columns: [{ key: "title", label: tr("Task") }, { key: "project_name", label: tr("Project") }, { key: "assignee_name", label: tr("Assignee") }, { key: "status", label: tr("Status"), render: (r) => label(TASK_STATUS, r.status) }, { key: "priority", label: tr("Priority"), render: (r) => label(TASK_PRIORITY, r.priority) }, { key: "due_date", label: tr("Due"), render: (r) => (r.due_date ? formatDate(r.due_date) : "—") }] };
    case "info":
      return { statusMap: INFO_CATEGORY, statusKey: "category", groupKey: "project_name", columns: [{ key: "title", label: tr("Title") }, { key: "category", label: tr("Category"), render: (r) => label(INFO_CATEGORY, r.category) }, { key: "project_name", label: tr("Project") }, { key: "tags", label: tr("Tags"), render: (r) => (r.tags ? r.tags.split(",").map((t) => `#${t}`).join(" ") : "—") }, { key: "updated_at", label: tr("Updated"), render: (r) => formatDate(r.updated_at) }] };
    default:
      return null;
  }
}

/** Print-ready list of every record in a module, filterable by status and optionally grouped. */
export default function ModuleReport({ module }) {
  const tr = useT();
  const mod = MODULE_MAP[module];
  const s = useMemo(() => spec(module, tr), [module, tr]);
  const { data, loading, error } = useFetch(`/api/${module}`);
  const rows = useMemo(() => (Array.isArray(data) ? data : data?.items ?? []), [data]);
  const [statuses, setStatuses] = useState(null); // null = all
  const [grouped, setGrouped] = useState(false);
  const statusItems = Object.entries(s.statusMap).map(([id, v]) => ({ id, label: tr(v.label) }));
  const visible = rows.filter((r) => !statuses || statuses.has(r[s.statusKey]));
  const none = module === "employees" ? tr("No department") : tr("No project");
  const groups = grouped && s.groupKey ? Object.entries(visible.reduce((acc, r) => ((acc[r[s.groupKey] || none] ??= []).push(r), acc), {})).sort(([a], [b]) => (a === none) - (b === none) || a.localeCompare(b)) : null;

  const controls = (
    <>
      <Checklist title={module === "info" ? tr("Category") : tr("Status")} items={statusItems} selected={statuses ?? new Set(statusItems.map((i) => i.id))} onChange={setStatuses} />
      {s.groupKey ? <Toggle checked={grouped} onChange={setGrouped} label={tr("Group by {x}", { x: (module === "employees" ? tr("Department") : tr("Project")).toLowerCase() })} /> : null}
    </>
  );

  return (
    <ReportShell title={`${tr(mod.label)} · ${tr("Report")}`} backHref={`/${module}`} controls={controls}>
      {error ? <p className="text-sm text-rose-500">{error.message}</p> : loading && !data ? <LoadingDoc /> : (
        <>
          <DocHeader kicker={tr("Report")} title={tr(mod.label)} subtitle={tr(mod.description)} badges={[`${visible.length} / ${rows.length}`]} />
          {groups ? groups.map(([g, list]) => (
            <Section key={g} title={g} count={list.length}><RTable rows={list} columns={s.columns.filter((c) => c.key !== s.groupKey)} /></Section>
          )) : (
            <Section title={tr(mod.label)} count={visible.length}><RTable rows={visible} columns={s.columns} /></Section>
          )}
        </>
      )}
    </ReportShell>
  );
}
