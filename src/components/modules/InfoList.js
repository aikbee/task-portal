"use client";
import { useCallback, useMemo, useState } from "react";
import { Plus, Pin, KeyRound, Paperclip, FileText, Link2, Search } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import InfoForm from "./InfoForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, ProjectChip } from "./shared";
import { useFetch } from "@/lib/hooks";
import { INFO_CATEGORY, MODULE_MAP } from "@/lib/modules";
import { useNav } from "@/lib/nav";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function InfoList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [projectId, setProjectId] = useState("");
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (tag) qs.set("tag", tag);
  if (projectId) qs.set("project_id", projectId);
  const { data: projects } = useFetch("/api/projects");
  const { rows, loading, error, refetch, removeLocal } = useCrudList(`/api/info${qs.toString() ? `?${qs}` : ""}`);
  const { rows: allRows } = useCrudList("/api/info");
  const tags = useMemo(() => [...new Set(allRows.flatMap((r) => (r.tags ?? "").split(",").filter(Boolean)))].sort(), [allRows]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/info", openNew);
  useNewShortcut(openNew);
  const del = useDeleteFlow("/api/info", { toast, label: "info item", onDeleted: removeLocal });
  const mod = MODULE_MAP.info;

  const columns = [
    {
      key: "title", label: tr("Info"), hideable: false,
      render: (r) => (
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: r.color }}><mod.icon size={15} /></span>
          <span className="min-w-0 leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{r.title}</span>
              {r.pinned ? <Pin size={11} className="shrink-0 text-accent" /> : null}
            </span>
            {r.summary ? <span className="block truncate text-[11px] text-fg-muted">{r.summary}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "category", label: tr("Category"), sortValue: (r) => Object.keys(INFO_CATEGORY).indexOf(r.category), render: (r) => <StatusBadge map={INFO_CATEGORY} value={r.category} dot={false} /> },
    { key: "project_name", label: tr("Project"), render: (r) => <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} /> },
    {
      key: "tags", label: tr("Tags"),
      render: (r) => r.tags ? (
        <span className="flex max-w-xs flex-wrap gap-1">
          {r.tags.split(",").map((t) => (
            <button key={t} onClick={(e) => { e.stopPropagation(); setTag(t); }} className={cn("rounded-full border px-1.5 py-px text-[10px]", tag === t ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:text-fg")}>#{t}</button>
          ))}
        </span>
      ) : <span className="text-fg-faint">—</span>,
    },
    {
      key: "extras", label: tr("Contains"), sortable: false, searchable: false,
      render: (r) => (
        <span className="inline-flex items-center gap-2.5 text-xs text-fg-muted">
          {r.has_secret ? <span className="inline-flex items-center gap-1 text-amber-500" title="Has a stored secret"><KeyRound size={13} /></span> : null}
          {r.url ? <span className="inline-flex items-center gap-1" title={r.url}><Link2 size={13} /></span> : null}
          <span className={cn("inline-flex items-center gap-1", r.note_count > 0 && "text-fg")}><FileText size={13} /> {r.note_count}</span>
          <span className={cn("inline-flex items-center gap-1", r.attachment_count > 0 && "text-fg")}><Paperclip size={13} /> {r.attachment_count}</span>
        </span>
      ),
    },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader title={tr("Info")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<><ReportButton module="info" /><Button variant="outline" icon={Search} onClick={() => router.push("/info/search")}>{tr("Search")}</Button><Button icon={Plus} onClick={openNew}>{tr("New info")}</Button></>} />
      <DataTable
        id="info"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={null}
        searchPlaceholder={tr("Search titles, summaries, tags…")}
        dateFields={[
          { key: "updated_at", label: tr("Updated") },
          { key: "created_at", label: tr("Created") },
        ]}
        onRowClick={(r) => router.push(`/info/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/info/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 w-44"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-40"><option value="">{tr("All categories")}</option>{Object.entries(INFO_CATEGORY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
            <Select value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 w-40"><option value="">{tr("All tags")}</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</Select>
          </>
        }
        emptyTitle="Nothing saved yet"
        emptyDescription="Keep guidelines, credentials, links and reference notes here — each with its own notes and attachments."
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New info")}</Button>}
      />
      <InfoForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} items?` : "Delete this info item?"}
        description="Its notes, attachments and any stored secret are permanently removed."
      />
    </>
  );
}
