"use client";
import { Play, Pause, RotateCcw, Coffee, Briefcase, Minus, Plus } from "lucide-react";
import { useUI, usePrefs } from "@/lib/store";
import Button from "@/components/ui/Button";
import { primeAudio } from "@/lib/audio";
import TimerAlertSettings from "./TimerSettings";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const FOCUS_PRESETS = [15, 25, 45, 60];
const BREAK_PRESETS = [3, 5, 10, 15];

export function timerTotalSeconds(mode, focusMin, breakMin) {
  return (mode === "work" ? focusMin : breakMin) * 60;
}

/** Pomodoro-style timer with user-configurable focus and cooldown lengths (persisted). */
export default function TimerTool() {
  const tr = useT();
  const timer = useUI((s) => s.timer);
  const setTimer = useUI((s) => s.setTimer);
  const focusMin = usePrefs((s) => s.timerFocusMin);
  const breakMin = usePrefs((s) => s.timerBreakMin);
  const setPrefs = usePrefs((s) => s.set);

  const total = timerTotalSeconds(timer.mode, focusMin, breakMin);
  const remaining = timer.remaining ?? total;
  const pct = 1 - remaining / total;

  // ticking + end-of-session alerts live in shell/TimerEngine so they run while this panel is closed
  const start = () => {
    primeAudio(); // user gesture: allows the chime to play later
    setTimer({ running: true, endsAt: Date.now() + remaining * 1000 });
  };
  const pause = () => setTimer({ running: false, endsAt: null });
  const reset = (mode = timer.mode) => setTimer({ running: false, endsAt: null, mode, remaining: null });

  /** Change a duration; if the timer is idle on that mode, restart from the new full length. */
  const setDuration = (key, minutes) => {
    const v = Math.max(1, Math.min(180, Math.round(minutes) || 1));
    setPrefs({ [key]: v });
    const affects = (key === "timerFocusMin" && timer.mode === "work") || (key === "timerBreakMin" && timer.mode === "break");
    if (affects && !timer.running) setTimer({ remaining: null });
  };

  const r = 54;
  const circ = 2 * Math.PI * r;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;

  return (
    <div className="flex flex-col items-center p-5">
      <div className="mb-3 flex gap-1 rounded-full bg-surface-2 p-0.5">
        {[
          { v: "work", label: tr("Focus"), icon: Briefcase },
          { v: "break", label: tr("Cooldown"), icon: Coffee },
        ].map((o) => (
          <button
            key={o.v}
            onClick={() => reset(o.v)}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition", timer.mode === o.v ? "bg-accent text-white" : "text-fg-muted")}
          >
            <o.icon size={12} /> {o.label}
          </button>
        ))}
      </div>
      <div className="relative grid place-items-center">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r={r} stroke="var(--surface-3)" strokeWidth="8" fill="none" />
          <circle
            cx="70" cy="70" r={r}
            stroke="var(--accent)" strokeWidth="8" fill="none" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <span className="absolute font-mono text-3xl font-semibold tabular-nums">
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {timer.running ? (
          <Button icon={Pause} onClick={pause} variant="secondary">{tr("Pause")}</Button>
        ) : (
          <Button icon={Play} onClick={start}>{remaining === total ? "Start" : "Resume"}</Button>
        )}
        <Button variant="ghost" size="icon" icon={RotateCcw} onClick={() => reset()} aria-label={tr("Reset")} />
      </div>

      <div className="mt-5 w-full space-y-3 border-t border-line pt-4">
        <DurationRow label={tr("Focus length")} icon={Briefcase} value={focusMin} presets={FOCUS_PRESETS} onChange={(v) => setDuration("timerFocusMin", v)} />
        <DurationRow label={tr("Cooldown length")} icon={Coffee} value={breakMin} presets={BREAK_PRESETS} onChange={(v) => setDuration("timerBreakMin", v)} />
      </div>
      <div className="mt-4 w-full border-t border-line pt-4">
        <TimerAlertSettings />
      </div>
      <p className="mt-3 text-center text-[11px] text-fg-muted">{tr("Settings are saved. The timer keeps running while the panel is closed.")}</p>
    </div>
  );
}

function DurationRow({ label, icon: Icon, value, presets, onChange }) {
  const tr = useT();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-fg-muted"><Icon size={12} /> {label}</span>
        <span className="flex items-center gap-1">
          <button onClick={() => onChange(value - 1)} className="grid h-6 w-6 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label="Decrease"><Minus size={11} /></button>
          <input
            type="number"
            min={1}
            max={180}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="control h-6 w-14 px-1 text-center text-xs tabular-nums"
            aria-label={`${label} in minutes`}
          />
          <span className="text-[11px] text-fg-faint">{tr("min")}</span>
          <button onClick={() => onChange(value + 1)} className="grid h-6 w-6 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label="Increase"><Plus size={11} /></button>
        </span>
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn("flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition", value === p ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:bg-surface-2")}
          >
            {p}m
          </button>
        ))}
      </div>
    </div>
  );
}
