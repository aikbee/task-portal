"use client";
import { useCallback, useState } from "react";
import { Plus, Image as ImageIcon, Brush } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { MentionChips } from "@/components/ui/Mentions";
import DrawBoardForm from "./DrawBoardForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, ProjectChip } from "./shared";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP } from "@/lib/modules";
import { useNav } from "@/lib/nav";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import ReportButton from "@/components/report/ReportButton";

export default function DrawBoardsList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [projectId, setProjectId] = useState("");
  const { data: projects } = useFetch("/api/projects");
  const { rows, loading, error, refetch, removeLocal } = useCrudList(`/api/drawboards${projectId ? `?project_id=${projectId}` : ""}`);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/drawboards", openNew);
  useNewShortcut(openNew);
  const del = useDeleteFlow("/api/drawboards", { toast, label: "board", onDeleted: removeLocal });
  const mod = MODULE_MAP.drawboards;

  const columns = [
    {
      key: "title", label: tr("Board"), hideable: false,
      render: (r) => (
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: mod.color }}><Brush size={15} /></span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{r.title}</span>
            {r.description ? <span className="block truncate text-[11px] text-fg-muted">{r.description}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "project_name", label: tr("Project"), render: (r) => <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} /> },
    { key: "size", label: tr("Size"), sortValue: (r) => r.width * r.height, render: (r) => <span className="tabular-nums text-fg-muted">{r.width} × {r.height}</span> },
    { key: "image_count", label: tr("Images"), render: (r) => <span className={cn("inline-flex items-center gap-1 text-xs", r.image_count > 0 ? "text-fg" : "text-fg-muted")}><ImageIcon size={13} /> {r.image_count}</span> },
    { key: "linked", label: tr("Linked"), sortable: false, searchable: false, render: (r) => <MentionChips text={r.notes} size="xs" /> },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
    { key: "updated_at", label: tr("Updated"), render: (r) => <span className="text-fg-muted">{relativeTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader title={tr("Draw Board")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<><ReportButton module="drawboards" /><Button icon={Plus} onClick={openNew}>{tr("New board")}</Button></>} />
      <DataTable
        id="drawboards"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={null}
        searchPlaceholder={tr("Search boards…")}
        dateFields={[{ key: "updated_at", label: tr("Updated") }, { key: "created_at", label: tr("Created") }]}
        onRowClick={(r) => router.push(`/drawboards/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/drawboards/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={<Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 w-44"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        emptyTitle={tr("No boards yet")}
        emptyDescription={tr("Create a board to sketch, paste screenshots and arrange them.")}
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New board")}</Button>}
      />
      <DrawBoardForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={(saved, created) => { refetch(); if (created) router.push(`/drawboards/${saved.id}`); }} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} boards?` : tr("Delete this board?")}
        description={tr("The drawing and its images are permanently removed.")}
      />
    </>
  );
}
