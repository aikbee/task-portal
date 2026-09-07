"use client";
import { useMemo, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Columns3,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  RotateCcw,
  Trash2,
  X,
  Inbox,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/lib/store";
import Button from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { Checkbox, Select, Input, Field } from "@/components/ui/Controls";
import { formatDate } from "@/lib/utils";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useT } from "@/lib/i18n";

/**
 * Full-width data table with sortable columns, a column-visibility dropdown,
 * client-side search, pagination, optional row selection + bulk delete.
 *
 * columns: [{ key, label, sortable=true, render(row), sortValue(row), width,
 *             align, defaultHidden, hideable=true, searchable=true, className }]
 * dateFields: [{ key, label }] — enables the From/To date range filter on those row fields
 */

const iso = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
function datePresets() {
  const now = new Date();
  const day = 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [
    { label: "Today", from: iso(now), to: iso(now) },
    { label: "Last 7 days", from: iso(new Date(now - 6 * day)), to: iso(now) },
    { label: "Last 30 days", from: iso(new Date(now - 29 * day)), to: iso(now) },
    { label: "This month", from: iso(startOfMonth), to: iso(endOfMonth) },
    { label: "Next 30 days", from: iso(now), to: iso(new Date(now.getTime() + 30 * day)) },
    { label: "Before today", from: "", to: iso(new Date(now - day)) },
  ];
}
export default function DataTable({
  id,
  columns,
  rows = [],
  loading = false,
  error = null,
  defaultSort = null,
  searchPlaceholder = "Search…",
  onRowClick,
  rowActions,
  toolbar,
  selectable = false,
  onDeleteSelected,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  getRowId = (r) => r.id,
  filters, // extra filter controls rendered next to search
  dateFields, // [{ key, label }] for the date range filter
  className,
  dense,
}) {
  const tr = useT();
  const prefPageSize = usePrefs((s) => s.pageSize);
  const tables = usePrefs((s) => s.tables);
  const setColumnVisibility = usePrefs((s) => s.setColumnVisibility);
  const tableSorts = usePrefs((s) => s.tableSorts);
  const setTableSort = usePrefs((s) => s.setTableSort);

  const [query, setQuery] = useState("");
  // sort precedence: header click (this visit) > saved default for this table > page default
  const savedSort = id ? tableSorts?.[id] ?? null : null;
  const [sortOverride, setSortOverride] = useState(undefined);
  const sort = sortOverride !== undefined ? sortOverride : savedSort ?? defaultSort;
  const setSort = (updater) => setSortOverride(typeof updater === "function" ? updater(sort) : updater);
  const saveDefaultSort = (key, dir) => {
    if (!id) return;
    const same = savedSort && savedSort.key === key && savedSort.dir === dir;
    setTableSort(id, same ? null : { key, dir });
    setSortOverride(undefined);
  };
  const defaultSortLabel = (() => {
    const s = savedSort ?? defaultSort;
    if (!s) return "None";
    const col = columns.find((c) => c.key === s.key);
    return `${col?.label ?? s.key} ${s.dir === "desc" ? "↓" : "↑"}`;
  })();
  const [page, setPage] = useState(1);
  const [pageSizeOverride, setPageSizeOverride] = useState(null);
  const pageSize = pageSizeOverride ?? prefPageSize;
  const [selected, setSelected] = useState(() => new Set());
  const changeQuery = (v) => { setQuery(v); setPage(1); };
  const changePageSize = (n) => { setPageSizeOverride(n); setPage(1); };

  // ---- date range filter ----
  const [dateFilter, setDateFilter] = useState({ field: dateFields?.[0]?.key ?? null, from: "", to: "" });
  const dateActive = Boolean(dateFields?.length && dateFilter.field && (dateFilter.from || dateFilter.to));
  const setDate = (patch) => { setDateFilter((f) => ({ ...f, ...patch })); setPage(1); };
  const clearDate = () => setDate({ from: "", to: "" });
  const dateFieldLabel = dateFields?.find((f) => f.key === dateFilter.field)?.label ?? "Date";
  const short = (d) => formatDate(d, { month: "short", day: "numeric" });
  const dateSummary = dateActive ? `${dateFieldLabel}: ${dateFilter.from ? short(dateFilter.from) : "…"} – ${dateFilter.to ? short(dateFilter.to) : "…"}` : tr("Dates");

  // ---- column visibility (persisted per table id) ----
  const defaultVisibility = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, !c.defaultHidden])),
    [columns]
  );
  const visibility = { ...defaultVisibility, ...(id ? tables[id] : {}) };
  const visibleColumns = columns.filter((c) => visibility[c.key] !== false);
  const toggleColumn = (key) => {
    const next = { ...visibility, [key]: !visibility[key] };
    if (id) setColumnVisibility(id, next);
  };
  const resetColumns = () => {
    if (!id) return;
    setColumnVisibility(id, {});
    setTableSort(id, null);
    setSortOverride(undefined);
  };

  // ---- search ----
  const filtered = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q) {
      const searchable = columns.filter((c) => c.searchable !== false);
      out = out.filter((row) =>
        searchable.some((c) => {
          const v = c.sortValue ? c.sortValue(row) : row[c.key];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }
    if (dateActive) {
      const { field, from, to } = dateFilter;
      out = out.filter((row) => {
        const v = row[field];
        if (!v) return false; // rows without a date fall outside any range
        const d = String(v).slice(0, 10);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    return out;
  }, [rows, query, columns, dateFilter, dateActive]);

  // ---- sort ----
  const sorted = useMemo(() => {
    if (!sort?.key) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const get = (row) => (col.sortValue ? col.sortValue(row) : row[col.key]);
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [filtered, sort, columns]);

  const cycleSort = (key) => {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  // ---- pagination ----
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  // ---- selection ----
  const pageIds = pageRows.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((i) => selected.has(i));
  const someOnPage = pageIds.some((i) => selected.has(i));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPage) pageIds.forEach((i) => next.delete(i));
    else pageIds.forEach((i) => next.add(i));
    setSelected(next);
  };
  const toggleOne = (rid) => {
    const next = new Set(selected);
    next.has(rid) ? next.delete(rid) : next.add(rid);
    setSelected(next);
  };
  // ignore selections for rows that no longer exist (derived, no effect needed)
  const rowIdSet = new Set(rows.map(getRowId));
  const selectedIds = [...selected].filter((i) => rowIdSet.has(i));

  const exportCsv = () => {
    const cols = visibleColumns;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c.label)).join(",")];
    for (const row of sorted) {
      lines.push(cols.map((c) => esc(c.sortValue ? c.sortValue(row) : row[c.key])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${id || "table"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const colSpan = visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className={cn("card overflow-hidden p-0", className)}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="control h-9 pl-9 pr-8"
          />
          {query ? (
            <button onClick={() => changeQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg" aria-label={tr("Clear search")}>
              <X size={14} />
            </button>
          ) : null}
        </div>
        {filters}
        {dateFields?.length ? (
          <Popover
            width="w-80"
            align="start"
            trigger={({ toggle, open }) => (
              <Button variant={dateActive ? "subtle" : open ? "secondary" : "outline"} size="sm" icon={CalendarRange} onClick={toggle}>
                {dateSummary}
                {dateActive ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); clearDate(); }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20"
                    aria-label="Clear date filter"
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </Button>
            )}
          >
            <div className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Date range")}</span>
                {dateActive ? (
                  <button onClick={clearDate} className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg">
                    <RotateCcw size={11} /> Clear
                  </button>
                ) : null}
              </div>
              {dateFields.length > 1 ? (
                <Field label={tr("Field")}>
                  <Select value={dateFilter.field ?? ""} onChange={(e) => setDate({ field: e.target.value })} className="h-8 text-xs">
                    {dateFields.map((f) => (
                      <option key={f.key} value={f.key}>{tr(f.label)}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Field label={tr("From")}>
                  <Input type="date" value={dateFilter.from} max={dateFilter.to || undefined} onChange={(e) => setDate({ from: e.target.value })} className="h-8 text-xs" />
                </Field>
                <Field label={tr("To")}>
                  <Input type="date" value={dateFilter.to} min={dateFilter.from || undefined} onChange={(e) => setDate({ to: e.target.value })} className="h-8 text-xs" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1">
                {datePresets().map((p) => {
                  const on = dateFilter.from === p.from && dateFilter.to === p.to;
                  return (
                    <button
                      key={p.label}
                      onClick={() => setDate({ from: p.from, to: p.to })}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium transition", on ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:bg-surface-2 hover:text-fg")}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-fg-faint">Leave one side empty for an open-ended range. Rows without a {dateFieldLabel.toLowerCase()} are hidden while a range is active.</p>
            </div>
          </Popover>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {selectable && selectedIds.length > 0 ? (
            <div className="flex items-center gap-2 rounded-app-sm bg-accent/10 px-2 py-1 text-xs font-medium text-accent anim-pop">
              {selectedIds.length} selected
              {onDeleteSelected ? (
                <Button size="xs" variant="danger" icon={Trash2} onClick={() => onDeleteSelected(selectedIds, () => setSelected(new Set()))}>
                  {tr("Delete")}
                </Button>
              ) : null}
              <button onClick={() => setSelected(new Set())} className="text-accent/70 hover:text-accent" aria-label="Clear selection">
                <X size={13} />
              </button>
            </div>
          ) : null}
          {toolbar}
          <Button variant="outline" size="sm" icon={Download} onClick={exportCsv} title={tr("Export the visible columns as CSV")}>
            <span className="hidden sm:inline">{tr("Export")}</span>
          </Button>
          <Popover
            width="w-80"
            trigger={({ toggle, open }) => (
              <Button variant={open ? "secondary" : "outline"} size="sm" icon={Columns3} onClick={toggle}>
                {tr("Columns")}
                <span className="rounded-full bg-surface-3 px-1.5 text-[10px] text-fg-muted">
                  {visibleColumns.length}/{columns.length}
                </span>
              </Button>
            )}
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Columns &amp; sort</span>
              <button onClick={resetColumns} className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg" title={tr("Show all columns and use the page's default sort")}>
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-3 py-1.5 text-[11px] text-fg-muted">
              <span>
                Default sort: <b className="text-fg">{defaultSortLabel}</b>
                {savedSort ? <span className="ml-1 rounded-full bg-accent/12 px-1.5 py-px text-[10px] text-accent">{tr("saved")}</span> : null}
              </span>
              {savedSort ? (
                <button onClick={() => { setTableSort(id, null); setSortOverride(undefined); }} className="hover:text-fg">{tr("Clear")}</button>
              ) : null}
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              <div className="flex items-center px-2.5 pb-1 text-[10px] uppercase tracking-wider text-fg-faint">
                <span className="flex-1">{tr("Show")}</span>
                <span className="w-16 text-center">{tr("Sort by")}</span>
              </div>
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const isSavedAsc = savedSort?.key === c.key && savedSort.dir === "asc";
                const isSavedDesc = savedSort?.key === c.key && savedSort.dir === "desc";
                return (
                  <div key={c.key} className="flex items-center gap-2 rounded-app-sm px-2.5 py-1 hover:bg-surface-2">
                    <label className={cn("flex min-w-0 flex-1 items-center gap-2.5 text-sm", c.hideable === false ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
                      <Checkbox
                        checked={visibility[c.key] !== false}
                        disabled={c.hideable === false}
                        onChange={() => c.hideable !== false && toggleColumn(c.key)}
                      />
                      <span className="truncate">{tr(c.label)}</span>
                    </label>
                    {sortable ? (
                      <span className="flex w-16 shrink-0 justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => saveDefaultSort(c.key, "asc")}
                          className={cn("grid h-6 w-6 place-items-center rounded-md border transition", isSavedAsc ? "border-accent bg-accent text-white" : "border-line text-fg-faint hover:border-line-strong hover:text-fg")}
                          aria-label={`Sort ${c.label} ascending by default`}
                          title="Sort ascending by default"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => saveDefaultSort(c.key, "desc")}
                          className={cn("grid h-6 w-6 place-items-center rounded-md border transition", isSavedDesc ? "border-accent bg-accent text-white" : "border-line text-fg-faint hover:border-line-strong hover:text-fg")}
                          aria-label={`Sort ${c.label} descending by default`}
                          title="Sort descending by default"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </span>
                    ) : (
                      <span className="w-16 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="border-t border-line px-3 py-1.5 text-[10px] text-fg-faint">{tr("Clicking a column header sorts for this visit only; the buttons here save your default for this page.")}</p>
          </Popover>
        </div>
      </div>

      {/* table */}
      <div className="max-h-[calc(100vh-var(--topbar-h)-var(--bottombar-h)-220px)] min-h-[200px] w-full overflow-auto">
        <table className={cn("data-table w-full min-w-max border-collapse text-sm", dense && "text-xs")}>
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              {selectable ? (
                <th className="w-10 border-b border-line">
                  <Checkbox checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={toggleAll} aria-label={tr("Select all")} />
                </th>
              ) : null}
              {visibleColumns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={cn("border-b border-line whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center")}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(c.key)}
                        className={cn(
                          "group inline-flex items-center gap-1.5 rounded px-1 -mx-1 transition hover:text-fg",
                          active && "text-accent"
                        )}
                      >
                        {c.label}
                        {active ? (
                          sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-0 transition group-hover:opacity-60" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              {rowActions ? <th className="w-24 border-b border-line text-right">{tr("Actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={colSpan}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={tr("Could not load data")} description={error.message} compact />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState
                    icon={Inbox}
                    title={query || dateActive ? "No results" : emptyTitle}
                    description={query ? `Nothing matches "${query}".` : dateActive ? "Nothing in the selected date range." : emptyDescription}
                    action={query || dateActive ? null : emptyAction}
                    compact
                  />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const rid = getRowId(row);
                const isSel = selected.has(rid);
                return (
                  <tr
                    key={rid ?? i}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-line/70 transition-colors last:border-0",
                      onRowClick && "cursor-pointer",
                      isSel ? "bg-accent/6" : "hover:bg-surface-2/70"
                    )}
                  >
                    {selectable ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSel} onChange={() => toggleOne(rid)} aria-label={tr("Select row")} />
                      </td>
                    ) : null}
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        className={cn("align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                      >
                        {c.render ? c.render(row) : row[c.key] ?? <span className="text-fg-faint">—</span>}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-0.5">{rowActions(row)}</div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* footer / pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs text-fg-muted">
        <div className="flex items-center gap-3">
          <span>
            {total === 0 ? tr("0 rows") : tr("{from}–{to} of {total}", { from, to, total })}
            {(query || dateActive) && rows.length !== total ? ` ${tr("(filtered from {n})", { n: rows.length })}` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <span>{tr("Rows")}</span>
            <Select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} className="h-7 w-[68px] py-0 text-xs">
              {[5, 10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="iconXs" icon={ChevronsLeft} disabled={safePage <= 1} onClick={() => setPage(1)} aria-label={tr("First page")} />
          <Button variant="ghost" size="iconXs" icon={ChevronLeft} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label={tr("Previous page")} />
          <span className="px-2 tabular-nums">
            {tr("Page")} <b className="text-fg">{safePage}</b> / {pageCount}
          </span>
          <Button variant="ghost" size="iconXs" icon={ChevronRight} disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label={tr("Next page")} />
          <Button variant="ghost" size="iconXs" icon={ChevronsRight} disabled={safePage >= pageCount} onClick={() => setPage(pageCount)} aria-label={tr("Last page")} />
        </div>
      </div>
    </div>
  );
}
