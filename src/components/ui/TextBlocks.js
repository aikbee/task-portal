"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { splitBlocks } from "@/lib/text-tables";

/** Read-only table. */
export function SimpleTable({ table, className }) {
  if (!table) return null;
  return (
    <div className={cn("overflow-x-auto rounded-app border border-line", className)}>
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-2">
            {table.columns.map((h, i) => <th key={i} className="border-b border-r border-line px-2.5 py-1.5 text-left font-semibold last:border-r-0">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="odd:bg-transparent even:bg-surface-2/40">
              {row.map((cell, c) => <td key={c} className="border-b border-r border-line px-2.5 py-1.5 align-top last:border-r-0">{cell}</td>)}
            </tr>
          ))}
          {!table.rows.length ? <tr><td colSpan={table.columns.length} className="px-2.5 py-2 text-center text-xs text-fg-faint">—</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

/** Text with Markdown pipe tables rendered as real tables; everything else keeps its line breaks. */
export function RenderedText({ text, mono = false, className }) {
  const blocks = splitBlocks(text ?? "");
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((b, i) =>
        b.type === "table" ? (
          <SimpleTable key={i} table={b.table} />
        ) : b.text.trim() ? (
          <pre key={i} className={cn("whitespace-pre-wrap break-words text-[13px] leading-relaxed", mono ? "font-mono" : "font-sans")}>{b.text.replace(/^\n+|\n+$/g, "")}</pre>
        ) : null,
      )}
    </div>
  );
}

/** Rows × columns picker (like a word processor's insert-table grid). onPick(rows, cols) */
export function TablePicker({ onPick, maxRows = 8, maxCols = 8 }) {
  const tr = useT();
  const [hover, setHover] = useState({ r: 2, c: 3 });
  return (
    <div className="p-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${maxCols}, 1.1rem)` }} onMouseLeave={() => setHover({ r: 2, c: 3 })}>
        {Array.from({ length: maxRows * maxCols }, (_, i) => {
          const r = Math.floor(i / maxCols) + 1;
          const c = (i % maxCols) + 1;
          const on = r <= hover.r && c <= hover.c;
          return <button key={i} type="button" onMouseEnter={() => setHover({ r, c })} onFocus={() => setHover({ r, c })} onClick={() => onPick(r, c)} aria-label={`${r} × ${c}`} className={cn("h-[1.1rem] w-[1.1rem] rounded-sm border transition", on ? "border-accent bg-accent/40" : "border-line bg-surface-2")} />;
        })}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-fg-muted">{tr("{r} × {c} table", { r: hover.r, c: hover.c })}</p>
    </div>
  );
}
