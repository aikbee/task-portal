"use client";
import { useEffect, useState } from "react";
import { Timer, Play, Square, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import { todayIso } from "@/lib/dates";
import { parseDuration, formatMinutes, formatClock } from "@/lib/duration";
import { cn, formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** Tell the bottom-bar chip (and any other open card) that a timer started or stopped. */
export const announceTimeChange = () => window.dispatchEvent(new Event("time:changed"));

/** Time spent on a task: a start/stop timer, manual entries ("1h 30m", "45m", "1.5"), and the total against the estimate. */
export default function TaskTime({ taskId, estimateHours, onTotal }) {
  const tr = useT();
  const toast = useToast();
  const { canEdit } = useAccess();
  const { data, setData, refetch } = useFetch(`/api/tasks/${taskId}/time`);
  const [duration, setDuration] = useState("");
  const [day, setDay] = useState(() => todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, duration, spent_on, note }
  const [tick, setTick] = useState(0);
  const running = data?.running ?? null;

  useEffect(() => {
    const on = () => refetch();
    window.addEventListener("time:changed", on);
    return () => window.removeEventListener("time:changed", on);
  }, [refetch]);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setTick(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(t); setTick(0); };
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next) => {
    setData(next);
    onTotal?.(next.total_minutes);
  };
  const act = async (fn, failTitle) => {
    setBusy(true);
    try {
      apply(await fn());
      announceTimeChange();
      return true;
    } catch (e) {
      toast.error(tr(failTitle), e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const start = () => act(async () => {
    const res = await api.post(`/api/tasks/${taskId}/time`, { start: true, spent_on: todayIso() });
    if (res.stopped) toast.info?.(tr("The timer on “{name}” was stopped", { name: res.stopped.task_title }), formatMinutes(res.stopped.minutes));
    return res;
  }, "Could not start the timer");
  const stop = () => act(async () => { await api.post("/api/time/stop", {}); return api.get(`/api/tasks/${taskId}/time`); }, "Could not stop the timer");
  const add = async (e) => {
    e?.preventDefault();
    if (parseDuration(duration) == null) return toast.error(tr("Could not log the time"), tr('Enter the time spent, like "1h 30m", "45m" or "1.5".'));
    if (await act(() => api.post(`/api/tasks/${taskId}/time`, { duration, spent_on: day, note }), "Could not log the time")) { setDuration(""); setNote(""); }
  };
  const saveEdit = async () => {
    if (await act(() => api.put(`/api/tasks/${taskId}/time/${editing.id}`, { duration: editing.duration, spent_on: editing.spent_on, note: editing.note }), "Could not save the entry")) setEditing(null);
  };
  const remove = (entry) => act(() => api.del(`/api/tasks/${taskId}/time/${entry.id}`), "Could not delete the entry");

  if (!data) return null;
  const total = data.total_minutes + (running ? Math.floor((Number(running.elapsed_seconds) + tick) / 60) : 0);
  const estimate = estimateHours != null ? Math.round(Number(estimateHours) * 60) : null;
  const over = estimate != null && total > estimate;
  if (!canEdit && !data.entries.length) return null;

  return (
    <Card className="task-time space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><Timer size={13} /> {tr("Time")}</p>
      <div>
        <p className="flex items-baseline gap-2">
          <span className={cn("time-total text-2xl font-semibold tabular-nums tracking-tight", over && "text-rose-500")}>{formatMinutes(total)}</span>
          {estimate != null ? <span className="text-xs text-fg-muted">{tr("of {t} estimated", { t: formatMinutes(estimate) })}</span> : <span className="text-xs text-fg-muted">{tr("logged")}</span>}
        </p>
        {estimate ? <ProgressBar value={Math.min(100, Math.round((total / estimate) * 100))} color={over ? "#f43f5e" : undefined} className="mt-2" /> : null}
        {over ? <p className="mt-1 text-[11px] text-rose-500">{tr("{t} over the estimate", { t: formatMinutes(total - estimate) })}</p> : null}
      </div>

      {canEdit ? (
        running ? (
          <Button variant="danger" icon={Square} onClick={stop} loading={busy} className="time-stop w-full">{tr("Stop")} · <span className="tabular-nums">{formatClock(Number(running.elapsed_seconds) + tick)}</span></Button>
        ) : (
          <Button variant="subtle" icon={Play} onClick={start} loading={busy} className="time-start w-full">{tr("Start timer")}</Button>
        )
      ) : null}

      {canEdit ? (
        <form onSubmit={add} className="time-add grid grid-cols-[1fr_auto] gap-1.5">
          <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={tr("1h 30m")} aria-label={tr("Time spent")} className="control time-duration h-8 text-xs" />
          <input type="date" value={day} max={todayIso()} onChange={(e) => setDay(e.target.value)} aria-label={tr("Date")} className="control h-8 w-[8.5rem] text-xs" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("What was done (optional)")} maxLength={255} className="control h-8 text-xs" />
          <Button type="submit" size="sm" icon={Plus} loading={busy} disabled={!duration.trim()}>{tr("Log")}</Button>
        </form>
      ) : null}

      {data.entries.filter((e) => !e.running).length ? (
        <ul className="time-entries max-h-64 space-y-1 overflow-auto">
          {data.entries.filter((e) => !e.running).map((e) =>
            editing?.id === e.id ? (
              <li key={e.id} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-app-sm border border-accent/40 p-1.5">
                <input value={editing.duration} onChange={(ev) => setEditing((x) => ({ ...x, duration: ev.target.value }))} className="control h-7 text-xs" aria-label={tr("Time spent")} />
                <input type="date" value={editing.spent_on} onChange={(ev) => setEditing((x) => ({ ...x, spent_on: ev.target.value }))} className="control h-7 w-[8.5rem] text-xs" aria-label={tr("Date")} />
                <input value={editing.note} onChange={(ev) => setEditing((x) => ({ ...x, note: ev.target.value }))} className="control h-7 text-xs" placeholder={tr("What was done (optional)")} />
                <span className="flex justify-end gap-1"><Button size="iconXs" variant="ghost" icon={X} onClick={() => setEditing(null)} aria-label={tr("Cancel")} /><Button size="iconXs" icon={Check} onClick={saveEdit} loading={busy} aria-label={tr("Save")} /></span>
              </li>
            ) : (
              <li key={e.id} className="time-entry group flex items-start gap-2 rounded-app-sm px-1.5 py-1 text-xs hover:bg-surface-2/70">
                <span className="w-14 shrink-0 font-semibold tabular-nums">{formatMinutes(e.minutes)}</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-fg-muted">{e.user_name} · {formatDate(e.spent_on)}</span>
                  {e.note ? <span className="block truncate">{e.note}</span> : null}
                </span>
                {canEdit && e.mine ? <Button size="iconXs" variant="ghost" icon={Pencil} onClick={() => setEditing({ id: e.id, duration: formatMinutes(e.minutes), spent_on: e.spent_on, note: e.note ?? "" })} aria-label={tr("Edit entry")} className="opacity-0 group-hover:opacity-100 max-md:opacity-100" /> : null}
                {canEdit ? <Button size="iconXs" variant="dangerGhost" icon={Trash2} onClick={() => remove(e)} aria-label={tr("Delete entry")} className="opacity-0 group-hover:opacity-100 max-md:opacity-100" /> : null}
              </li>
            )
          )}
        </ul>
      ) : null}
    </Card>
  );
}
