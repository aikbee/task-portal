"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { usePrefs } from "@/lib/store";
import { Plus, FileText, ChevronDown, ChevronRight, Copy, Trash2, Check, Code2, Type } from "lucide-react";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import SortableList from "./SortableList";
import BlockEditor from "@/components/ui/BlockEditor";
import { MentionChips } from "@/components/ui/Mentions";
import { displayMentions } from "@/lib/mentions";
import { parseTableJson, emptyTable, tableToMarkdown, countTables } from "@/lib/text-tables";
import { useT } from "@/lib/i18n";

const DEFAULT_LABELS = { title: "Outputs", singular: "output", plural: "outputs", add: "Add output", first: "Add first output", empty: "No outputs yet", emptyHint: "Record logs, results, notes or any long text. Each block keeps its own position.", placeholder: "Paste logs, results, long notes…" };

/**
 * Multiple ordered long-form text blocks (task outputs by default). Reusable via
 * `baseUrl` (collection: POST create / PUT reorder) and `itemUrl` (PUT / DELETE one).
 */
export default function TaskOutputs({ taskId, outputs, onChange, baseUrl, itemUrl = "/api/outputs", labels: labelOverrides }) {
  const tr = useT();
  const labels = { ...DEFAULT_LABELS, ...(labelOverrides ?? {}) };
  const collection = baseUrl ?? `/api/tasks/${taskId}/outputs`;
  const [expanded, setExpanded] = useState(() => new Set());
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const add = async () => {
    setAdding(true);
    try {
      const { items, created_id } = await api.post(collection, { title: "", content: "" });
      onChange(items);
      setExpanded((s) => new Set([...s, created_id]));
    } catch (e) {
      toast.error(`Could not add ${labels.singular}`, e.message);
    } finally {
      setAdding(false);
    }
  };
  const reorder = async (ids) => {
    const map = Object.fromEntries(outputs.map((o) => [o.id, o]));
    onChange(ids.map((id, i) => ({ ...map[id], sort_order: i + 1 })));
    try {
      onChange(await api.put(collection, { order: ids }));
    } catch (e) {
      toast.error("Could not save order", e.message);
    }
  };
  const setPosition = async (id, position) => {
    try {
      onChange(await api.put(`${itemUrl}/${id}`, { position }));
    } catch (e) {
      toast.error("Could not move output", e.message);
    }
  };
  const save = async (id, patch) => {
    const list = await api.put(`${itemUrl}/${id}`, patch);
    onChange(list);
  };
  const remove = async () => {
    setBusy(true);
    try {
      onChange(await api.del(`${itemUrl}/${toDelete.id}`));
      toast.success(`${labels.title.replace(/s$/, "")} deleted`);
      setToDelete(null);
    } catch (e) {
      toast.error("Could not delete", e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Card>
      <CardHeader
        icon={FileText}
        title={tr(labels.title)}
        description={`${outputs.length} long-form text block${outputs.length === 1 ? "" : "s"} · reorder freely`}
        actions={
          <>
            {outputs.length > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded.size === outputs.length ? new Set() : new Set(outputs.map((o) => o.id)))}>
                {tr(expanded.size === outputs.length ? "Collapse all" : "Expand all")}
              </Button>
            ) : null}
            <Button size="sm" icon={Plus} loading={adding} onClick={add}>{tr(labels.add)}</Button>
          </>
        }
      />
      {outputs.length === 0 ? (
        <EmptyState compact icon={FileText} title={labels.empty} description={labels.emptyHint} action={<Button size="sm" icon={Plus} onClick={add}>{labels.first}</Button>} />
      ) : (
        <SortableList
          items={outputs}
          onReorder={reorder}
          onSetPosition={setPosition}
          renderItem={(o) => (
            <OutputRow output={o} placeholder={labels.placeholder} singular={labels.singular} open={expanded.has(o.id)} onToggle={() => toggle(o.id)} onSave={(patch) => save(o.id, patch)} onDelete={() => setToDelete(o)} />
          )}
        />
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy} title={`Delete ${labels.singular}?`} description={toDelete ? `"${toDelete.title || `Untitled ${labels.singular}`}" will be permanently removed.` : ""} />
    </Card>
  );
}

function OutputRow({ output, open, onToggle, onSave, onDelete, placeholder = DEFAULT_LABELS.placeholder, singular = "output" }) {
  const tr = useT();
  const autosaveSeconds = usePrefs((s) => s.autosaveSeconds);
  const [draft, setDraft] = useState(null); // { title, content } while editing; null = showing the server copy
  const [saving, setSaving] = useState(false);
  const [mono, setMono] = useState(true);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const serverTitle = output.title ?? "";
  // legacy whole-table blocks (format "table", JSON) are shown — and re-saved — as Markdown text
  const serverContent = output.format === "table" ? tableToMarkdown(parseTableJson(output.content) ?? emptyTable()) : (output.content ?? "");
  const title = draft ? draft.title : serverTitle;
  const content = draft ? draft.content : serverContent;
  const dirty = draft != null && (draft.title !== serverTitle || draft.content !== serverContent);
  const edit = (patch) => setDraft({ title, content, ...patch });

  /** Save the current draft. Keeps the draft if the user typed more while the request was in flight. */
  const flush = async () => {
    if (!draft || saving) return;
    const snapshot = draft;
    setSaving(true);
    try {
      await onSave({ title: snapshot.title, content: snapshot.content, format: "text" });
      setDraft((d) => (d && (d.title !== snapshot.title || d.content !== snapshot.content) ? d : null));
    } catch (e) {
      toast.error(`Could not save ${singular}`, e.message);
    } finally {
      setSaving(false);
    }
  };
  const autosave = useEffectEvent(() => flush());

  // autosave after the configured pause in typing (0 = manual save only)
  useEffect(() => {
    if (!dirty || saving || !autosaveSeconds) return;
    const t = setTimeout(() => autosave(), autosaveSeconds * 1000);
    return () => clearTimeout(t);
  }, [dirty, saving, title, content, autosaveSeconds]);

  // don't lose unsaved text on reload / close
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const lines = content ? content.split("\n").length : 0;
  const tables = countTables(content);
  const firstLine = displayMentions((content || "").split("\n").find((l) => l.trim()) || "");
  const meta = `${lines} line${lines === 1 ? "" : "s"} · ${(content || "").length.toLocaleString()} chars${tables ? ` · ${tr(tables === 1 ? "{n} table" : "{n} tables", { n: tables })}` : ""}`;
  const status = saving ? tr("Saving…") : dirty ? (autosaveSeconds ? `Unsaved · autosaves after ${autosaveSeconds}s` : "Unsaved") : output.updated_at ? relativeTime(output.updated_at) : "";

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="rounded p-0.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input
          value={title}
          onChange={(e) => edit({ title: e.target.value })}
          onBlur={() => dirty && flush()}
          placeholder={`Untitled ${singular}`}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-fg-faint"
        />
        <span className="hidden shrink-0 text-[11px] text-fg-faint sm:inline">{meta}</span>
        <span className={cn("shrink-0 text-[11px]", saving ? "text-accent" : dirty ? "text-amber-500" : "text-fg-faint")}>{status}</span>
        <Button variant="ghost" size="iconXs" icon={copied ? Check : Copy} onClick={copy} aria-label={tr("Copy")} data-tip={copied ? tr("Copied") : tr("Copy")} />
        <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={onDelete} aria-label={tr("Delete")} data-tip={tr("Delete")} />
      </div>
      {!open && firstLine ? (
        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5" onClick={onToggle}>
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">{firstLine}</p>
          <MentionChips text={content} size="xs" className="shrink-0" />
        </div>
      ) : null}
      {open ? (
        <div className="border-t border-line p-3">
          <BlockEditor value={content} onChange={(c) => edit({ content: c })} onBlur={() => dirty && flush()} onSave={flush} placeholder={placeholder} mono={mono} />
          <div className="mt-2 flex items-center justify-between">
            <button onClick={() => setMono((m) => !m)} className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
              {mono ? <Type size={13} /> : <Code2 size={13} />} {tr(mono ? "Proportional font" : "Monospace font")}
            </button>
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-fg-faint">{tr("⌘S saves")}</span>
              <Button size="sm" variant={dirty ? "primary" : "secondary"} onClick={flush} loading={saving} disabled={!dirty}>
                {tr(dirty ? "Save" : "Saved")}
              </Button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
