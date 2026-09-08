"use client";
import { Equal, Trash2, Delete } from "lucide-react";
import { Input } from "@/components/ui/Controls";
import Button from "@/components/ui/Button";
import { useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Tiny expression calculator (numbers, + - * / % ^ and parentheses). */
function evaluate(expr) {
  const cleaned = expr.replace(/\s+/g, "").replace(/\^/g, "**").replace(/×/g, "*").replace(/÷/g, "/");
  if (!cleaned) return null;
  if (!/^[0-9+\-*/().%e]+$/i.test(cleaned)) throw new Error("Only numbers and + - * / % ^ ( ) are allowed");
  const v = Function(`"use strict"; return (${cleaned});`)();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Invalid expression");
  return v;
}

const KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "%", "^", "C", "+"];

/** State lives in the UI store so the popover and the workspace show the same expression and history. */
export function useCalc() {
  const calc = useUI((s) => s.calc);
  const setCalc = useUI((s) => s.setCalc);
  const setExpr = (v) => setCalc((c) => ({ expr: typeof v === "function" ? v(c.expr) : v, error: null }));
  // computed inside the updater so it always sees the latest expression, even right after a keypad tap
  const run = () =>
    setCalc((c) => {
      try {
        const v = evaluate(c.expr);
        if (v === null) return c;
        const out = Number(v.toPrecision(12)).toString();
        return { history: [{ expr: c.expr, out }, ...c.history].slice(0, 50), expr: out, error: null };
      } catch (e) {
        return { error: e.message };
      }
    });
  const press = (k) => (k === "C" ? setExpr("") : setExpr((e) => e + k));
  const backspace = () => setExpr((e) => e.slice(0, -1));
  const clearHistory = () => setCalc({ history: [] });
  return { expr: calc.expr, error: calc.error ?? null, history: calc.history, setExpr, run, press, backspace, clearHistory };
}

function Keypad({ press, large }) {
  return (
    <div className={cn("grid grid-cols-4", large ? "gap-2" : "gap-1.5")}>
      {KEYS.map((k) => (
        <button key={k} onClick={() => press(k)} className={cn("rounded-app-sm border border-line bg-surface-2 font-mono hover:bg-surface-3", large ? "h-14 text-lg" : "h-9 text-sm", k === "C" && "text-rose-500")}>
          {k}
        </button>
      ))}
    </div>
  );
}

function HistoryList({ history, onPick, onClear, className }) {
  const tr = useT();
  if (!history.length) return <p className={cn("text-xs text-fg-faint", className)}>{tr("No calculations yet")}</p>;
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-faint">
        {tr("History")}
        <button onClick={onClear} className="flex items-center gap-1 hover:text-fg"><Trash2 size={10} />{tr("clear")}</button>
      </div>
      <ul className="space-y-1 font-mono text-xs">
        {history.map((h, i) => (
          <li key={i} className="flex justify-between gap-2 text-fg-muted">
            <button onClick={() => onPick(h.expr)} className="truncate hover:text-fg">{h.expr}</button>
            <span className="shrink-0 font-semibold text-fg">= {h.out}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact popover calculator. */
export default function CalcTool() {
  const { expr, error, history, setExpr, run, press, clearHistory } = useCalc();
  return (
    <div className="p-4">
      <div className="flex gap-2">
        <Input autoFocus value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="(1200 * 1.08) / 3" className="font-mono" />
        <Button icon={Equal} onClick={run} aria-label="Evaluate" size="icon" />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
      <div className="mt-3"><Keypad press={press} /></div>
      {history.length ? <HistoryList history={history.slice(0, 8)} onPick={setExpr} onClear={clearHistory} className="mt-3 border-t border-line pt-2" /> : null}
    </div>
  );
}

/** Full-screen calculator: history in the sidebar, a large display and keypad in the middle. */
export function CalcWorkspace() {
  const tr = useT();
  const { expr, error, history, setExpr, run, press, backspace, clearHistory } = useCalc();
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="order-2 w-full shrink-0 overflow-y-auto border-t border-line bg-surface/60 p-4 md:order-1 md:w-80 md:border-r md:border-t-0">
        <HistoryList history={history} onPick={setExpr} onClear={clearHistory} />
      </aside>
      <section className="order-1 flex min-h-0 flex-1 flex-col items-center justify-center p-6 md:order-2">
        <div className="w-full max-w-md space-y-3">
          <div className="rounded-app border border-line bg-surface-2/60 p-4 text-right">
            <input
              autoFocus
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="0"
              className="w-full bg-transparent text-right font-mono text-3xl tabular-nums outline-none placeholder:text-fg-faint"
              aria-label={tr("Calculator")}
            />
            {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
          </div>
          <Keypad press={press} large />
          <div className="flex gap-2">
            <Button variant="secondary" icon={Delete} onClick={backspace} className="flex-1">{tr("Backspace")}</Button>
            <Button icon={Equal} onClick={run} className="flex-1">=</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
