"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useNav } from "@/lib/nav";
import { Eye, Pencil, Trash2, Paperclip, FileText, CalendarClock, MessageSquare, ListChecks, Lock, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { useT } from "@/lib/i18n";
import { useAccess } from "@/lib/auth-context";
import { todayIso } from "@/lib/dates";
import { REPEAT_RULES } from "@/lib/recurrence";

/** List-page data + delete helpers. */
export function useCrudList(url) {
  const { data, loading, error, refetch, setData } = useFetch(url);
  const rows = data ?? [];
  const removeLocal = (ids) => setData((d) => (d ?? []).filter((r) => !ids.includes(r.id)));
  return { rows, loading, error, refetch, setData, removeLocal };
}

/** Opens the create form when the URL has ?new=1 (from the top bar "New" menu), then cleans the URL. */
export function useNewParam(basePath, onNew, { workspace = true } = {}) {
  const sp = useSearchParams();
  const router = useNav();
  const flag = sp.get("new");
  const allowed = useAccess().canEdit || !workspace; // workspace: false for pages that are not shared data (profiles, users)
  useEffect(() => {
    if (flag === "1") {
      if (allowed) onNew();
      router.replace(basePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);
}

/** Press "n" (outside inputs) to create a new record. */
export function useNewShortcut(onNew, { workspace = true } = {}) {
  const allowed = useAccess().canEdit || !workspace;
  useEffect(() => {
    if (!allowed) return;
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
  }, [onNew, allowed]);
}

/** View / edit / delete icons of a table row. `workspace: false` for rows that are not shared data (users). */
export function RowActions({ href, onEdit, onDelete, workspace = true }) {
  const tr = useT();
  const access = useAccess();
  if (workspace && !access.canEdit) onEdit = null;
  if (workspace && !access.canDelete) onDelete = null;
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

export function PersonCell({ id, name, color, avatar, sub, link = true, size = "sm" }) {
  const tr = useT();
  if (!name) return <span className="text-fg-faint">{tr("Unassigned")}</span>;
  const inner = (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} color={color} avatar={avatar} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub ? <span className="block truncate text-[11px] text-fg-muted">{sub}</span> : null}
      </span>
    </span>
  );
  return link && id ? <Link href={`/employees/${id}`} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">{inner}</Link> : inner;
}

/** Everybody on a task as overlapping avatars, lead first; "+2" when there are more than fit. */
export function AssigneeStack({ people = [], max = 3, size = "xs", className }) {
  if (!people.length) return null;
  return (
    <span className={cn("assignee-stack inline-flex items-center", className)} title={people.map((p) => p.name).join(", ")}>
      {people.slice(0, max).map((p, i) => <Avatar key={p.id} name={p.name} color={p.avatar_color} size={size} ring className={i ? "-ml-1.5" : ""} />)}
      {people.length > max ? <span className="-ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-surface-3 px-1 text-[10px] font-medium text-fg-muted ring-2 ring-surface">+{people.length - max}</span> : null}
    </span>
  );
}
/** Table cell for a task's assignees: the stack, the lead's name and how many others. Falls back to the single assignee of older rows. */
export function AssigneesCell({ task, link = true }) {
  const tr = useT();
  const people = task.assignees ?? (task.employee_id ? [{ id: task.employee_id, name: task.assignee_name, avatar_color: task.avatar_color }] : []);
  if (!people.length) return <span className="text-xs text-fg-faint">{tr("Unassigned")}</span>;
  const lead = people[0];
  const label = (
    <span className="min-w-0 leading-tight">
      <span className="block truncate text-sm font-medium">{lead.name}</span>
      {people.length > 1 ? <span className="block truncate text-[11px] text-fg-muted">{tr("+{n} more", { n: people.length - 1 })}</span> : null}
    </span>
  );
  return (
    <span className="assignees-cell flex min-w-0 items-center gap-2" title={people.map((p) => p.name).join(", ")}>
      <AssigneeStack people={people} size="sm" />
      {link ? <Link href={`/employees/${lead.id}`} onClick={(e) => e.stopPropagation()} className="min-w-0 hover:text-accent">{label}</Link> : label}
    </span>
  );
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

export function CountsCell({ attachments = 0, outputs = 0, comments }) {
  return (
    <span className="inline-flex items-center gap-3 text-xs text-fg-muted">
      <span className={cn("inline-flex items-center gap-1", attachments > 0 && "text-fg")}><Paperclip size={13} /> {attachments}</span>
      <span className={cn("inline-flex items-center gap-1", outputs > 0 && "text-fg")}><FileText size={13} /> {outputs}</span>
      {comments != null ? <span className={cn("inline-flex items-center gap-1", comments > 0 && "text-fg")}><MessageSquare size={13} /> {comments}</span> : null}
    </span>
  );
}

/** "client-x,infra" as small chips; `onPick(tag)` makes them filter buttons. */
export function TagChips({ tags, onPick, className, max = 6 }) {
  const list = String(tags ?? "").split(",").filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={cn("task-tags inline-flex flex-wrap items-center gap-1", className)}>
      {list.slice(0, max).map((t) =>
        onPick ? (
          <button key={t} type="button" onClick={(e) => { e.stopPropagation(); onPick(t); }} className="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-medium text-accent hover:bg-accent/20">#{t}</button>
        ) : (
          <span key={t} className="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-medium text-accent">#{t}</span>
        )
      )}
      {list.length > max ? <span className="text-[10px] text-fg-faint">+{list.length - max}</span> : null}
    </span>
  );
}
/**
 * Save a change to a task. Completing one sends the browser's date (a repeating task counts its next date from
 * "today" as the person sees it) and, when that made the next task of a series, says so and calls onNext.
 */
export async function putTask(id, patch, { toast, tr = (x) => x, onNext } = {}) {
  const saved = await api.put(`/api/tasks/${id}`, patch?.status === "done" ? { ...patch, today: todayIso() } : patch);
  if (saved?.next_task) {
    const when = saved.next_task.due_date ?? saved.next_task.start_date;
    toast?.success(tr("The next one is ready"), when ? tr("“{title}” is due {date}", { title: saved.next_task.title, date: formatDate(when) }) : saved.next_task.title);
    onNext?.(saved.next_task);
  }
  return saved;
}
/** A small repeat sign on tasks that make their successor when completed. */
export function RepeatMark({ task, className }) {
  const tr = useT();
  if (!task?.repeat_rule) return null;
  return <span className={cn("task-repeat-mark inline-flex items-center text-sky-500", className)} data-tip={tr(REPEAT_RULES[task.repeat_rule]?.label ?? "Repeats")}><Repeat size={11} /></span>;
}
/** A small lock while a task still waits for unfinished tasks. */
export function BlockedMark({ task, className }) {
  const tr = useT();
  if (!(Number(task?.blocked_by_open) > 0) || task.status === "done") return null;
  return <span className={cn("task-blocked-mark inline-flex items-center gap-0.5 text-amber-500", className)} data-tip={tr("Waiting for {n}", { n: task.blocked_by_open })}><Lock size={11} /></span>;
}
/** "3/5" with a tick once everything is done; nothing when the task has no checklist. */
export function ChecklistCount({ done = 0, total = 0, className }) {
  if (!total) return null;
  return <span className={cn("inline-flex items-center gap-0.5", Number(done) === Number(total) && "text-emerald-500", className)}><ListChecks size={12} />{done}/{total}</span>;
}

/** Small inline status/priority <select> that PUTs immediately. */
export function InlineSelect({ value, map, onChange, className }) {
  const tr = useT();
  const { canEdit } = useAccess();
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
      disabled={busy || !canEdit}
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
