"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, X, Pin, KeyRound, Paperclip, FileText, History, Trash2, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch, useDebouncedValue } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import { INFO_CATEGORY, MODULE_MAP } from "@/lib/modules";
import { cn, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Select, Checkbox, Toggle } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { ProjectChip } from "./shared";

const RECENT_KEY = "admin-portal-info-recent";
const FIELD_OPTIONS = [
  ["title", "Title & summary"],
  ["content", "Content"],
  ["notes", "Notes"],
  ["attachments", "Attachments"],
];
const FIELD_LABEL = { title: "Title", summary: "Summary", tags: "Tags", url: "URL", username: "Username", content: "Content", note: "Note", attachment: "Attachment" };

// Recent searches live in localStorage; a tiny external store keeps React in sync without setState-in-effect.
const EMPTY = [];
const listeners = new Set();
let cachedRaw = null;
let cachedList = EMPTY;
function readRecent() {
  let raw = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedList = raw ? JSON.parse(raw) : EMPTY;
    } catch {
      cachedList = EMPTY;
    }
  }
  return cachedList;
}
function writeRecent(list) {
  try {
    if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_KEY);
  } catch {}
  listeners.forEach((l) => l());
}
function useRecent() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readRecent,
    () => EMPTY,
  );
}

/** Highlight every search term inside a snippet. */
function Highlight({ text, terms }) {
  if (!text) return null;
  const safe = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!safe.length) return text;
  const parts = String(text).split(new RegExp(`(${safe.join("|")})`, "ig"));
  return parts.map((p, i) => (safe.some((t) => new RegExp(`^${t}$`, "i").test(p)) ? <mark key={i} className="rounded-sm bg-amber-400/40 px-0.5 text-fg">{p}</mark> : <span key={i}>{p}</span>));
}

export default function InfoSearch() {
  const tr = useT();
  const nav = useNav();
  const sp = useSearchParams();
  const mod = MODULE_MAP.info;
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [fields, setFields] = useState(() => new Set(FIELD_OPTIONS.map(([k]) => k)));
  const [filters, setFilters] = useState({ category: "", project_id: "", tag: "", pinned: false });
  const recent = useRecent();
  const dq = useDebouncedValue(q.trim(), 250);
  const { data: projects } = useFetch("/api/projects");
  const { data: all } = useFetch("/api/info");
  const tags = useMemo(() => [...new Set((all ?? []).flatMap((r) => (r.tags ?? "").split(",").filter(Boolean)))].sort(), [all]);

  const url = useMemo(() => {
    if (!dq) return null;
    const p = new URLSearchParams({ q: dq, fields: [...fields].join(",") });
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v === true ? "1" : v);
    return `/api/info/search?${p}`;
  }, [dq, fields, filters]);
  const { data, loading, error } = useFetch(url);
  const items = data?.items ?? [];
  const terms = data?.terms ?? dq.split(/\s+/).filter(Boolean);

  // keep the query in the address bar (shareable / pinnable) and remember it
  useEffect(() => {
    const target = dq ? `?q=${encodeURIComponent(dq)}` : "";
    if (window.location.search !== target) window.history.replaceState(null, "", `${window.location.pathname}${target}`);
    if (!dq) return;
    writeRecent([dq, ...readRecent().filter((r) => r !== dq)].slice(0, 8));
  }, [dq]);

  const toggleField = (k) =>
    setFields((s) => {
      const n = new Set(s);
      if (n.has(k)) {
        if (n.size > 1) n.delete(k);
      } else n.add(k);
      return n;
    });
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title={tr("Search info")}
        description={tr("Search titles, content, notes and attachments…")}
        icon={Search}
        color={mod.color}
        crumbs={[{ label: tr("Info"), href: "/info" }]}
        actions={<Button variant="outline" icon={ArrowLeft} onClick={() => nav.push("/info")}>{tr("Info")}</Button>}
      />

      <Card className="mb-4 space-y-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Search titles, content, notes and attachments…")}
            className="control h-12 pl-12 pr-10 text-base"
          />
          {q ? <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={tr("Clear")}><X size={16} /></button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="font-medium text-fg-muted">{tr("Search in")}:</span>
          {FIELD_OPTIONS.map(([k, label]) => <Checkbox key={k} checked={fields.has(k)} onChange={() => toggleField(k)} label={tr(label)} className="text-xs" />)}
          <span className="flex-1" />
          <Select value={filters.category} onChange={setFilter("category")} className="h-8 w-36 text-xs"><option value="">{tr("All categories")}</option>{Object.entries(INFO_CATEGORY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select>
          <Select value={filters.project_id} onChange={setFilter("project_id")} className="h-8 w-40 text-xs"><option value="">{tr("All projects")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={filters.tag} onChange={setFilter("tag")} className="h-8 w-36 text-xs"><option value="">{tr("All tags")}</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</Select>
          <Toggle size="sm" checked={filters.pinned} onChange={(v) => setFilters((f) => ({ ...f, pinned: v }))} label={tr("Pinned only")} className="gap-2 text-xs" />
        </div>
      </Card>

      {!dq ? (
        <Card>
          <EmptyState icon={Search} title={tr("Type to search your info vault.")} description={tr("Search titles, content, notes and attachments…")} />
          {recent.length ? (
            <div className="mx-auto max-w-lg">
              <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-faint">
                <span className="flex items-center gap-1"><History size={12} /> {tr("Recent searches")}</span>
                <button onClick={() => writeRecent([])} className="flex items-center gap-1 hover:text-fg"><Trash2 size={11} /> {tr("clear")}</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => <button key={r} onClick={() => setQ(r)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-accent hover:text-accent">{r}</button>)}
              </div>
            </div>
          ) : null}
        </Card>
      ) : error ? (
        <EmptyState title={tr("Could not load data")} description={error.message} />
      ) : loading && !data ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={Search} title={tr("No matches")} description={tr("Try fewer words, or search another field.")} /></Card>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">{tr(items.length === 1 ? "{n} result" : "{n} results", { n: items.length })} · {tr("in {ms} ms", { ms: data?.took_ms ?? 0 })}</p>
          <div className="space-y-3 anim-stagger">
            {items.map((i) => (
              <Card key={i.id} className="p-0" hover>
                <Link href={`/info/${i.id}`} className="block p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: i.color }}><mod.icon size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold"><Highlight text={i.title} terms={terms} /></h3>
                        {i.pinned ? <Pin size={11} className="text-accent" /> : null}
                        <StatusBadge map={INFO_CATEGORY} value={i.category} dot={false} />
                        {i.project_name ? <ProjectChip id={i.project_id} name={i.project_name} code={i.project_code} color={i.project_color} link={false} /> : null}
                        <span className="ml-auto flex items-center gap-2 text-[11px] text-fg-muted">
                          {i.has_secret ? <KeyRound size={12} className="text-amber-500" /> : null}
                          <span className="inline-flex items-center gap-0.5"><FileText size={11} />{i.note_count}</span>
                          <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{i.attachment_count}</span>
                          <span>{relativeTime(i.updated_at)}</span>
                        </span>
                      </div>
                      {i.summary ? <p className="mt-0.5 text-xs text-fg-muted"><Highlight text={i.summary} terms={terms} /></p> : null}
                      {i.tags ? <p className="mt-1 flex flex-wrap gap-1">{i.tags.split(",").map((t) => <span key={t} className="rounded-full border border-line px-1.5 py-px text-[10px] text-fg-muted">#<Highlight text={t} terms={terms} /></span>)}</p> : null}
                      {i.matches.filter((m) => !["title", "summary", "tags"].includes(m.field)).length ? (
                        <ul className="mt-2 space-y-1">
                          {i.matches.filter((m) => !["title", "summary", "tags"].includes(m.field)).map((m, idx) => (
                            <li key={idx} className={cn("rounded-app-sm border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs", m.field === "content" && "font-normal")}>
                              <span className="mr-2 rounded bg-surface-3 px-1 py-px text-[10px] uppercase tracking-wider text-fg-faint">{tr(FIELD_LABEL[m.field] ?? m.field)}{m.label ? ` · ${m.label}` : ""}</span>
                              <span className={m.field === "note" || m.field === "content" ? "font-mono text-[11px]" : ""}><Highlight text={m.snippet} terms={terms} /></span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
