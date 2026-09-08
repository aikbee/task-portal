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

/** Shared timer logic: state, derived values and the actions both views use. */
export function useTimerControls() {
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

  return { timer, focusMin, breakMin, total, remaining, pct, start, pause, reset, setDuration };
}

const fmt2 = (n) => String(n).padStart(2, "0");

/** Focus / cooldown switch. */
export function ModeSwitch({ mode, onChange, size = "sm" }) {
  const tr = useT();
  return (
    <div className="flex gap-1 rounded-full bg-surface-2 p-0.5">
      {[
        { v: "work", label: tr("Focus"), icon: Briefcase },
        { v: "break", label: tr("Cooldown"), icon: Coffee },
      ].map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn("flex items-center gap-1.5 rounded-full font-medium transition", size === "lg" ? "px-4 py-1.5 text-sm" : "px-3 py-1 text-xs", mode === o.v ? "bg-accent text-white" : "text-fg-muted")}
        >
          <o.icon size={size === "lg" ? 14 : 12} /> {o.label}
        </button>
      ))}
    </div>
  );
}

/** Progress ring with the remaining time in the middle. */
export function TimerRing({ size = 140, stroke = 8, remaining, pct, textClass = "text-3xl" }) {
  const r = size / 2 - stroke - 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="var(--accent)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className={cn("absolute font-mono font-semibold tabular-nums", textClass)}>
        {fmt2(Math.floor(remaining / 60))}:{fmt2(remaining % 60)}
      </span>
    </div>
  );
}

/** Start / pause / reset. */
export function TimerButtons({ running, atStart, onStart, onPause, onReset, size = "md" }) {
  const tr = useT();
  return (
    <div className="flex items-center gap-2">
      {running ? (
        <Button size={size} icon={Pause} onClick={onPause} variant="secondary">{tr("Pause")}</Button>
      ) : (
        <Button size={size} icon={Play} onClick={onStart}>{atStart ? tr("Start") : tr("Resume")}</Button>
      )}
      <Button variant="ghost" size={size === "lg" ? "md" : "icon"} icon={RotateCcw} onClick={onReset} aria-label={tr("Reset")}>{size === "lg" ? tr("Reset") : null}</Button>
    </div>
  );
}

/** Pomodoro-style timer with user-configurable focus and cooldown lengths (persisted): the compact panel. */
export default function TimerTool() {
  const tr = useT();
  const { timer, focusMin, breakMin, total, remaining, pct, start, pause, reset, setDuration } = useTimerControls();

  return (
    <div className="flex flex-col items-center p-5">
      <div className="mb-3"><ModeSwitch mode={timer.mode} onChange={(v) => reset(v)} /></div>
      <TimerRing remaining={remaining} pct={pct} />
      <div className="mt-4"><TimerButtons running={timer.running} atStart={remaining === total} onStart={start} onPause={pause} onReset={() => reset()} /></div>

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

/** Full-screen timer: a big clock in the middle, durations and alert settings in the sidebar. */
export function TimerWorkspace() {
  const tr = useT();
  const { timer, focusMin, breakMin, total, remaining, pct, start, pause, reset, setDuration } = useTimerControls();
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="order-2 w-full shrink-0 space-y-4 overflow-y-auto border-t border-line bg-surface/60 p-4 md:order-1 md:w-80 md:border-r md:border-t-0">
        <DurationRow label={tr("Focus length")} icon={Briefcase} value={focusMin} presets={FOCUS_PRESETS} onChange={(v) => setDuration("timerFocusMin", v)} />
        <DurationRow label={tr("Cooldown length")} icon={Coffee} value={breakMin} presets={BREAK_PRESETS} onChange={(v) => setDuration("timerBreakMin", v)} />
        <div className="border-t border-line pt-4"><TimerAlertSettings /></div>
        <p className="text-[11px] text-fg-muted">{tr("Settings are saved. The timer keeps running while the panel is closed.")}</p>
      </aside>
      <section className="order-1 flex min-h-0 flex-1 flex-col items-center justify-center gap-8 p-6 md:order-2">
        <ModeSwitch mode={timer.mode} onChange={(v) => reset(v)} size="lg" />
        <TimerRing size={300} stroke={14} remaining={remaining} pct={pct} textClass="text-6xl sm:text-7xl" />
        <TimerButtons running={timer.running} atStart={remaining === total} onStart={start} onPause={pause} onReset={() => reset()} size="lg" />
      </section>
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
