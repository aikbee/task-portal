/** CSV / TSV parsing and writing (RFC 4180: quotes, doubled quotes, newlines inside quotes). Works in the browser and on the server. */

/** Guess the delimiter from the first lines: the one that splits them into the most equal columns. */
export function sniffDelimiter(text) {
  const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = head.map((l) => parseCsv(l, d)[0]?.length ?? 0);
    if (!counts.length || counts[0] < 2) continue;
    const same = counts.filter((c) => c === counts[0]).length;
    const score = same * 100 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Text -> rows of strings. Empty lines are dropped; a BOM is ignored. */
export function parseCsv(text, delimiter = ",") {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let sawQuote = false;
  const endCell = () => { row.push(sawQuote ? cell : cell.trim()); cell = ""; sawQuote = false; };
  const endRow = () => { endCell(); if (row.some((c) => c !== "")) rows.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; sawQuote = true; cell = ""; }
    else if (ch === delimiter) endCell();
    else if (ch === "\n") endRow();
    else if (ch === "\r") { if (src[i + 1] !== "\n") endRow(); }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

const quote = (v) => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Rows -> CSV text with CRLF line ends (what spreadsheets expect). */
export const toCsv = (rows) => rows.map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
