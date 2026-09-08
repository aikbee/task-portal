"use client";
import { useMemo, useState } from "react";
import { Plus, Search, Pin, ArrowLeft, X } from "lucide-react";
import { NOTE_COLORS } from "@/lib/modules";
import { useVisibleModules } from "@/lib/auth-context";
import { cn, relativeTime } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { useT } from "@/lib/i18n";
import { useNotesActions, sortNotes, NoteCard } from "./StickyNotes";

/**
 * Full-screen notes: a sidebar with search, module filter and the list of notes; the main
 * area shows every matching note as a wall by default, or one note in a large editor.
 */
export default function NotesWorkspace({ module }) {
  const tr = useT();
  const { notes, add, update, remove } = useNotesActions();
  const MODULES = useVisibleModules();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortNotes(
      notes.filter((n) => (scope === "all" || n.module === scope) && (!needle || `${n.title ?? ""} ${n.content ?? ""}`.toLowerCase().includes(needle)))
    );
  }, [notes, scope, q]);
  const current = selected != null ? notes.find((n) => n.id === selected) ?? null : null;
  const moduleOf = (key) => MODULES.find((m) => m.key === key);

  const create = async () => {
    const n = await add(scope === "all" ? module.key : scope, notes.length);
    if (n) setSelected(n.id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside className={cn("flex w-full shrink-0 flex-col border-r border-line bg-surface/60 md:w-80", current && "hidden md:flex")}>
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search notes…")} className="control h-9 pl-8 pr-8 text-sm" />
            {q ? <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-faint hover:text-fg" aria-label={tr("Clear")}><X size={13} /></button> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {[{ key: "all", label: tr("All modules"), icon: null }, ...MODULES].map((m) => {
              const n = m.key === "all" ? notes.length : notes.filter((x) => x.module === m.key).length;
              if (m.key !== "all" && !n) return null;
              const active = scope === m.key;
              return (
                <button key={m.key} onClick={() => setScope(m.key)} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition", active ? "bg-accent text-white" : "bg-surface-2 text-fg-muted hover:text-fg")}>
                  {m.icon ? <m.icon size={11} /> : null} {m.key === "all" ? m.label : tr(m.label)}
                  <span className={cn("rounded-full px-1 text-[10px]", active ? "bg-white/25" : "bg-surface-3")}>{n}</span>
                </button>
              );
            })}
          </div>
          <Button size="sm" icon={Plus} onClick={create} className="w-full">{tr("New note")}</Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? <li className="px-2 py-6 text-center text-xs text-fg-faint">{tr("No notes match")}</li> : null}
          {filtered.map((n) => {
            const col = NOTE_COLORS[n.color] ?? NOTE_COLORS.yellow;
            const m = moduleOf(n.module);
            const title = (n.title || "").trim() || (n.content || "").trim().split("\n")[0] || tr("Untitled note");
            return (
              <li key={n.id}>
                <button
                  onClick={() => setSelected(n.id)}
                  className={cn("flex w-full items-start gap-2.5 rounded-app-sm px-2.5 py-2 text-left transition", selected === n.id ? "bg-accent/12" : "hover:bg-surface-2")}
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ background: col.bg }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{title}</span>
                      {n.pinned ? <Pin size={10} className="shrink-0 fill-current text-accent" /> : null}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                      {m ? <><m.icon size={10} /> {tr(m.label)}</> : null}
                      {n.updated_at ? <span>· {relativeTime(n.updated_at)}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className={cn("min-w-0 flex-1 overflow-y-auto p-4 md:p-6", !current && "hidden md:block")}>
        {current ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <button onClick={() => setSelected(null)} className="flex w-fit items-center gap-1.5 text-xs text-fg-muted hover:text-fg"><ArrowLeft size={13} /> {tr("All notes")}</button>
            <NoteCard key={current.id} note={current} large onChange={(patch) => update(current.id, patch)} onDelete={() => { remove(current.id); setSelected(null); }} />
          </div>
        ) : filtered.length ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((n, i) => (
              <NoteCard key={n.id} note={n} index={i} onChange={(patch) => update(n.id, patch)} onDelete={() => remove(n.id)} onOpen={() => setSelected(n.id)} />
            ))}
          </div>
        ) : (
          <EmptyState title={tr("No notes match")} description={tr("Sticky notes are scoped to the module you're working in. Add one to keep context close.")} action={<Button size="sm" icon={Plus} onClick={create}>{tr("New note")}</Button>} />
        )}
      </section>
    </div>
  );
}
