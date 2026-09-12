"use client";
import { useEffect, useEffectEvent, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Trash2, Image as ImageIcon, Clock, Ruler, FileText } from "lucide-react";
import { useNav } from "@/lib/nav";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePrefs } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import { formatDateTime, relativeTime, cn } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import BlockEditor from "@/components/ui/BlockEditor";
import ReportButton from "@/components/report/ReportButton";
import DrawBoardForm from "./DrawBoardForm";
import { ProjectChip } from "./shared";
import { useT } from "@/lib/i18n";

// Fabric touches the DOM at import time; keep the editor out of the server render
const DrawBoardEditor = dynamic(() => import("./DrawBoardEditor"), { ssr: false, loading: () => <Skeleton className="h-[60vh] w-full" /> });

export default function DrawBoardDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: board, loading, error, refetch, setData } = useFetch(`/api/drawboards/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mod = MODULE_MAP.drawboards;

  if (error) return <EmptyState title={tr("Board not found")} description={error.message} action={<Button onClick={() => router.push("/drawboards")}>{tr("Draw Board")}</Button>} />;
  if (loading && !board) return <Skeleton className="h-[70vh] w-full" />;
  if (!board) return null;

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/drawboards/${id}`);
      toast.success(tr("Board deleted"));
      router.push("/drawboards");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };
  const merge = (row) => setData((b) => ({ ...b, ...row, data: b?.data ?? null, thumbnail: b?.thumbnail ?? null, attachments: b?.attachments ?? [] }));

  return (
    <>
      <PageHeader
        title={board.title}
        icon={mod.icon}
        color={mod.color}
        crumbs={[{ label: tr("Draw Board"), href: "/drawboards" }]}
        actions={
          <>
            <ReportButton module="drawboards" id={id} />
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {board.project_name ? <ProjectChip id={board.project_id} name={board.project_name} code={board.project_code} color={board.project_color} /> : null}
          <span className="inline-flex items-center gap-1"><Ruler size={12} /> {board.width} × {board.height}</span>
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {tr("updated")} {relativeTime(board.updated_at)}</span>
          {board.description ? <span className="basis-full text-fg-muted">{board.description}</span> : null}
        </div>
      </PageHeader>

      <DrawBoardEditor key={board.id} board={board} onSaved={merge} />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Notes board={board} onSaved={merge} />
        <Card className="space-y-3 xl:self-start">
          <CardHeader icon={ImageIcon} title={tr("About")} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[11px] uppercase tracking-wider text-fg-muted">{tr("Size")}</dt><dd className="font-medium tabular-nums">{board.width} × {board.height}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-fg-muted">{tr("Images")}</dt><dd className="font-medium tabular-nums">{board.image_count ?? 0}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-fg-muted">{tr("Created")}</dt><dd className="font-medium">{formatDateTime(board.created_at)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-fg-muted">{tr("Updated")}</dt><dd className="font-medium">{formatDateTime(board.updated_at)}</dd></div>
          </dl>
          <p className="text-[11px] text-fg-muted">{tr("Paste a screenshot with ⌘V, or drop an image onto the canvas. Type @ in the notes to tag a person, project, task, requirement or info item.")}</p>
        </Card>
      </div>

      <DrawBoardForm open={editOpen} onClose={() => setEditOpen(false)} initial={board} onSaved={() => refetch()} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title={tr("Delete this board?")} description={tr("The drawing and its images are permanently removed.")} />
    </>
  );
}

/** Notes with @tags and inline tables, autosaved like task outputs. */
function Notes({ board, onSaved }) {
  const tr = useT();
  const toast = useToast();
  const autosaveSeconds = usePrefs((s) => s.autosaveSeconds);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const server = board.notes ?? "";
  const value = draft ?? server;
  const dirty = draft != null && draft !== server;

  const flush = async () => {
    if (!draft || saving) return;
    const snapshot = draft;
    setSaving(true);
    try {
      const row = await api.put(`/api/drawboards/${board.id}?light=1`, { notes: snapshot });
      onSaved(row);
      setDraft((d) => (d !== snapshot ? d : null));
    } catch (e) {
      toast.error("Could not save notes", e.message);
    } finally {
      setSaving(false);
    }
  };
  const autosave = useEffectEvent(() => flush());
  useEffect(() => {
    if (!dirty || saving || !autosaveSeconds) return;
    const t = setTimeout(() => autosave(), autosaveSeconds * 1000);
    return () => clearTimeout(t);
  }, [dirty, saving, value, autosaveSeconds]);

  return (
    <Card>
      <CardHeader icon={FileText} title={tr("Notes")} description={tr("Context for this board. Type @ to tag related records.")} actions={<span className={cn("text-[11px]", saving ? "text-accent" : dirty ? "text-amber-500" : "text-fg-faint")}>{saving ? tr("Saving…") : dirty ? tr("Unsaved") : tr("Saved")}</span>} />
      <BlockEditor value={value} onChange={(v) => setDraft(v)} onBlur={() => dirty && flush()} onSave={flush} placeholder={tr("What is this board about? Tag people and records with @…")} mono={false} />
    </Card>
  );
}
