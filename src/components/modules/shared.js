"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useNav } from "@/lib/nav";
import { Eye, Pencil, Trash2, Paperclip, FileText, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { useT } from "@/lib/i18n";

/** List-page data + delete helpers. */
export function useCrudList(url) {
  const { data, loading, error, refetch, setData } = useFetch(url);
  const rows = data ?? [];
  const removeLocal = (ids) => setData((d) => (d ?? []).filter((r) => !ids.includes(r.id)));
  return { rows, loading, error, refetch, setData, removeLocal };
}

/** Opens the create form when the URL has ?new=1 (from the top bar "New" menu), then cleans the URL. */
export function useNewParam(basePath, onNew) {
  const sp = useSearchParams();
  const router = useNav();
  const flag = sp.get("new");
  useEffect(() => {
    if (flag === "1") {
      onNew();
      router.replace(basePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);
}

/** Press "n" (outside inputs) to create a new record. */
export function useNewShortcut(onNew) {
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNew]);
}

export function RowActions({ href, onEdit, onDelete }) {
  const tr = useT();
  return (
    <>
      {href ? <Link href={href} className="inline-flex" onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="iconXs" icon={Eye} aria-label={tr("View")} data-tip={tr("View")} /></Link> : null}
      {onEdit ? <Button variant="ghost" size="iconXs" icon={Pencil} onClick={onEdit} aria-label={tr("Edit")} data-tip={tr("Edit")} /> : null}
      {onDelete ? <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={onDelete} aria-label={tr("Delete")} data-tip={tr("Delete")} /> : null}
    </>
  );
}

export function ProjectChip({ id, name, code, color, link = true }) {
  if (!name) return <span className="text-fg-faint">—</span>;
  const inner = (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color || "var(--accent)" }} />
      <span className="truncate">{name}</span>
      {code ? <span className="font-mono text-[10px] text-fg-faint">{code}</span> : null}
    </span>
  );
  return link && id ? <Link href={`/projects/${id}`} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">{inner}</Link> : inner;
}

export function PersonCell({ id, name, color, sub, link = true, size = "sm" }) {
  const tr = useT();
  if (!name) return <span className="text-fg-faint">{tr("Unassigned")}</span>;
  const inner = (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} color={color} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub ? <span className="block truncate text-[11px] text-fg-muted">{sub}</span> : null}
      </span>
    </span>
  );
  return link && id ? <Link href={`/employees/${id}`} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">{inner}</Link> : inner;
}

export function DueDateCell({ date, status }) {
  if (!date) return <span className="text-fg-faint">—</span>;
  const overdue = isOverdue(date, status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm tabular-nums", overdue && "font-medium text-rose-500")}>
      {overdue ? <CalendarClock size={14} /> : null}
      {formatDate(date)}
    </span>
  );
}

export function CountsCell({ attachments = 0, outputs = 0 }) {
  return (
    <span className="inline-flex items-center gap-3 text-xs text-fg-muted">
      <span className={cn("inline-flex items-center gap-1", attachments > 0 && "text-fg")}><Paperclip size={13} /> {attachments}</span>
      <span className={cn("inline-flex items-center gap-1", outputs > 0 && "text-fg")}><FileText size={13} /> {outputs}</span>
    </span>
  );
}

/** Small inline status/priority <select> that PUTs immediately. */
export function InlineSelect({ value, map, onChange, className }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    setBusy(true);
    try {
      await onChange(e.target.value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <select
      value={value}
      onChange={change}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      className={cn("control h-8 w-auto cursor-pointer py-0 pr-7 text-xs", className)}
    >
      {Object.entries(map).map(([k, v]) => (
        <option key={k} value={k}>{tr(v.label)}</option>
      ))}
    </select>
  );
}

export function useDeleteFlow(baseUrl, { onDeleted, toast, label = "record" }) {
  const [target, setTarget] = useState(null); // row | { ids: [] }
  const [busy, setBusy] = useState(false);
  const confirm = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      const ids = target.ids ?? [target.id];
      await Promise.all(ids.map((id) => api.del(`${baseUrl}/${id}`)));
      toast.success(ids.length > 1 ? `${ids.length} ${label}s deleted` : `${capitalize(label)} deleted`);
      onDeleted(ids);
      setTarget(null);
    } catch (e) {
      toast.error(`Could not delete ${label}`, e.message);
    } finally {
      setBusy(false);
    }
  }, [target, baseUrl, onDeleted, toast, label]);
  return { target, setTarget, busy, confirm };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
