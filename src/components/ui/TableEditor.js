"use client";
import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TABLE_LIMITS, tableFromClipboard } from "@/lib/text-tables";

/**
 * Spreadsheet-like editor for a { columns, rows } table.
 * Enter moves down (adding a row at the end), arrows move between rows, Tab moves between cells.
 */
export default function TableEditor({ value, onChange, onBlur, className, focusNonce }) {
  const tr = useT();
  const box = useRef(null);

  // focus the first header cell when asked (a freshly inserted table)
  useEffect(() => {
    if (focusNonce != null) {
      const cell = box.current?.querySelector('[data-cell="-1:0"]');
      cell?.focus();
      cell?.select();
    }
  }, [focusNonce]);
  const { columns, rows } = value;
  const focusCell = (r, c) => requestAnimationFrame(() => box.current?.querySelector(`[data-cell="${r}:${c}"]`)?.focus());

  const setHeader = (c, v) => onChange({ columns: columns.map((h, i) => (i === c ? v : h)), rows });
  const setCell = (r, c, v) => onChange({ columns, rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)) });
  const addRow = (at = rows.length) => {
    if (rows.length >= TABLE_LIMITS.rows) return;
    onChange({ columns, rows: [...rows.slice(0, at), Array(columns.length).fill(""), ...rows.slice(at)] });
    focusCell(at, 0);
  };
  const removeRow = (r) => onChange({ columns, rows: rows.filter((_, i) => i !== r) });
  const addColumn = () => {
    if (columns.length >= TABLE_LIMITS.cols) return;
    onChange({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, ""]) });
    focusCell(-1, columns.length);
  };
  const removeColumn = (c) => columns.length > 1 && onChange({ columns: columns.filter((_, i) => i !== c), rows: rows.map((row) => row.filter((_, i) => i !== c)) });

  const onKey = (e, r, c) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (r === rows.length - 1) addRow();
      else focusCell(r + 1, c);
    } else if (e.key === "ArrowDown" && r < rows.length - 1) {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === "ArrowUp" && r > -1) {
      e.preventDefault();
      focusCell(r - 1, c);
    }
  };
  /** Paste a grid starting at (r0, c0); r0 = -1 targets the header row. Grows the table as needed. */
  const fill = (grid, r0, c0) => {
    const blank = rows.every((row) => row.every((v) => !v)) && columns.every((h, i) => h === `Column ${i + 1}`);
    if (blank && r0 === -1 && c0 === 0) {
      const [head, ...body] = grid;
      const cols = head.map((h, i) => h || `Column ${i + 1}`);
      onChange({ columns: cols, rows: body.map((row) => cols.map((_, i) => row[i] ?? "")) });
      return;
    }
    let cols = [...columns];
    let body = rows.map((row) => [...row]);
    const needCols = Math.min(TABLE_LIMITS.cols, c0 + Math.max(...grid.map((g) => g.length)));
    while (cols.length < needCols) {
      cols.push(`Column ${cols.length + 1}`);
      body = body.map((row) => [...row, ""]);
    }
    const needRows = Math.min(TABLE_LIMITS.rows, r0 + grid.length);
    while (body.length < needRows) body.push(Array(cols.length).fill(""));
    grid.forEach((g, i) => {
      const r = r0 + i;
      g.forEach((v, j) => {
        const c = c0 + j;
        if (c >= cols.length) return;
        if (r === -1) cols[c] = v;
        else if (r < body.length) body[r][c] = v;
      });
    });
    onChange({ columns: cols, rows: body });
  };
  const onPaste = (e, r, c) => {
    const text = e.clipboardData.getData("text/plain") ?? "";
    const hit = tableFromClipboard(e.clipboardData);
    let grid = hit ? [hit.table.columns, ...hit.table.rows] : null;
    if (!grid) {
      const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
      if (lines.length < 2 && !text.includes("\t")) return; // single value: let the input handle it
      grid = lines.map((l) => l.split("\t"));
    }
    e.preventDefault();
    fill(grid, r, c);
  };
  const blur = (e) => {
    if (onBlur && !e.currentTarget.contains(e.relatedTarget)) onBlur(e);
  };

  const cellCls = "w-full min-w-[7rem] bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:bg-accent/10";
  const selectAll = (e) => e.target.select(); // spreadsheet feel: typing into a freshly focused cell replaces it
  return (
    <div ref={box} onBlur={blur} className={cn("rounded-app border border-line", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="bg-surface-2">
              <th className="w-8 border-b border-r border-line" />
              {columns.map((h, c) => (
                <th key={c} className="group relative border-b border-r border-line p-0 text-left font-semibold">
                  <input value={h} data-cell={`-1:${c}`} onChange={(e) => setHeader(c, e.target.value)} onPaste={(e) => onPaste(e, -1, c)} onFocus={selectAll} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusCell(0, c))} placeholder={`Column ${c + 1}`} className={cn(cellCls, "font-semibold pr-6")} />
                  {columns.length > 1 ? (
                    <button type="button" tabIndex={-1} onClick={() => removeColumn(c)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-faint opacity-0 hover:bg-rose-500/15 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100" aria-label={tr("Delete column")} title={tr("Delete column")}>
                      <X size={12} />
                    </button>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group">
                <td className="relative border-b border-r border-line bg-surface-2/60 text-center text-[11px] tabular-nums text-fg-faint">
                  <span className="group-hover:invisible">{r + 1}</span>
                  <button type="button" tabIndex={-1} onClick={() => removeRow(r)} className="absolute inset-0 grid place-items-center text-fg-faint opacity-0 hover:bg-rose-500/15 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100" aria-label={tr("Delete row")} title={tr("Delete row")}>
                    <X size={12} />
                  </button>
                </td>
                {row.map((cell, c) => (
                  <td key={c} className="border-b border-r border-line p-0">
                    <input value={cell} data-cell={`${r}:${c}`} onChange={(e) => setCell(r, c, e.target.value)} onKeyDown={(e) => onKey(e, r, c)} onPaste={(e) => onPaste(e, r, c)} onFocus={selectAll} className={cellCls} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5 text-xs">
        <button type="button" onClick={() => addRow()} className="flex items-center gap-1 rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"><Plus size={12} /> {tr("Add row")}</button>
        <button type="button" onClick={addColumn} className="flex items-center gap-1 rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"><Plus size={12} /> {tr("Add column")}</button>
        <span className="ml-auto text-[11px] text-fg-faint">{tr("{r} rows · {c} columns", { r: rows.length, c: columns.length })}</span>
      </div>
    </div>
  );
}
