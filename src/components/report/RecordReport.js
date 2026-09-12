"use client";
import { useMemo, useState } from "react";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP, TASK_STATUS, TASK_PRIORITY, PROJECT_STATUS, REQ_STATUS, REQ_PRIORITY, REQ_TYPE, EMPLOYEE_STATUS, INFO_CATEGORY } from "@/lib/modules";
import { formatDate, formatDateTime, formatMoney, fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ReportShell, DocHeader, Section, KV, RTable, Blocks, AttachmentList, Checklist, SectionToggles, LoadingDoc } from "./primitives";

const label = (map, v) => (v == null ? null : map?.[v]?.label ?? v);
const firstLine = (t) => (t || "").split("\n").find((l) => l.trim())?.slice(0, 60) || "";

/** Print-ready report for one record. Sections can be toggled; outputs, notes and attachments can be picked. */
export default function RecordReport({ module, id }) {
  const tr = useT();
  const mod = MODULE_MAP[module];
  const { data, loading, error } = useFetch(`/api/${module}/${id}`);
  const spec = useMemo(() => (data ? build(module, data, tr) : null), [module, data, tr]);
  const [enabled, setEnabled] = useState(null); // null = every section
  const [picks, setPicks] = useState({}); // section key -> Set of ids; missing = all
  const on = (key) => (enabled ? enabled.has(key) : true);
  const pick = (key, items) => (picks[key] ? items.filter((i) => picks[key].has(i.id)) : items);
  const setPick = (key, set) => setPicks((p) => ({ ...p, [key]: set }));

  const title = spec?.title ?? `${tr(mod?.singular ?? "Record")} #${id}`;
  const controls = spec ? (
    <>
      <SectionToggles sections={spec.sections.map((s) => ({ key: s.key, label: s.label }))} enabled={enabled ?? new Set(spec.sections.map((s) => s.key))} onChange={setEnabled} />
      {spec.sections.filter((s) => s.list).map((s) => (
        <Checklist key={s.key} title={s.label} items={s.list.items.map((i) => ({ id: i.id, label: s.list.label(i), sub: s.list.sub?.(i) }))} selected={picks[s.key] ?? new Set(s.list.items.map((i) => i.id))} onChange={(set) => setPick(s.key, set)} />
      ))}
    </>
  ) : null;

  return (
    <ReportShell title={title} backHref={`/${module}/${id}`} controls={controls}>
      {error ? <p className="text-sm text-rose-500">{error.message}</p> : loading || !spec ? <LoadingDoc /> : (
        <>
          <DocHeader kicker={tr(mod.singular)} title={spec.title} subtitle={spec.subtitle} badges={spec.badges} />
          {spec.sections.filter((s) => on(s.key)).map((s) => (
            <Section key={s.key} title={s.label} count={s.list ? `${pick(s.key, s.list.items).length}/${s.list.items.length}` : s.count}>
              {s.list ? s.list.render(pick(s.key, s.list.items)) : s.render()}
            </Section>
          ))}
          <p className="mt-10 border-t border-line pt-3 text-[10px] text-fg-faint">{tr("Report generated from Task Portal")} · {formatDateTime(new Date().toISOString())}</p>
        </>
      )}
    </ReportShell>
  );
}

/** Per-module document structure: sections are { key, label, render } or { key, label, list: { items, label, sub, render } }. */
function build(module, d, tr) {
  const taskCols = [
    { key: "title", label: tr("Task") },
    { key: "assignee_name", label: tr("Assignee") },
    { key: "status", label: tr("Status"), render: (t) => label(TASK_STATUS, t.status) },
    { key: "priority", label: tr("Priority"), render: (t) => label(TASK_PRIORITY, t.priority) },
    { key: "due_date", label: tr("Due"), render: (t) => (t.due_date ? formatDate(t.due_date) : "—") },
  ];
  const textList = (items, kind, untitled) =>
    items.length ? items.map((o) => <div key={o.id} className="report-section mb-5"><h3 className="mb-1.5 text-sm font-semibold">{o.title || untitled}</h3><Blocks text={o.content} /></div>) : <p className="text-sm text-fg-muted">—</p>;
  const files = (kind) => ({ items: d.attachments ?? [], label: (a) => a.original_name, sub: (a) => a.mime_type, render: (items) => <AttachmentList items={items} kind={kind} /> });

  if (module === "tasks") {
    return {
      title: d.title,
      subtitle: d.project_name ? `${d.project_name}${d.project_code ? ` (${d.project_code})` : ""}` : null,
      badges: [label(TASK_STATUS, d.status), label(TASK_PRIORITY, d.priority), d.due_date ? `${tr("Due")} ${formatDate(d.due_date)}` : null],
      sections: [
        { key: "details", label: tr("Details"), render: () => <KV items={[[tr("Project"), d.project_name], [tr("Assignee"), d.assignee_name ? `${d.assignee_name}${d.assignee_title ? ` · ${d.assignee_title}` : ""}` : tr("Unassigned")], [tr("Requirement"), d.requirement_code ? `${d.requirement_code} · ${d.requirement_title}` : null], [tr("Status"), label(TASK_STATUS, d.status)], [tr("Priority"), label(TASK_PRIORITY, d.priority)], [tr("Due date"), d.due_date ? formatDate(d.due_date) : null], [tr("Created"), formatDateTime(d.created_at)], [tr("Updated"), formatDateTime(d.updated_at)]]} /> },
        { key: "description", label: tr("Description"), render: () => <Blocks text={d.description} /> },
        { key: "outputs", label: tr("Outputs"), list: { items: d.outputs ?? [], label: (o) => o.title || firstLine(o.content) || `${tr("Untitled output")} #${o.id}`, sub: (o) => formatDateTime(o.updated_at), render: (items) => textList(items, "task", tr("Untitled output")) } },
        { key: "attachments", label: tr("Attachments"), list: files("task") },
      ],
    };
  }
  if (module === "info") {
    return {
      title: d.title,
      subtitle: d.summary || null,
      badges: [label(INFO_CATEGORY, d.category), d.project_name, d.pinned ? tr("Pinned") : null],
      sections: [
        { key: "details", label: tr("Details"), render: () => <KV items={[[tr("Category"), label(INFO_CATEGORY, d.category)], [tr("Project"), d.project_name], [tr("Tags"), d.tags ? d.tags.split(",").map((t) => `#${t}`).join("  ") : null], [tr("Link"), d.url], [tr("Username"), d.username], d.has_secret ? [tr("Secret"), tr("Stored, not included in the report")] : null, [tr("Created"), formatDateTime(d.created_at)], [tr("Updated"), formatDateTime(d.updated_at)]]} /> },
        { key: "content", label: tr("Content"), render: () => <Blocks text={d.content} /> },
        { key: "notes", label: tr("Notes"), list: { items: d.notes ?? [], label: (n) => n.title || firstLine(n.content) || `${tr("Note")} #${n.id}`, sub: (n) => formatDateTime(n.updated_at), render: (items) => textList(items, "info", tr("Note")) } },
        { key: "attachments", label: tr("Attachments"), list: files("info") },
      ],
    };
  }
  if (module === "projects") {
    const pct = d.task_count ? Math.round((d.done_count / d.task_count) * 100) : 0;
    return {
      title: d.name,
      subtitle: d.code,
      badges: [label(PROJECT_STATUS, d.status), `${d.done_count ?? 0}/${d.task_count ?? 0} ${tr("Tasks").toLowerCase()} · ${pct}%`],
      sections: [
        { key: "overview", label: tr("Overview"), render: () => <KV items={[[tr("Code"), d.code], [tr("Status"), label(PROJECT_STATUS, d.status)], [tr("Budget"), d.budget != null ? formatMoney(d.budget) : null], [tr("Start"), d.start_date ? formatDate(d.start_date) : null], [tr("End"), d.end_date ? formatDate(d.end_date) : null], [tr("Progress"), `${d.done_count ?? 0} / ${d.task_count ?? 0} (${pct}%)`]]} /> },
        { key: "description", label: tr("Description"), render: () => <Blocks text={d.description} /> },
        { key: "team", label: tr("Team"), count: d.employees?.length, render: () => <RTable rows={d.employees ?? []} columns={[{ key: "name", label: tr("Name"), render: (e) => fullName(e) }, { key: "job_title", label: tr("Role"), render: (e) => [e.job_title, e.department].filter(Boolean).join(" · ") || "—" }, { key: "role", label: tr("Project role") }, { key: "task_count", label: tr("Tasks"), align: "right" }]} /> },
        { key: "requirements", label: tr("Requirements"), count: d.requirements?.length, render: () => <RTable rows={d.requirements ?? []} columns={[{ key: "code", label: tr("Code") }, { key: "title", label: tr("Title") }, { key: "type", label: tr("Type"), render: (r) => label(REQ_TYPE, r.type) }, { key: "priority", label: tr("Priority"), render: (r) => label(REQ_PRIORITY, r.priority) }, { key: "status", label: tr("Status"), render: (r) => label(REQ_STATUS, r.status) }]} /> },
        { key: "tasks", label: tr("Tasks"), count: d.tasks?.length, render: () => <RTable rows={d.tasks ?? []} columns={taskCols} /> },
      ],
    };
  }
  if (module === "requirements") {
    return {
      title: `${d.code} · ${d.title}`,
      subtitle: d.project_name,
      badges: [label(REQ_TYPE, d.type), label(REQ_PRIORITY, d.priority), label(REQ_STATUS, d.status)],
      sections: [
        { key: "details", label: tr("Details"), render: () => <KV items={[[tr("Project"), d.project_name], [tr("Code"), d.code], [tr("Type"), label(REQ_TYPE, d.type)], [tr("Priority"), label(REQ_PRIORITY, d.priority)], [tr("Status"), label(REQ_STATUS, d.status)], [tr("Stakeholder"), d.stakeholder_name], [tr("Created"), formatDateTime(d.created_at)], [tr("Updated"), formatDateTime(d.updated_at)]]} /> },
        { key: "description", label: tr("Description"), render: () => <Blocks text={d.description} /> },
        { key: "acceptance", label: tr("Acceptance criteria"), render: () => <Blocks text={d.acceptance_criteria} /> },
        { key: "tasks", label: tr("Tasks"), count: d.tasks?.length, render: () => <RTable rows={d.tasks ?? []} columns={taskCols} /> },
        { key: "attachments", label: tr("Attachments"), list: files("requirement") },
      ],
    };
  }
  if (module === "drawboards") {
    return {
      title: d.title,
      subtitle: d.description || d.project_name || null,
      badges: [d.project_name, `${d.width} × ${d.height}`],
      sections: [
        { key: "drawing", label: tr("Drawing"), render: () => d.thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={d.thumbnail} alt={d.title} className="max-w-full rounded border border-line" />
        ) : <p className="text-sm text-fg-muted">—</p> },
        { key: "details", label: tr("Details"), render: () => <KV items={[[tr("Project"), d.project_name], [tr("Size"), `${d.width} × ${d.height}`], [tr("Images"), d.image_count], [tr("Created"), formatDateTime(d.created_at)], [tr("Updated"), formatDateTime(d.updated_at)]]} /> },
        { key: "notes", label: tr("Notes"), render: () => <Blocks text={d.notes} /> },
      ],
    };
  }
  if (module === "employees") {
    return {
      title: fullName(d),
      subtitle: [d.job_title, d.department].filter(Boolean).join(" · ") || null,
      badges: [label(EMPLOYEE_STATUS, d.status)],
      sections: [
        { key: "profile", label: tr("Profile"), render: () => <KV items={[[tr("Email"), d.email], [tr("Phone"), d.phone], [tr("Department"), d.department], [tr("Role"), d.job_title], [tr("Status"), label(EMPLOYEE_STATUS, d.status)], [tr("Hired"), d.hired_at ? formatDate(d.hired_at) : null]]} /> },
        { key: "projects", label: tr("Projects"), count: d.projects?.length, render: () => <RTable rows={d.projects ?? []} columns={[{ key: "code", label: tr("Code") }, { key: "name", label: tr("Project") }, { key: "role", label: tr("Project role") }, { key: "status", label: tr("Status"), render: (p) => label(PROJECT_STATUS, p.status) }, { key: "my_task_count", label: tr("Tasks"), align: "right" }]} /> },
        { key: "tasks", label: tr("Tasks"), count: d.tasks?.length, render: () => <RTable rows={d.tasks ?? []} columns={[{ key: "title", label: tr("Task") }, { key: "project_name", label: tr("Project") }, { key: "status", label: tr("Status"), render: (t) => label(TASK_STATUS, t.status) }, { key: "priority", label: tr("Priority"), render: (t) => label(TASK_PRIORITY, t.priority) }, { key: "due_date", label: tr("Due"), render: (t) => (t.due_date ? formatDate(t.due_date) : "—") }]} /> },
      ],
    };
  }
  return { title: d.title ?? d.name ?? "", sections: [] };
}
