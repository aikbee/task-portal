"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Database, Rows3, LayoutGrid, X, Lock, Maximize2 } from "lucide-react";
import { useUI, usePrefs } from "@/lib/store";
import { api } from "@/lib/api";
import { moduleFromPath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { timerTotalSeconds } from "./tools/TimerTool";
import { TOOLS, useToolExpanded } from "./ToolWorkspace";
import { useT } from "@/lib/i18n";


export default function BottomBar() {
  const tr = useT();
  const pathname = usePathname();
  const mounted = useMounted();
  const mod = moduleFromPath(pathname);
  const activeTool = useUI((s) => s.activeTool);
  const toggleTool = useUI((s) => s.toggleTool);
  const closeTool = useUI((s) => s.closeTool);
  const notes = useUI((s) => s.notes);
  const setNotes = useUI((s) => s.setNotes);
  const timer = useUI((s) => s.timer);
  const density = usePrefs((s) => s.density);
  const timerFocusMin = usePrefs((s) => s.timerFocusMin);
  const timerBreakMin = usePrefs((s) => s.timerBreakMin);
  const setPrefs = usePrefs((s) => s.set);
  const showBottomBar = usePrefs((s) => s.showBottomBar);
  const canLock = usePrefs((s) => Boolean(s.pinHash) && s.lockEnabled);
  const autoLockMinutes = usePrefs((s) => s.autoLockMinutes);
  const lock = usePrefs((s) => s.lock);
  const expanded = useToolExpanded();

  const [health, setHealth] = useState(null);
  const [now, setNow] = useState(null);
  const panelRef = useRef(null);

  // load notes once (count badge), poll DB health, tick clock
  useEffect(() => {
    api.get("/api/notes").then(setNotes).catch(() => setNotes([]));
  }, [setNotes]);
  useEffect(() => {
    const ping = () => api.get("/api/health").then(setHealth).catch((e) => setHealth({ status: "error", error: e.message }));
    ping();
    const t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  const moduleNotes = (notes ?? []).filter((n) => n.module === mod.key).length;
  const tool = TOOLS.find((t) => t.key === activeTool);

  if (mounted && !showBottomBar) return null;

  const scrollTop = () => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  const timerLabel = timer.running || timer.remaining != null ? fmt(timer.remaining ?? timerTotalSeconds(timer.mode, timerFocusMin, timerBreakMin)) : null;

  return (
    <footer className="relative z-30 flex h-[var(--bottombar-h)] shrink-0 items-center gap-1.5 glass border-t px-2 text-xs sm:gap-2 sm:px-3">
      {/* tool panel */}
      {tool && !expanded ? (
        <div
          ref={panelRef}
          className={cn(
            "absolute bottom-[calc(100%+10px)] left-1/2 max-w-[calc(100vw-var(--sidebar-w)-40px)] -translate-x-1/2 overflow-hidden rounded-app-lg border border-line bg-surface shadow-app-lg anim-slide-up max-md:left-3 max-md:right-3 max-md:w-auto max-md:max-w-none max-md:translate-x-0",
            tool.width
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <tool.icon size={15} className="text-accent" /> {tool.label}
              {tool.key === "notes" ? <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">{tr(mod.label)}</span> : null}
            </span>
            <span className="flex items-center gap-0.5">
              <button onClick={() => setPrefs({ toolExpanded: true })} className="rounded-app-sm p-1 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={tr("Expand")} data-tip={tr("Expand")}>
                <Maximize2 size={14} />
              </button>
              <button onClick={closeTool} className="rounded-app-sm p-1 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={tr("Close")}>
                <X size={14} />
              </button>
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <tool.Component key={mod.key} module={mod} />
          </div>
        </div>
      ) : null}

      {/* left: status */}
      <div className="flex items-center gap-3 text-fg-muted">
        <span className="flex items-center gap-1.5" data-tip={health?.error || (health ? `MySQL ${health.version} · ${health.latencyMs} ms` : "Checking…")}>
          <span className={cn("h-2 w-2 rounded-full pulse-dot", health?.status === "ok" ? "bg-emerald-500 text-emerald-500" : health ? "bg-rose-500 text-rose-500" : "bg-amber-400 text-amber-400")} />
          <Database size={12} />
          <span className="hidden sm:inline">{health?.status === "ok" ? health.database : health ? "DB offline" : "…"}</span>
        </span>
        <span className="hidden tabular-nums md:inline">{now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</span>
        <span className="hidden lg:inline">{now ? now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}</span>
      </div>

      {/* center: tools */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
        {TOOLS.map((t) => {
          const active = activeTool === t.key;
          const badge = t.key === "notes" ? moduleNotes : t.key === "timer" ? timerLabel : null;
          return (
            <button
              key={t.key}
              onClick={() => toggleTool(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-app-sm px-2.5 py-1.5 font-medium transition",
                active ? "bg-accent text-white shadow-[0_6px_14px_-6px_var(--accent)]" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
              data-tip={t.hint ? `${t.label} ${t.hint}` : t.label}
            >
              <t.icon size={14} />
              <span className="hidden sm:inline">{tr(t.label)}</span>
              {badge ? (
                <span className={cn("rounded-full px-1.5 py-px text-[10px] tabular-nums", active ? "bg-white/25" : "bg-surface-3 text-fg-muted", t.key === "timer" && timer.running && !active && "bg-accent/15 text-accent")}>
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* right: utilities */}
      <div className="flex items-center gap-1 text-fg-muted">
        <span className="mr-1 hidden items-center gap-1.5 lg:flex">
          <span className="h-2 w-2 rounded-full" style={{ background: mod.color }} />
          {tr(mod.label)}
        </span>
        <button
          onClick={() => setPrefs({ density: density === "compact" ? "comfortable" : "compact" })}
          className="hidden rounded-app-sm p-1.5 hover:bg-surface-2 hover:text-fg sm:inline-flex"
          data-tip={`Density: ${density}`}
        >
          {density === "compact" ? <Rows3 size={14} /> : <LayoutGrid size={14} />}
        </button>
        <button onClick={scrollTop} className="rounded-app-sm p-1.5 hover:bg-surface-2 hover:text-fg" data-tip={tr("Back to top")}>
          <ArrowUp size={14} />
        </button>
        {canLock ? (
          <button onClick={lock} className="rounded-app-sm p-1.5 hover:bg-surface-2 hover:text-fg" data-tip={`Lock screen ⌘⇧L${autoLockMinutes ? ` · auto-lock ${autoLockMinutes}m` : ""}`} aria-label={tr("Lock screen")}>
            <Lock size={14} />
          </button>
        ) : null}
        <span className="ml-1 hidden font-mono text-[10px] text-fg-faint sm:inline">v0.1.0</span>
      </div>
    </footer>
  );
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
