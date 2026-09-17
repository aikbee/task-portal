"use client";
import { useState } from "react";
import { ListChecks, Plus, Trash2, Check, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** Subtasks of a task: tick off, rename in place, reorder, delete; paste a list to add many at once. */
export default function TaskChecklist({ taskId, items = [], onChange }) {
  const tr = useT();
  const toast = useToast();
  const { canEdit } = useAccess();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(null); // the row whose grip is held: only then is it draggable, so text stays selectable
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { id, before }
  const done = items.filter((i) => i.done).length;
  const base = `/api/tasks/${taskId}/checklist`;

  const run = async (fn, optimistic) => {
    const before = items;
    if (optimistic) onChange(optimistic);
    try {
      onChange(await fn());
    } catch (e) {
      onChange(before);
      toast.error(tr("Could not update the checklist"), e.message);
    }
  };
  const add = async (text) => {
    const value = (text ?? title).trim();
    if (!value || adding) return;
    setAdding(true);
    await run(() => api.post(base, { title: value }));
    setTitle("");
    setAdding(false);
  };
  const toggle = (it) => run(() => api.put(`${base}/${it.id}`, { done: !it.done }), items.map((x) => (x.id === it.id ? { ...x, done: it.done ? 0 : 1 } : x)));
  const rename = (it, next) => {
    const value = next.trim();
    if (!value || value === it.title) return;
    run(() => api.put(`${base}/${it.id}`, { title: value }), items.map((x) => (x.id === it.id ? { ...x, title: value } : x)));
  };
  const remove = (it) => run(() => api.del(`${base}/${it.id}`), items.filter((x) => x.id !== it.id));
  const drop = (targetId) => {
    if (dragId == null || dragId === targetId) return;
    const ids = items.map((x) => x.id).filter((id) => id !== dragId);
    const at = ids.indexOf(targetId) + (over?.before ? 0 : 1);
    ids.splice(at, 0, dragId);
    setDragId(null);
    setOver(null);
    setArmed(null);
    reorder(ids);
  };
  const reorder = (ids) => run(() => api.put(base, { order: ids }), ids.map((id) => items.find((x) => x.id === id)).filter(Boolean));

  if (!items.length && !canEdit) return null;
  return (
    <Card className="task-checklist">
      <CardHeader icon={ListChecks} title={tr("Checklist")} description={items.length ? tr("{done} of {total} done", { done, total: items.length }) : tr("Break the task into steps. Paste a list to add several at once.")} />
      {items.length ? <ProgressBar value={Math.round((done / items.length) * 100)} className="mb-3" /> : null}
      {items.length ? (
        <ul className="checklist-list -mx-1.5">
          {items.map((it) => (
            <li
              key={it.id}
              draggable={canEdit && armed === it.id}
              onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(it.id)); } catch {} }}
              onDragOver={(e) => { if (dragId == null || dragId === it.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: it.id, before: e.clientY < r.top + r.height / 2 }); }}
              onDrop={(e) => { e.preventDefault(); drop(it.id); }}
              onDragEnd={() => { setDragId(null); setOver(null); setArmed(null); }}
              className={cn(
                "checklist-item group flex items-center gap-2 rounded-app-sm px-1.5 py-1 transition hover:bg-surface-2/70",
                dragId === it.id && "opacity-40",
                over?.id === it.id && (over.before ? "shadow-[0_-2px_0_0_var(--accent)]" : "shadow-[0_2px_0_0_var(--accent)]")
              )}
            >
              {canEdit ? (
                <span onMouseDown={() => setArmed(it.id)} onMouseUp={() => setArmed(null)} onTouchStart={() => setArmed(it.id)} className="cursor-grab text-fg-faint opacity-0 transition group-hover:opacity-100 active:cursor-grabbing max-md:opacity-60" aria-hidden>
                  <GripVertical size={14} />
                </span>
              ) : null}
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(it.done)}
                aria-label={it.title}
                disabled={!canEdit}
                onClick={() => toggle(it)}
                className={cn("checklist-box grid h-5 w-5 shrink-0 place-items-center rounded-md border transition", it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong bg-surface hover:border-accent", !canEdit && "cursor-default opacity-70")}
              >
                {it.done ? <Check size={13} strokeWidth={3} /> : null}
              </button>
              <input
                defaultValue={it.title}
                key={`${it.id}:${it.title}`}
                readOnly={!canEdit}
                onBlur={(e) => rename(it, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = it.title; e.currentTarget.blur(); } }}
                className={cn("min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none", it.done && "text-fg-muted line-through")}
              />
              {it.done && it.done_by_name ? <span className="hidden shrink-0 text-[11px] text-fg-faint sm:inline">{it.done_by_name}</span> : null}
              {canEdit ? <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={() => remove(it)} aria-label={tr("Delete")} data-tip={tr("Delete")} className="opacity-0 transition focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <form className="checklist-add mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/\n/.test(text.trim())) { e.preventDefault(); add(text); } }}
            placeholder={tr("Add a step…")}
            maxLength={300}
            className="control h-9 flex-1 text-sm"
          />
          <Button type="submit" size="sm" icon={Plus} loading={adding} disabled={!title.trim()}>{tr("Add")}</Button>
        </form>
      ) : null}
    </Card>
  );
}
