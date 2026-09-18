"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, BookmarkCheck, Star, Users, Trash2, Save, Plus, X, ChevronDown } from "lucide-react";
import Button from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { Checkbox } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** The comparable shape of a table state: empty filters, empty dates and null sort all mean "nothing". */
export function normaliseViewState(s) {
  // keys sorted: MySQL stores JSON objects in its own key order
  const filters = Object.fromEntries(Object.entries(s?.filters ?? {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, String(v)]).sort(([a], [b]) => a.localeCompare(b)));
  const date = s?.date && (s.date.from || s.date.to) ? { field: s.date.field, from: s.date.from || "", to: s.date.to || "" } : null;
  return { filters, query: s?.query ?? "", sort: s?.sort?.key ? { key: s.sort.key, dir: s.sort.dir } : null, date };
}
const same = (a, b) => JSON.stringify(normaliseViewState(a)) === JSON.stringify(normaliseViewState(b));
const setUrlView = (id) => {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("view", id);
    else u.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", u);
  } catch {}
};

/**
 * "Views" in a table toolbar: save the current filters + search + date range + sort under a name, come back
 * to it later, share it with the profile, make it the page's default. `state` is what the table shows now;
 * `apply(state)` puts a saved one in place; `reset()` clears everything.
 */
export default function SavedViews({ module, state, apply, reset }) {
  const tr = useT();
  const toast = useToast();
  const { canEdit } = useAccess();
  const wanted = useSearchParams().get("view");
  const { data: views, setData } = useFetch(`/api/views?module=${module}`);
  const [activeId, setActiveId] = useState(null);
  const applied = useRef(false); // ?view= or the default: once, when the list arrives
  const [name, setName] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = views ?? [];
  const active = list.find((v) => v.id === activeId) ?? null;
  const dirty = active ? !same(active.state, state) : false;
  const clean = same(state, { filters: {}, query: "", sort: null, date: null });
  // the first list load puts the view the URL asks for in place, else this person's default; the table's own
  // state belongs to another component, so it is set after this render, not during it
  useEffect(() => {
    if (!views || applied.current) return;
    applied.current = true;
    const start = views.find((v) => String(v.id) === String(wanted)) ?? (wanted ? null : views.find((v) => v.is_default));
    const t = setTimeout(() => {
      if (start) { setActiveId(start.id); apply(start.state); setUrlView(start.id); }
      else if (wanted) setUrlView(null);
    }, 0);
    return () => clearTimeout(t);
  }, [views, wanted, apply]);

  const choose = (v) => { setActiveId(v.id); apply(v.state); setUrlView(v.id); };
  const clear = () => { setActiveId(null); reset(); setUrlView(null); };
  const run = async (fn, doneMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.views) setData(res.views);
      if (doneMsg) toast.success(doneMsg);
      return res;
    } catch (e) {
      toast.error(tr("Could not save the view"), e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const saveNew = async () => {
    const label = name.trim();
    if (!label) return;
    const res = await run(() => api.post("/api/views", { module, name: label, state, shared: share }), tr("View saved"));
    if (res) { setActiveId(res.id); setUrlView(res.id); setName(""); setShare(false); }
  };
  const update = (v) => run(() => api.put(`/api/views/${v.id}`, { state }), tr("View updated"));
  const toggleDefault = (v) => run(() => api.put(`/api/views/${v.id}`, { is_default: !v.is_default }), v.is_default ? tr("No default view any more") : tr("{name} opens with this page now", { name: v.name }));
  const toggleShare = (v) => run(() => api.put(`/api/views/${v.id}`, { shared: !v.shared }), v.shared ? tr("View is private again") : tr("View shared with the profile"));
  const remove = async (v) => {
    const res = await run(() => api.del(`/api/views/${v.id}`), tr("View deleted"));
    if (res && v.id === activeId) { setActiveId(null); setUrlView(null); }
  };

  return (
    <Popover
      width="w-80"
      align="start"
      trigger={({ toggle, open }) => (
        <Button variant={active ? "subtle" : open ? "secondary" : "outline"} size="sm" icon={active ? BookmarkCheck : Bookmark} onClick={toggle} className="dt-btn dt-views">
          <span className="max-w-[10rem] truncate">{active ? active.name : tr("Views")}</span>
          {dirty ? <span className="text-accent" title={tr("Changed since it was saved")}>•</span> : null}
          {list.length && !active ? <span className="rounded-full bg-surface-3 px-1.5 text-[10px] text-fg-muted">{list.length}</span> : null}
          <ChevronDown size={12} className="opacity-60" />
        </Button>
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Saved views")}</span>
        {active || !clean ? <button onClick={clear} className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg"><X size={11} /> {tr("Clear")}</button> : null}
      </div>
      {list.length ? (
        <ul className="dt-view-list max-h-64 overflow-y-auto p-1.5">
          {list.map((v) => (
            <li key={v.id} className={cn("group flex items-center gap-1 rounded-app-sm px-2 py-1.5 text-sm hover:bg-surface-2", v.id === activeId && "bg-accent/10")}>
              <button onClick={() => choose(v)} className="min-w-0 flex-1 truncate text-left" title={v.mine ? "" : tr("Shared by {name}", { name: v.owner_name })}>
                {v.name}
                {!v.mine ? <span className="ml-1 text-[10px] text-fg-muted">· {v.owner_name}</span> : null}
              </button>
              {v.shared ? <Users size={12} className="shrink-0 text-fg-muted" title={tr("Shared with the profile")} /> : null}
              {v.id === activeId && dirty && (v.mine || canEdit) ? <button onClick={() => update(v)} disabled={busy} className="dt-view-update rounded p-1 text-accent hover:bg-accent/10" title={tr("Save the current filters into this view")}><Save size={13} /></button> : null}
              {v.mine ? <button onClick={() => toggleDefault(v)} disabled={busy} className={cn("dt-view-default rounded p-1 hover:bg-surface-3", v.is_default ? "text-amber-500" : "text-fg-faint opacity-0 group-hover:opacity-100")} title={v.is_default ? tr("Opens with this page") : tr("Open this page with this view")}><Star size={13} fill={v.is_default ? "currentColor" : "none"} /></button> : null}
              {v.mine && canEdit ? <button onClick={() => toggleShare(v)} disabled={busy} className={cn("dt-view-share rounded p-1 hover:bg-surface-3", v.shared ? "text-accent" : "text-fg-faint opacity-0 group-hover:opacity-100")} title={v.shared ? tr("Make private") : tr("Share with the profile")}><Users size={13} /></button> : null}
              {v.mine || canEdit ? <button onClick={() => remove(v)} disabled={busy} className="dt-view-delete rounded p-1 text-fg-faint opacity-0 hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100" title={tr("Delete")}><Trash2 size={13} /></button> : null}
            </li>
          ))}
        </ul>
      ) : <p className="px-3 py-3 text-xs text-fg-muted">{tr("Set filters, a search or a date range, then save them here to come back to them in one click.")}</p>}
      <div className="border-t border-line p-2">
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNew()} placeholder={tr("Save current as…")} className="control dt-view-name h-8 flex-1 text-xs" maxLength={80} />
          <Button size="sm" icon={Plus} onClick={saveNew} loading={busy} disabled={!name.trim()} className="dt-view-save">{tr("Save")}</Button>
        </div>
        {canEdit ? <Checkbox checked={share} onChange={setShare} label={tr("Share with everyone in this profile")} className="mt-1.5 text-xs" /> : null}
      </div>
    </Popover>
  );
}
