"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardList, Pencil, Trash2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { REQ_PRIORITY, REQ_STATUS, REQ_TYPE } from "@/lib/modules";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import SortableList from "./SortableList";
import RequirementForm from "./RequirementForm";
import { InlineSelect } from "./shared";
import { useT } from "@/lib/i18n";

/** A project's requirements, ordered (drag / arrows / position) with quick status changes. */
export default function ProjectRequirements({ project, onChange }) {
  const tr = useT();
  const toast = useToast();
  const [form, setForm] = useState({ open: false, initial: null });
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = project.requirements ?? [];

  const reload = async () => {
    try {
      onChange(await api.get(`/api/projects/${project.id}`));
    } catch (e) {
      toast.error("Could not refresh", e.message);
    }
  };
  const reorder = async (ids) => {
    const map = Object.fromEntries(items.map((r) => [r.id, r]));
    onChange({ ...project, requirements: ids.map((id, i) => ({ ...map[id], sort_order: i + 1 })) });
    try {
      onChange({ ...project, requirements: await api.put(`/api/projects/${project.id}/requirements`, { order: ids }) });
    } catch (e) {
      toast.error("Could not save order", e.message);
    }
  };
  const quick = async (row, patch) => {
    try {
      const saved = await api.put(`/api/requirements/${row.id}`, patch);
      onChange({ ...project, requirements: items.map((r) => (r.id === row.id ? { ...r, ...saved, tasks: undefined } : r)) });
    } catch (e) {
      toast.error("Could not update", e.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/api/requirements/${toDelete.id}`);
      toast.success(`${toDelete.code} deleted`);
      setToDelete(null);
      onChange({ ...project, requirements: items.filter((r) => r.id !== toDelete.id) });
    } catch (e) {
      toast.error("Could not delete", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={ClipboardList}
        title={tr("Requirements")}
        description={`${items.length} requirement${items.length === 1 ? "" : "s"} · drag, use arrows or type a number to set the order`}
        actions={<Button size="sm" icon={Plus} onClick={() => setForm({ open: true, initial: null })}>{tr("New requirement")}</Button>}
      />
      {items.length === 0 ? (
        <EmptyState compact icon={ClipboardList} title={tr("No requirements yet")} description="Write down what this project must deliver, then link tasks to each requirement." action={<Button size="sm" icon={Plus} onClick={() => setForm({ open: true, initial: null })}>Add the first one</Button>} />
      ) : (
        <SortableList
          items={items}
          onReorder={reorder}
          renderItem={(r) => (
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="w-16 shrink-0 font-mono text-xs text-fg-muted">{r.code}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/requirements/${r.id}`} className="block truncate text-sm font-medium hover:text-accent">{r.title}</Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
                  <StatusBadge map={REQ_PRIORITY} value={r.priority} />
                  <StatusBadge map={REQ_TYPE} value={r.type} dot={false} />
                  {r.stakeholder_name ? <span>· {r.stakeholder_name}</span> : null}
                  <span>· {r.done_count}/{r.task_count} tasks done</span>
                </p>
              </div>
              <InlineSelect value={r.status} map={REQ_STATUS} onChange={(v) => quick(r, { status: v })} />
              <div className="flex shrink-0 items-center gap-0.5">
                <Link href={`/requirements/${r.id}`}><Button variant="ghost" size="iconXs" icon={ExternalLink} aria-label={tr("Open")} data-tip={tr("Open")} /></Link>
                <Button variant="ghost" size="iconXs" icon={Pencil} onClick={() => setForm({ open: true, initial: r })} aria-label={tr("Edit")} data-tip={tr("Edit")} />
                <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={() => setToDelete(r)} aria-label={tr("Delete")} data-tip={tr("Delete")} />
              </div>
            </div>
          )}
        />
      )}
      <RequirementForm open={form.open} onClose={() => setForm({ open: false, initial: null })} initial={form.initial} defaults={{ project_id: project.id }} onSaved={reload} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy} title={toDelete ? `Delete ${toDelete.code}?` : ""} description="Linked tasks are kept but unlinked." />
    </Card>
  );
}
