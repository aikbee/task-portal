/**
 * Tables inside outputs / notes.
 *  - "whole table" blocks store JSON: { columns: [..], rows: [[..], ..] }  (format = "table")
 *  - "inline" tables live inside text as Markdown pipe tables  (format = "text")
 * Plain module: used by both the API routes and the client editor.
 */
export const TABLE_LIMITS = { cols: 30, rows: 500, cell: 4000 };
export const FORMATS = ["text", "table"];

const str = (v) => (v == null ? "" : String(v)).slice(0, TABLE_LIMITS.cell);

export function emptyTable(rows = 3, cols = 3) {
  return { columns: Array.from({ length: cols }, (_, i) => `Column ${i + 1}`), rows: Array.from({ length: rows }, () => Array(cols).fill("")) };
}

/** Coerce anything table-shaped into a well-formed table (equal row lengths, strings, limits). Returns null when it is not a table. */
export function normalizeTable(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;
  const columns = t.columns.slice(0, TABLE_LIMITS.cols).map(str);
  if (!columns.length) return null;
  const rows = t.rows
    .slice(0, TABLE_LIMITS.rows)
    .filter(Array.isArray)
    .map((r) => columns.map((_, i) => str(r[i])));
  return { columns, rows };
}

export function parseTableJson(content) {
  if (!content) return null;
  try {
    return normalizeTable(JSON.parse(content));
  } catch {
    return null;
  }
}

export const serializeTable = (t) => JSON.stringify(normalizeTable(t) ?? emptyTable());

const escapeCell = (v) => str(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const unescapeCell = (v) => v.trim().replace(/\\\|/g, "|");

/** Markdown pipe table (used for text conversion and clipboard). */
export function tableToMarkdown(t) {
  const table = normalizeTable(t);
  if (!table) return "";
  const widths = table.columns.map((c, i) => Math.max(3, escapeCell(c).length, ...table.rows.map((r) => escapeCell(r[i]).length)));
  const line = (cells) => `| ${cells.map((c, i) => escapeCell(c).padEnd(widths[i])).join(" | ")} |`;
  return [line(table.columns), `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`, ...table.rows.map(line)].join("\n");
}

export const tableToTsv = (t) => {
  const table = normalizeTable(t);
  if (!table) return "";
  const cell = (v) => str(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return [table.columns, ...table.rows].map((r) => r.map(cell).join("\t")).join("\n");
};

/** Plain text of every cell (for search snippets and previews). */
export const tableText = (t) => {
  const table = normalizeTable(t);
  return table ? [table.columns, ...table.rows].map((r) => r.join(" | ")).join("\n") : "";
};

const SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  // split on unescaped pipes
  return s.split(/(?<!\\)\|/).map(unescapeCell);
};

/** Split text into paragraphs and Markdown pipe tables: [{ type: "text", text } | { type: "table", table }] */
export function splitBlocks(text) {
  const lines = (text ?? "").split("\n");
  const blocks = [];
  let buf = [];
  const flushText = () => {
    if (buf.length) blocks.push({ type: "text", text: buf.join("\n") });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("|") && i + 1 < lines.length && SEP_RE.test(lines[i + 1]) && lines[i + 1].includes("-") && lines[i + 1].includes("|")) {
      const columns = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      flushText();
      blocks.push({ type: "table", table: normalizeTable({ columns, rows }) });
      i = j - 1;
      continue;
    }
    buf.push(line);
  }
  flushText();
  return blocks;
}

export const hasInlineTable = (text) => splitBlocks(text).some((b) => b.type === "table");

/** First Markdown table in the text, or null. */
export function markdownToTable(text) {
  return splitBlocks(text).find((b) => b.type === "table")?.table ?? null;
}

/** Template inserted by the "Insert table" picker. */
export function tableTemplate(rows, cols) {
  return tableToMarkdown(emptyTable(rows, cols));
}

/** Text -> table conversion that never loses content: a Markdown table if there is one, else one line per row. */
export function textToTable(text) {
  const found = markdownToTable(text);
  if (found) return found;
  const lines = (text ?? "").split("\n").filter((l) => l.trim());
  if (!lines.length) return emptyTable();
  return { columns: ["Column 1"], rows: lines.map((l) => [l]) };
}

// ---------------------------------------------------------------------------
// Paste detection: turn whatever the clipboard holds into a table when it looks like one.
// ---------------------------------------------------------------------------

/** RFC-4180-ish CSV line (quotes, doubled quotes). */
export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const padColumns = (columns, rows) => {
  const cols = Math.max(columns.length, ...rows.map((r) => r.length), 1);
  const out = [...columns];
  while (out.length < cols) out.push(`Column ${out.length + 1}`);
  return out;
};

/**
 * Detects tabular text. Returns { kind, table } or null. Kinds:
 *  markdown – pipe table with a separator row
 *  tsv      – tab-separated lines (sheets, most copied tables)
 *  stacked  – tab-separated header, then one cell per line (tables copied from some web pages)
 *  pipes    – "a | b" lines without a separator row
 *  csv      – comma-separated (needs 3+ lines with the same column count)
 */
export function detectTable(text) {
  const raw = (text ?? "").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return null;
  const md = markdownToTable(raw);
  if (md && md.columns.length >= 2) return { kind: "markdown", table: md };

  const lines = raw.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const tabs = lines.map((l) => l.split("\t").length);
  if (tabs.every((n) => n >= 2)) {
    const grid = lines.map((l) => l.split("\t").map((c) => c.trim()));
    return { kind: "tsv", table: normalizeTable({ columns: padColumns(grid[0], grid.slice(1)), rows: grid.slice(1) }) };
  }
  if (tabs[0] >= 2 && tabs.slice(1).every((n) => n === 1)) {
    const columns = lines[0].split("\t").map((c) => c.trim());
    const body = lines.slice(1);
    const rows = [];
    for (let i = 0; i < body.length; i += columns.length) rows.push(body.slice(i, i + columns.length));
    return { kind: "stacked", table: normalizeTable({ columns, rows }) };
  }
  const pipes = lines.map((l) => l.split(/(?<!\\)\|/).length);
  if (pipes.every((n) => n >= 2) && new Set(pipes).size === 1) {
    const grid = lines.map(splitRow);
    return { kind: "pipes", table: normalizeTable({ columns: grid[0], rows: grid.slice(1) }) };
  }
  if (lines.length >= 3) {
    const csv = lines.map(parseCsvLine);
    if (csv[0].length >= 2 && csv.every((r) => r.length === csv[0].length) && csv[0].every((c) => c.length <= 40)) {
      return { kind: "csv", table: normalizeTable({ columns: csv[0], rows: csv.slice(1) }) };
    }
  }
  return null;
}

/** First <table> in a clipboard HTML fragment (browser only). */
export function tableFromHtml(html) {
  if (!html || typeof DOMParser === "undefined" || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const t = doc.querySelector("table");
  if (!t) return null;
  const trs = [...t.querySelectorAll("tr")].filter((tr) => tr.closest("table") === t);
  const grid = trs
    .map((tr) => [...tr.children].filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => c.textContent.replace(/\s+/g, " ").trim()))
    .filter((r) => r.length);
  if (!grid.length) return null;
  const hasHeader = trs[0]?.querySelector("th") != null || grid.length > 1;
  const columns = hasHeader ? grid[0] : grid[0].map((_, i) => `Column ${i + 1}`);
  const rows = hasHeader ? grid.slice(1) : grid;
  return normalizeTable({ columns: padColumns(columns, rows), rows });
}

/** { kind, table, text } for a paste event's DataTransfer, or null when it is not tabular. */
export function tableFromClipboard(dt) {
  if (!dt) return null;
  const text = dt.getData("text/plain") ?? "";
  const fromHtml = tableFromHtml(dt.getData("text/html"));
  if (fromHtml && (fromHtml.columns.length >= 2 || fromHtml.rows.length >= 2)) return { kind: "html", table: fromHtml, text };
  const detected = detectTable(text);
  return detected ? { ...detected, text } : null;
}

// ---------------------------------------------------------------------------
// Editor document model: one Markdown string = alternating text and table blocks.
// ---------------------------------------------------------------------------

/**
 * Blocks for the in-place editor: always text, table, text, table, … text — padded with
 * empty text blocks so there is somewhere to type before, between and after tables.
 */
export function parseDoc(content) {
  const out = [];
  for (const b of splitBlocks(content ?? "")) {
    const last = out[out.length - 1];
    if (b.type === "table") {
      if (!last || last.type === "table") out.push({ type: "text", text: "" });
      out.push(b);
    } else if (last && last.type === "text") {
      out[out.length - 1] = { type: "text", text: `${last.text}\n${b.text}` };
    } else out.push(b);
  }
  if (!out.length || out[out.length - 1].type === "table") out.push({ type: "text", text: "" });
  return out;
}

/** Inverse of parseDoc: text verbatim, tables as Markdown, empty padding blocks dropped. */
export function serializeDoc(blocks) {
  let out = "";
  let lastTable = false;
  for (const b of blocks) {
    if (b.type === "text") {
      if (b.text === "") continue;
      out += (out ? "\n" : "") + b.text;
      lastTable = false;
    } else {
      if (out) out += lastTable ? "\n\n" : "\n";
      out += tableToMarkdown(b.table);
      lastTable = true;
    }
  }
  return out;
}

export const countTables = (text) => splitBlocks(text ?? "").filter((b) => b.type === "table").length;
