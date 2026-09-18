"use client";
import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Download, CheckCircle2, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Checkbox, Segmented } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { parseCsv, sniffDelimiter, toCsv } from "@/lib/csv";
import { IMPORT_KINDS, IMPORT_MAX_ROWS, autoMap, looksLikeHeader, templateRows } from "@/lib/import-fields";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useFeature } from "@/lib/auth-context";

/**
 * Bring records in from a spreadsheet: paste or drop a CSV, match its columns to fields, look at what the
 * server made of every row, then import. What the import created can be undone from the toast.
 */
export default function ImportDialog({ kind, open, onClose, onImported }) {
  const tr = useT();
  const toast = useToast();
  const spec = IMPORT_KINDS[kind];
  const fileRef = useRef(null);
  const [step, setStep] = useState(0); // 0 source, 1 columns, 2 preview
  const [text, setText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [headerTouched, setHeaderTouched] = useState(false);
  const [columns, setColumns] = useState(null); // field per column, null = ignore
  const [options, setOptions] = useState({ create_missing: true, skip_existing: true, date_order: "dmy" });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return { rows: [], delimiter: "," };
    const delimiter = sniffDelimiter(text);
    return { rows: parseCsv(text, delimiter), delimiter };
  }, [text]);
  const headerGuess = parsed.rows.length ? looksLikeHeader(kind, parsed.rows[0]) : true;
  const header = headerTouched ? hasHeader : headerGuess;
  const dataRows = header ? parsed.rows.slice(1) : parsed.rows;
  const width = Math.max(0, ...parsed.rows.map((r) => r.length));
  const headers = header ? parsed.rows[0] ?? [] : Array.from({ length: width }, (_, i) => tr("Column {n}", { n: i + 1 }));
  const mapping = columns ?? autoMap(kind, header ? headers : Array.from({ length: width }, () => ""));
  const fieldOptions = Object.entries(spec.fields);
  const missingRequired = fieldOptions.filter(([k, f]) => f.required && !mapping.includes(k) && !(kind === "employees")).map(([, f]) => f.label);
  const nameMapped = kind !== "employees" || mapping.includes("name") || mapping.includes("first_name") || mapping.includes("last_name");

  const reset = () => { setStep(0); setText(""); setColumns(null); setPreview(null); setError(null); setHeaderTouched(false); };
  const close = () => { onClose(); setTimeout(reset, 300); };
  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? "")); setColumns(null); };
    reader.readAsText(file);
  };
  const template = () => {
    const blob = new Blob(["﻿" + toCsv(templateRows(kind))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const payload = (extra = {}) => ({ kind, columns: mapping.slice(0, width), rows: dataRows.slice(0, IMPORT_MAX_ROWS), options: { ...options, ...extra } });
  const runPreview = async (opts = {}) => {
    setBusy(true);
    setError(null);
    try {
      const next = { ...options, ...opts };
      setOptions(next);
      setPreview(await api.post("/api/import", payload({ ...next, dry: true })));
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post("/api/import", payload());
      const n = res.created[kind] ?? 0;
      const extras = [res.created.projects ? tr("{n} projects", { n: res.created.projects }) : null, res.created.employees ? tr("{n} employees", { n: res.created.employees }) : null].filter(Boolean);
      toast.show({
        type: "success",
        title: tr("{n} {what} imported", { n, what: n === 1 ? tr(spec.singular) : tr(spec.label).toLowerCase() }),
        description: [extras.length ? tr("Also added: {list}.", { list: extras.join(", ") }) : null, res.skipped ? tr("{n} rows skipped.", { n: res.skipped }) : null].filter(Boolean).join(" ") || undefined,
        action: res.batch_id ? { label: tr("Undo"), onClick: async () => { try { const u = await api.post(`/api/import/${res.batch_id}/undo`, {}); toast.success(tr("Import undone"), tr("{n} records moved to the recycle bin.", { n: u.moved })); onImported?.(); } catch (e) { toast.error(tr("Could not undo"), e.message); } } } : null,
      });
      onImported?.();
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [tr("Spreadsheet"), tr("Columns"), tr("Check and import")];
  const footer = (
    <>
      {step > 0 ? <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)} disabled={busy}>{tr("Back")}</Button> : null}
      <span className="flex-1" />
      {step === 0 ? <Button icon={ArrowRight} onClick={() => setStep(1)} disabled={!dataRows.length} className="import-next">{tr("Match columns")}</Button> : null}
      {step === 1 ? <Button icon={ArrowRight} onClick={() => runPreview()} loading={busy} disabled={missingRequired.length > 0 || !nameMapped} className="import-check">{tr("Check the rows")}</Button> : null}
      {step === 2 ? <Button icon={Upload} onClick={runImport} loading={busy} disabled={!preview?.counts.ready} className="import-go">{tr("Import {n} rows", { n: preview?.counts.ready ?? 0 })}</Button> : null}
    </>
  );

  return (
    <Modal open={open} onClose={close} size="xl" title={tr("Import {what}", { what: tr(spec.label).toLowerCase() })} description={tr("From Excel, Google Sheets, Numbers or any CSV file. Nothing is changed until the last step.")} footer={footer} className="import-dialog">
      <ol className="mb-4 flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i > 0 && "before:block before:h-px before:w-6 before:bg-line")}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold", i === step ? "bg-accent text-white" : i < step ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-2 text-fg-muted")}>{i < step ? "✓" : i + 1}</span>
            <span className={i === step ? "font-medium text-fg" : "text-fg-muted"}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-3">
          <div
            className="import-drop flex flex-col items-center justify-center gap-2 rounded-app border border-dashed border-line bg-surface-2/50 p-5 text-center text-sm text-fg-muted"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
          >
            <FileSpreadsheet size={22} className="text-fg-faint" />
            <p>{tr("Drop a CSV file here, or")} <button type="button" className="font-medium text-accent hover:underline" onClick={() => fileRef.current?.click()}>{tr("choose one")}</button></p>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="text-xs">{tr("Or copy the cells in your spreadsheet and paste them below.")}</p>
          </div>
          <textarea
            className="control import-text min-h-40 w-full font-mono text-xs"
            placeholder={tr("Paste here…")}
            value={text}
            onChange={(e) => { setText(e.target.value); setColumns(null); }}
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted">
            <span>{parsed.rows.length ? tr("{rows} rows and {cols} columns found.", { rows: dataRows.length, cols: width }) : tr("Up to {n} rows at a time.", { n: IMPORT_MAX_ROWS })}{dataRows.length > IMPORT_MAX_ROWS ? ` ${tr("Only the first {n} are taken.", { n: IMPORT_MAX_ROWS })}` : ""}</span>
            <span className="flex items-center gap-3">
              <Checkbox checked={header} onChange={(v) => { setHasHeader(v); setHeaderTouched(true); setColumns(null); }} label={tr("First row holds the column names")} />
              <button type="button" className="import-template inline-flex items-center gap-1 font-medium text-accent hover:underline" onClick={template}><Download size={12} /> {tr("Template")}</button>
            </span>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">{tr("Say which field each column goes into. Columns set to “Ignore” are left out.")}</p>
          <div className="overflow-x-auto rounded-app border border-line">
            <table className="import-map w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-fg-muted">
                <tr><th className="px-3 py-2">{tr("Column")}</th><th className="px-3 py-2">{tr("Looks like")}</th><th className="px-3 py-2">{tr("Goes into")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Array.from({ length: width }, (_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium">{headers[i] || tr("Column {n}", { n: i + 1 })}</td>
                    <td className="max-w-[16rem] truncate px-3 py-1.5 text-fg-muted">{dataRows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-1.5">
                      <select className="control h-8 text-xs" value={mapping[i] ?? ""} onChange={(e) => { const next = [...mapping]; const v = e.target.value || null; next.forEach((m, j) => { if (j !== i && m === v) next[j] = null; }); next[i] = v; setColumns(next); }}>
                        <option value="">{tr("Ignore")}</option>
                        {fieldOptions.map(([k, f]) => <option key={k} value={k}>{tr(f.label)}{f.required ? " *" : ""}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingRequired.length ? <p className="flex items-center gap-2 text-sm text-rose-500"><AlertTriangle size={15} /> {tr("Still needed: {list}.", { list: missingRequired.map((l) => tr(l)).join(", ") })}</p> : null}
          {!nameMapped ? <p className="flex items-center gap-2 text-sm text-rose-500"><AlertTriangle size={15} /> {tr("Still needed: a name column (full name, or first and last name).")}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox checked={options.create_missing} onChange={(v) => setOptions((o) => ({ ...o, create_missing: v }))} label={tr("Add projects and people that do not exist yet")} />
            <Checkbox checked={options.skip_existing} onChange={(v) => setOptions((o) => ({ ...o, skip_existing: v }))} label={tr("Skip rows that exist already")} />
          </div>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>
      ) : null}

      {step === 2 && preview ? (
        <div className="space-y-3">
          <div className="import-summary flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="emerald" dot>{tr("{n} ready", { n: preview.counts.ready })}</Badge>
            {preview.counts.warnings ? <Badge tone="amber" dot>{tr("{n} with remarks", { n: preview.counts.warnings })}</Badge> : null}
            {preview.counts.skipped ? <Badge tone="rose" dot>{tr("{n} skipped", { n: preview.counts.skipped })}</Badge> : null}
            {preview.counts.new_projects ? <Badge tone="sky">{tr("{n} new projects", { n: preview.counts.new_projects })}</Badge> : null}
            {preview.counts.new_employees ? <Badge tone="sky">{tr("{n} new people", { n: preview.counts.new_employees })}</Badge> : null}
          </div>
          {preview.new_names?.projects.length || preview.new_names?.employees.length ? (
            <p className="import-new text-xs text-fg-muted">
              {preview.new_names.projects.length ? <span>{tr("Projects to add: {list}.", { list: preview.new_names.projects.join(", ") })} </span> : null}
              {preview.new_names.employees.length ? <span>{tr("People to add: {list}.", { list: preview.new_names.employees.join(", ") })}</span> : null}
            </p>
          ) : null}
          {preview.needs_date_order ? (
            <div className="import-date-order flex flex-wrap items-center gap-3 rounded-app border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              <span>{tr("Dates like 3/4/2026 mean:")}</span>
              <Segmented size="sm" value={options.date_order} onChange={(v) => runPreview({ date_order: v })} options={[{ value: "dmy", label: tr("day / month (3 April)") }, { value: "mdy", label: tr("month / day (4 March)") }]} />
            </div>
          ) : null}
          <div className="max-h-[50vh] overflow-auto rounded-app border border-line">
            <table className="import-preview w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-left uppercase tracking-wider text-fg-muted">
                <tr><th className="px-2 py-2">#</th>{preview.fields.filter(Boolean).map((f) => <th key={f} className="px-2 py-2">{tr(spec.fields[f].label)}</th>)}<th className="min-w-[16rem] px-2 py-2">{tr("Remarks")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((r) => (
                  <tr key={r.n} className={cn(r.skip ? "bg-rose-500/5 text-fg-muted" : r.problems.length ? "bg-amber-500/5" : "")}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.skip ? <XCircle size={13} className="inline text-rose-500" /> : r.problems.length ? <AlertTriangle size={13} className="inline text-amber-500" /> : <CheckCircle2 size={13} className="inline text-emerald-500" />} {r.n}</td>
                    {preview.fields.filter(Boolean).map((f) => <td key={f} className="max-w-[14rem] truncate px-2 py-1.5">{String(r.shown[f] ?? r.values[f] ?? "")}</td>)}
                    <td className="px-2 py-1.5 text-fg-muted">{r.problems.map((p, i) => <span key={i} className={cn("block", p.level === "error" && "text-rose-500")}>{p.message}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-center gap-2 text-xs text-fg-muted"><Sparkles size={13} /> {tr("Skipped rows are not imported. Fix them in the spreadsheet and import again: what already exists is skipped, so nothing doubles.")}</p>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** The "Import" button for a list page: opens the dialog for its record type. */
export function ImportButton({ kind, onImported }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const allowed = useFeature("import");
  if (!allowed) return null;
  return (
    <>
      <Button variant="secondary" icon={Upload} onClick={() => setOpen(true)} className="import-open">{tr("Import")}</Button>
      <ImportDialog kind={kind} open={open} onClose={() => setOpen(false)} onImported={onImported} />
    </>
  );
}
