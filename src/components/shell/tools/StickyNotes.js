"use client";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Plus, Pin, PinOff, Trash2, Maximize2 } from "lucide-react";
import { NOTE_COLORS } from "@/lib/modules";
import { useVisibleModules } from "@/lib/auth-context";
import { useUI, usePrefs } from "@/lib/store";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { useT } from "@/lib/i18n";

/** Notes live in the UI store (loaded once by the bottom bar); these actions keep it and the API in sync. */
export function useNotesActions() {
  const notesRaw = useUI((s) => s.notes);
  const notes = useMemo(() => notesRaw ?? [], [notesRaw]);
  const setNotes = useUI((s) => s.setNotes);
  const toast = useToast();
  const add = async (module, colorIndex = 0) => {
    try {
      const note = await api.post("/api/notes", { module, title: "", content: "", color: Object.keys(NOTE_COLORS)[colorIndex % 6] });
      setNotes((all) => [...all, note]);
      return note;
    } catch (e) {
      toast.error("Could not create note", e.message);
      return null;
    }
  };
  const update = async (id, patch) => {
    setNotes((all) => all.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      const saved = await api.put(`/api/notes/${id}`, patch);
      setNotes((all) => all.map((n) => (n.id === id ? { ...n, ...saved } : n)));
    } catch (e) {
      toast.error("Could not save note", e.message);
    }
  };
  const remove = async (id) => {
    setNotes((all) => all.filter((n) => n.id !== id));
    try {
      await api.del(`/api/notes/${id}`);
    } catch (e) {
      toast.error("Could not delete note", e.message);
    }
  };
  return { notes, add, update, remove };
}

export const sortNotes = (list) => [...list].sort((a, b) => b.pinned - a.pinned || a.sort_order - b.sort_order || a.id - b.id);

/** Per-module sticky notes: the compact bottom-bar panel. */
export default function StickyNotes({ module, onOpen }) {
  const tr = useT();
  const { notes, add: addNote, update, remove } = useNotesActions();
  const [scope, setScope] = useState(module.key); // BottomBar re-keys this component per module
  const MODULES = useVisibleModules();

  const list = useMemo(() => sortNotes(notes.filter((n) => n.module === scope)), [notes, scope]);
  const add = () => addNote(scope, list.length);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto">
          {MODULES.map((m) => {
            const n = notes.filter((x) => x.module === m.key).length;
            const active = scope === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setScope(m.key)}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition", active ? "bg-accent text-white" : "bg-surface-2 text-fg-muted hover:text-fg")}
              >
                <m.icon size={12} /> {tr(m.label)}
                {n ? <span className={cn("rounded-full px-1 text-[10px]", active ? "bg-white/25" : "bg-surface-3")}>{n}</span> : null}
              </button>
            );
          })}
        </div>
        <Button size="sm" icon={Plus} onClick={add}>
          {tr("New note")}
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState compact title={`No notes for ${MODULES.find((m) => m.key === scope)?.label}`} description={tr("Sticky notes are scoped to the module you're working in. Add one to keep context close.")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((n, i) => (
            <NoteCard key={n.id} note={n} index={i} onChange={(patch) => update(n.id, patch)} onDelete={() => remove(n.id)} onOpen={onOpen ? () => onOpen(n.id) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One sticky note. `large` turns it into a full-height editor (no tilt); `onOpen` adds an expand button. */
export function NoteCard({ note, index = 0, onChange, onDelete, onOpen, large = false }) {
  const tr = useT();
  const autosaveSeconds = usePrefs((s) => s.autosaveSeconds);
  const theme = usePrefs((s) => s.theme);
  const [title, setTitle] = useState(note.title ?? "");
  const [content, setContent] = useState(note.content ?? "");
  const [saved, setSaved] = useState(true);
  const c = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
  const isDark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

  // debounce autosave of text fields while unsaved
  const autosave = useEffectEvent(async () => {
    await onChange({ title, content });
    setSaved(true);
  });
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => autosave(), Math.max(1, autosaveSeconds || 1.5) * 1000);
    return () => clearTimeout(t);
  }, [saved, title, content, autosaveSeconds]);
  const edit = (setter) => (e) => {
    setter(e.target.value);
    setSaved(false);
  };

  const rotate = large ? 0 : [-1.2, 0.8, -0.6, 1.1, -0.9, 0.5][index % 6];

  return (
    <div
      className={cn("sticky-note relative flex flex-col rounded-[6px]", large ? "min-h-[60vh] p-6" : "p-3")}
      style={{ background: isDark ? c.darkBg : c.bg, color: isDark ? c.darkInk : c.ink, transform: `rotate(${rotate}deg)` }}
    >
      {/* tape */}
      <span className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[-2deg] rounded-sm bg-white/50 shadow-sm backdrop-blur-sm" style={{ opacity: isDark ? 0.15 : 0.7 }} />
      <input
        value={title}
        onChange={edit(setTitle)}
        placeholder={tr("Title")}
        className={cn("w-full bg-transparent font-semibold outline-none placeholder:opacity-50", large ? "text-xl" : "text-sm")}
      />
      <textarea
        value={content}
        onChange={edit(setContent)}
        placeholder={tr("Write something…")}
        rows={large ? 18 : 4}
        className={cn("mt-1 w-full resize-none bg-transparent leading-relaxed outline-none placeholder:opacity-50", large ? "flex-1 text-sm" : "text-xs")}
      />
      <div className="mt-2 flex items-center gap-1">
        {Object.entries(NOTE_COLORS).map(([key, col]) => (
          <button
            key={key}
            onClick={() => onChange({ color: key })}
            className={cn("h-3.5 w-3.5 rounded-full border border-black/10 transition hover:scale-125", note.color === key && "ring-1 ring-current")}
            style={{ background: col.bg }}
            aria-label={tr(col.label)}
          />
        ))}
        <span className="flex-1" />
        <span className="text-[10px] opacity-60">{saved ? (note.updated_at ? relativeTime(note.updated_at) : "") : "Saving…"}</span>
        <button onClick={() => onChange({ pinned: !note.pinned })} className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100" data-tip={note.pinned ? "Unpin" : "Pin"}>
          {note.pinned ? <Pin size={13} className="fill-current" /> : <PinOff size={13} />}
        </button>
        <button onClick={onDelete} className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100" data-tip={tr("Delete")}>
          <Trash2 size={13} />
        </button>
        {onOpen ? (
          <button onClick={onOpen} className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100" data-tip={tr("Open in editor")} aria-label={tr("Open in editor")}>
            <Maximize2 size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
