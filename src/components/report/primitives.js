"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, SlidersHorizontal, X, Check } from "lucide-react";
import Logo from "@/components/ui/Logo";
import Button from "@/components/ui/Button";
import { RenderedText } from "@/components/ui/TextBlocks";
import { displayMentions } from "@/lib/mentions";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDateTime, formatDate, formatBytes } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Paper on the right, controls on the left (or a bottom bar on phones). Print hides the controls. */
export function ReportShell({ title, backHref, controls, children }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.title = `${title} · Task Portal`;
  }, [title]);
  const print = () => window.print();
  return (
    <div className="mx-auto flex max-w-[1200px] items-start gap-6 p-4 pb-24 md:p-6 md:pb-6 print:block print:max-w-none print:p-0">
      <aside className="print-hide sticky top-6 hidden w-72 shrink-0 md:block">
        <div className="space-y-4 rounded-app border border-line bg-white p-4 shadow-app">
          <Button icon={Printer} onClick={print} className="w-full">{tr("Save as PDF")}</Button>
          <p className="text-[11px] text-fg-faint">{tr("Use your browser's print dialog and choose “Save as PDF”.")}</p>
          <Link href={backHref} className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"><ArrowLeft size={13} /> {tr("Back")}</Link>
          {controls}
        </div>
      </aside>
      <main className="report min-w-0 flex-1 rounded-app border border-line bg-white p-6 shadow-app sm:p-10 print:border-0 print:p-0 print:shadow-none">{children}</main>

      <div className="print-hide fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-line bg-white p-3 md:hidden">
        <Button icon={Printer} onClick={print} className="flex-1">{tr("Save as PDF")}</Button>
        {controls ? <Button variant="outline" icon={SlidersHorizontal} onClick={() => setOpen(true)}>{tr("Sections")}</Button> : null}
      </div>
      {open ? (
        <div className="print-hide fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">{tr("Sections")}</span>
            <Button variant="ghost" size="icon" icon={X} onClick={() => setOpen(false)} aria-label={tr("Close")} />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{controls}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Document header: brand, generated stamp, title, subtitle and badges. */
export function DocHeader({ kicker, title, subtitle, badges }) {
  const tr = useT();
  const { user } = useAuth();
  return (
    <header className="mb-8 border-b-2 border-fg/80 pb-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-2"><Logo size={22} className="rounded-md" /> <span className="font-semibold text-fg">Task Portal</span>{user?.profile?.name ? <span>· {user.profile.name}</span> : null}</span>
        <span>{tr("Generated")} {formatDateTime(new Date().toISOString())}{user?.name ? ` · ${user.name}` : ""}</span>
      </div>
      {kicker ? <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{kicker}</p> : null}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-fg-muted">{subtitle}</p> : null}
      {badges?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{badges.filter(Boolean).map((b, i) => <span key={i} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium">{b}</span>)}</div> : null}
    </header>
  );
}

export function Section({ title, count, children }) {
  return (
    <section className="report-section mb-7">
      <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-line pb-1.5 text-sm font-bold uppercase tracking-wider text-fg">
        {title}
        {count != null ? <span className="text-[11px] font-medium normal-case tracking-normal text-fg-muted">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** Label / value grid. Empty values render as an em dash. */
export function KV({ items, cols = 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", cols === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</dt>
          <dd className="mt-0.5 break-words font-medium">{value == null || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Plain table for print. columns: [{ key, label, render?, align? }] */
export function RTable({ columns, rows, empty }) {
  const tr = useT();
  if (!rows?.length) return <p className="text-sm text-fg-muted">{empty ?? tr("Nothing here yet")}</p>;
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-fg/60 text-left text-[11px] uppercase tracking-wider text-fg-muted">
          {columns.map((c) => <th key={c.key} className={cn("py-1.5 pr-3 font-semibold", c.align === "right" && "text-right")}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id ?? i} className="border-b border-line align-top">
            {columns.map((c) => <td key={c.key} className={cn("py-1.5 pr-3", c.align === "right" && "text-right tabular-nums")}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Long text with Markdown tables rendered and @mentions shown as names. */
export function Blocks({ text, className }) {
  if (!text?.trim()) return <p className="text-sm text-fg-muted">—</p>;
  return <RenderedText text={displayMentions(text)} className={cn("text-[13px]", className)} />;
}

/** Attachment list; images are embedded so they land in the PDF. */
export function AttachmentList({ items, kind }) {
  const tr = useT();
  if (!items?.length) return <p className="text-sm text-fg-muted">{tr("Nothing here yet")}</p>;
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const url = `/api/attachments/${kind}/${a.id}`;
        const image = (a.mime_type || "").startsWith("image/");
        return (
          <li key={a.id} className="report-section text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium">{a.original_name}</span>
              <span className="text-[11px] text-fg-muted">{formatBytes(a.size_bytes ?? 0)} · {a.mime_type || "file"} · {formatDate(a.created_at)}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image ? <img src={url} alt={a.original_name} className="mt-2 max-h-72 rounded border border-line" /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Sidebar control: a titled list of checkboxes with all / none. */
export function Checklist({ title, items, selected, onChange }) {
  const tr = useT();
  const all = items.every((i) => selected.has(i.id));
  const set = (next) => onChange(new Set(next));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{title}</span>
        <span className="flex gap-2 text-[11px]">
          <button onClick={() => set(items.map((i) => i.id))} className={cn("hover:text-fg", all ? "text-fg-faint" : "text-accent")}>{tr("Select all")}</button>
          <button onClick={() => set([])} className="text-accent hover:text-fg">{tr("Select none")}</button>
        </span>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {items.map((i) => {
          const on = selected.has(i.id);
          return (
            <li key={i.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-app-sm px-1.5 py-1 text-xs hover:bg-surface-2">
                <span className={cn("mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border", on ? "border-accent bg-accent text-white" : "border-line bg-white")}>{on ? <Check size={10} /> : null}</span>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => set(on ? [...selected].filter((x) => x !== i.id) : [...selected, i.id])} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">{i.label}</span>
                  {i.sub ? <span className="block truncate text-[11px] text-fg-muted">{i.sub}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
        {!items.length ? <li className="px-1.5 text-xs text-fg-faint">—</li> : null}
      </ul>
    </div>
  );
}

/** Section on/off toggles. */
export function SectionToggles({ sections, enabled, onChange }) {
  const tr = useT();
  return <Checklist title={tr("Sections")} items={sections.map((s) => ({ id: s.key, label: s.label }))} selected={enabled} onChange={onChange} />;
}

export function LoadingDoc() {
  return <div className="space-y-3 animate-pulse"><div className="h-6 w-1/2 rounded bg-surface-2" /><div className="h-4 w-2/3 rounded bg-surface-2" /><div className="h-40 rounded bg-surface-2" /></div>;
}
