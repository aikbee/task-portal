"use client";
import { useState } from "react";
import Link from "next/link";
import { Lock, LockOpen, Link2, X, Search, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch, useDebouncedValue } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import { useNav } from "@/lib/nav";
import { TASK_STATUS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** What this task waits for and what waits for it. Adding a dependency that would close a loop is refused by the server. */
export default function TaskDependencies({ taskId, onChange }) {
  const tr = useT();
  const nav = useNav();
  const toast = useToast();
  const { canEdit } = useAccess();
  const { data, setData } = useFetch(`/api/tasks/${taskId}/dependencies`);
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q.trim(), 250);
  const found = useFetch(dq ? `/api/tasks?q=${encodeURIComponent(dq)}` : null);
  const blockedBy = data?.blocked_by ?? [];
  const blocking = data?.blocking ?? [];
  const taken = new Set([taskId, ...blockedBy.map((t) => t.id)]);
  const options = dq ? (found.data ?? []).filter((t) => !taken.has(t.id)).slice(0, 8) : [];

  const apply = (next) => {
    setData(next);
    onChange?.(next);
  };
  const add = async (t) => {
    try {
      apply(await api.post(`/api/tasks/${taskId}/dependencies`, { depends_on_id: t.id }));
      setQ("");
    } catch (e) {
      toast.error(tr("Could not add the dependency"), e.message);
    }
  };
  const remove = async (t) => {
    try {
      apply(await api.del(`/api/tasks/${taskId}/dependencies/${t.id}`));
    } catch (e) {
      toast.error(tr("Could not remove the dependency"), e.message);
    }
  };
  if (!data) return null;
  if (!canEdit && !blockedBy.length && !blocking.length) return null;

  const item = (t, removable) => (
    <li key={t.id} className="dep-item flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", t.status === "done" ? "bg-emerald-500" : "bg-amber-500")} />
      <Link href={nav.href(`/tasks/${t.id}`)} className="min-w-0 flex-1 leading-tight hover:text-accent">
        <span className={cn("block truncate text-sm font-medium", t.status === "done" && "text-fg-muted line-through")}>{t.title}</span>
        <span className="block truncate text-[11px] text-fg-muted">{[t.project_code, t.assignee_name, t.due_date ? formatDate(t.due_date) : null].filter(Boolean).join(" · ") || tr(TASK_STATUS[t.status]?.label ?? t.status)}</span>
      </Link>
      <StatusBadge map={TASK_STATUS} value={t.status} dot={false} />
      {removable && canEdit ? <Button variant="ghost" size="iconXs" icon={X} onClick={() => remove(t)} aria-label={tr("Remove dependency")} data-tip={tr("Remove")} /> : null}
    </li>
  );

  return (
    <Card className="task-deps space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {data.open ? <Lock size={13} className="text-amber-500" /> : <LockOpen size={13} />} {tr("Dependencies")}
        {data.open ? <span className="dep-blocked rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-amber-600">{tr("Waiting for {n}", { n: data.open })}</span> : null}
      </p>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Waits for")}</p>
        {blockedBy.length ? <ul className="space-y-1.5">{blockedBy.map((t) => item(t, true))}</ul> : <p className="text-xs text-fg-muted">{tr("Nothing. This task can start any time.")}</p>}
        {canEdit ? (
          <div className="relative mt-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Find a task this one waits for…")} className="dep-search control h-8 pl-8 text-xs" />
            {dq ? (
              <ul className="dep-options absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-app-sm border border-line bg-surface p-1 shadow-app-lg">
                {found.loading ? <li className="px-2 py-1.5 text-xs text-fg-muted">{tr("Searching…")}</li> : null}
                {!found.loading && !options.length ? <li className="px-2 py-1.5 text-xs text-fg-muted">{tr("No matching task")}</li> : null}
                {options.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => add(t)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2">
                      <Link2 size={12} className="shrink-0 text-fg-faint" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="shrink-0 text-fg-faint">{t.project_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {blocking.length ? (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint"><ArrowRight size={11} /> {tr("Needed by")}</p>
          <ul className="space-y-1.5">{blocking.map((t) => item(t, false))}</ul>
        </div>
      ) : null}
    </Card>
  );
}
