"use client";
import { useState } from "react";
import { Equal, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Controls";
import Button from "@/components/ui/Button";
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

export default function CalcTool() {
  const tr = useT();
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const run = () => {
    try {
      const v = evaluate(expr);
      if (v === null) return;
      const out = Number(v.toPrecision(12)).toString();
      setHistory((h) => [{ expr, out }, ...h].slice(0, 8));
      setExpr(out);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="p-4">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={expr}
          onChange={(e) => { setExpr(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="(1200 * 1.08) / 3"
          className="font-mono"
        />
        <Button icon={Equal} onClick={run} aria-label="Evaluate" size="icon" />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "%", "^", "C", "+"].map((k) => (
          <button
            key={k}
            onClick={() => (k === "C" ? setExpr("") : setExpr((e) => e + k))}
            className="h-9 rounded-app-sm border border-line bg-surface-2 font-mono text-sm hover:bg-surface-3"
          >
            {k}
          </button>
        ))}
      </div>
      {history.length ? (
        <div className="mt-3 border-t border-line pt-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-faint">
            {tr("History")}
            <button onClick={() => setHistory([])} className="flex items-center gap-1 hover:text-fg"><Trash2 size={10} />{tr("clear")}</button>
          </div>
          <ul className="space-y-1 font-mono text-xs">
            {history.map((h, i) => (
              <li key={i} className="flex justify-between gap-2 text-fg-muted">
                <button onClick={() => setExpr(h.expr)} className="truncate hover:text-fg">{h.expr}</button>
                <span className="shrink-0 font-semibold text-fg">= {h.out}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
