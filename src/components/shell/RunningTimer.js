"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatClock, formatMinutes } from "@/lib/duration";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** Bottom-bar chip while one of my task timers runs: the elapsed time, the task (click to open it) and Stop. */
export default function RunningTimer() {
  const tr = useT();
  const toast = useToast();
  const { user, switchProfile } = useAuth();
  const [run, setRun] = useState(null); // { id, task_id, task_title, profile_id, elapsed_seconds, at }
  const [, setTick] = useState(0);

  // only the newest answer counts: a lookup that was already under way must not bring a stopped timer back
  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    api.get("/api/time/running").then((r) => { if (mine === seq.current) setRun(r?.running ? { ...r.running, at: Date.now() } : null); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("time:changed", load);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener("time:changed", load); window.removeEventListener("focus", load); };
  }, [load]);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run]);

  if (!run) return null;
  // eslint-disable-next-line react-hooks/purity -- a clock has to read the time
  const seconds = Number(run.elapsed_seconds) + Math.floor((Date.now() - run.at) / 1000);
  const open = () => {
    const href = `/tasks/${run.task_id}`;
    if (run.profile_id !== user?.profile_id) return switchProfile(run.profile_id, href);
    window.location.assign(new URL(href, window.location.origin).toString());
  };
  const stop = async () => {
    try {
      const res = await api.post("/api/time/stop", {});
      seq.current++;
      setRun(null);
      window.dispatchEvent(new Event("time:changed"));
      if (res.stopped) toast.success(tr("Timer stopped"), `${res.stopped.task_title} · ${formatMinutes(res.stopped.minutes)}`);
    } catch (e) {
      toast.error(tr("Could not stop the timer"), e.message);
    }
  };
  return (
    <span className="running-timer flex items-center gap-1.5 rounded-full bg-rose-500/12 py-0.5 pl-2 pr-0.5 text-rose-600 dark:text-rose-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
      <button type="button" onClick={open} className="flex min-w-0 items-center gap-1.5 hover:underline" data-tip={run.task_title}>
        <span className="tabular-nums">{formatClock(seconds)}</span>
        <span className="hidden max-w-[10rem] truncate xl:inline">{run.task_title}</span>
      </button>
      <button type="button" onClick={stop} className="running-timer-stop grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-600" aria-label={tr("Stop the timer")} data-tip={tr("Stop the timer")}><Square size={9} fill="currentColor" /></button>
    </span>
  );
}
