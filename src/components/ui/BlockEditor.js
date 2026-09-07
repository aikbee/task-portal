"use client";
import { useMemo, useRef, useState } from "react";
import { useFetch, useDebouncedValue } from "@/lib/hooks";
import { Table2, Plus, Trash2, Copy, Check } from "lucide-react";
import { cn, fullName } from "@/lib/utils";
import { useNav } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import { parseDoc, serializeDoc, emptyTable, tableToTsv, tableFromClipboard } from "@/lib/text-tables";
import { mentionQueryAt, searchToMentions } from "@/lib/mentions";
import { MentionChips, MentionPicker } from "./Mentions";
import RichParagraph from "./RichParagraph";
import TableEditor from "./TableEditor";
import { TablePicker } from "./TextBlocks";
import { Popover } from "./Popover";
import Button from "./Button";
import { useToast } from "./Toast";

/**
 * One document, edited in place: paragraphs are textareas, tables are live grids between them.
 * The value is a single Markdown string (tables as pipe tables), so it stays searchable and copyable.
 *  - "Insert table" (or the + handle between paragraphs) adds a grid at the caret
 *  - pasting a copied table / TSV / CSV adds a grid at the caret (toast to paste as text instead)
 *  - typing a Markdown table by hand turns into a grid as soon as its separator row is complete
 *  - typing @ opens a picker; the chosen record becomes an `@[Label](type:id)` token that renders as an
 *    inline link inside the paragraph (and as a chip in the "Linked" strip below)
 */
export default function BlockEditor({ value, onChange, onBlur, onSave, placeholder, mono = true, className }) {
  const tr = useT();
  const toast = useToast();
  const nav = useNav();
  const paras = useRef({}); // index -> RichParagraph handle
  const blocks = useMemo(() => parseDoc(value ?? ""), [value]);
  const ordinals = useMemo(() => {
    let n = -1;
    return blocks.map((b) => (b.type === "table" ? ++n : -1));
  }, [blocks]);
  const caret = useRef({ index: 0, pos: null }); // last focused paragraph + caret position
  const [focusTable, setFocusTable] = useState(null); // { ordinal, nonce } → focus that table's first header
  const [copied, setCopied] = useState(null);
  const box = useRef(null);
  const empty = !(value ?? "").trim();

  // @mention autocomplete: { index, start, query } for the paragraph being typed in
  const [mention, setMention] = useState(null);
  const [hl, setHl] = useState({ q: "", i: 0 });
  const dq = useDebouncedValue(mention?.query ?? "", 150);
  const { data: found, loading: searching } = useFetch(mention && dq ? `/api/search?q=${encodeURIComponent(dq)}` : null);
  const items = useMemo(() => (mention && dq ? searchToMentions(found, fullName) : []), [found, mention, dq]);
  const highlight = hl.q === (mention?.query ?? "") ? Math.min(hl.i, Math.max(0, items.length - 1)) : 0;

  const commit = (next) => onChange(serializeDoc(next));
  const setText = (index, text) => commit(blocks.map((b, i) => (i === index ? { type: "text", text } : b)));
  const setTable = (index, table) => commit(blocks.map((b, i) => (i === index ? { type: "table", table } : b)));

  /** Insert a table into paragraph `index` at `pos` (defaults: last caret, else end of that paragraph). */
  const insertTable = (table, at) => {
    const index = Math.min(at?.index ?? caret.current.index, blocks.length - 1);
    const target = blocks[index];
    let next;
    if (target.type !== "text") {
      next = [...blocks.slice(0, index + 1), { type: "text", text: "" }, { type: "table", table }, ...blocks.slice(index + 1)];
    } else {
      const pos = at?.pos ?? caret.current.pos ?? target.text.length;
      next = [...blocks.slice(0, index), { type: "text", text: target.text.slice(0, pos) }, { type: "table", table }, { type: "text", text: target.text.slice(pos) }, ...blocks.slice(index + 1)];
    }
    const ordinal = next.slice(0, next.findIndex((b) => b.table === table)).filter((b) => b.type === "table").length;
    commit(next);
    setFocusTable((f) => ({ ordinal, nonce: (f?.nonce ?? 0) + 1 }));
  };

  const removeTable = (index) => {
    const prev = value;
    commit(blocks.filter((_, i) => i !== index));
    toast.show({ type: "info", title: tr("Table deleted"), action: { label: tr("Undo"), onClick: () => onChange(prev) } });
  };

  const copyTable = async (index, table) => {
    try {
      await navigator.clipboard.writeText(tableToTsv(table));
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const onPasteText = (e, index) => {
    const hit = tableFromClipboard(e.clipboardData);
    const para = paras.current[index];
    if (!hit) {
      // plain-text paste only — never let the browser drop HTML formatting into the paragraph
      e.preventDefault();
      para?.insertText(e.clipboardData.getData("text/plain") ?? "");
      return;
    }
    e.preventDefault();
    const prev = value;
    const pos = para?.textBefore()?.length ?? blocks[index].text.length;
    insertTable(hit.table, { index, pos });
    toast.show({
      type: "success",
      title: tr("Pasted as a table"),
      description: tr("{r} rows · {c} columns", { r: hit.table.rows.length, c: hit.table.columns.length }),
      action: {
        label: tr("Paste as text instead"),
        onClick: () => {
          const b = parseDoc(prev);
          const t = b[index];
          onChange(serializeDoc(b.map((x, i) => (i === index ? { type: "text", text: `${t.text.slice(0, pos)}${hit.text}${t.text.slice(pos)}` } : x))));
        },
      },
    });
  };

  const trackCaret = (index) => {
    const before = paras.current[index]?.textBefore();
    if (before == null) return;
    const collapsed = window.getSelection()?.isCollapsed ?? true;
    caret.current = { index, pos: before.length };
    const q = collapsed ? mentionQueryAt(before, before.length) : null;
    setMention((m) => (q ? (m && m.index === index && m.start === q.start && m.query === q.query ? m : { index, ...q }) : m ? null : m));
  };

  /** Replace the `@query` being typed with an inline mention link and keep the caret after it. */
  const pickMention = (item) => {
    if (!mention || !item) return;
    paras.current[mention.index]?.insertMention(item, mention.query.length);
    setMention(null);
  };

  const openMention = (href, e) => {
    const target = nav.href(href);
    if (e?.metaKey || e?.ctrlKey) window.open(target, "_blank", "noopener");
    else nav.push(target);
  };

  const onParaKeyDown = (e, index) => {
    if (!mention || mention.index !== index) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
      return;
    }
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHl({ q: mention.query, i: (highlight + 1) % items.length });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHl({ q: mention.query, i: (highlight - 1 + items.length) % items.length });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(items[highlight]);
    }
  };

  return (
    <div
      ref={box}
      className={cn("rounded-app border border-line bg-surface", className)}
      onBlur={(e) => {
        if (onBlur && !e.currentTarget.contains(e.relatedTarget)) onBlur();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSave?.();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
        <Popover width="w-auto" align="start" trigger={({ toggle }) => <Button variant="ghost" size="sm" icon={Table2} onClick={toggle}>{tr("Insert table")}</Button>}>
          {({ close }) => (
            <TablePicker
              onPick={(r, c) => {
                insertTable(emptyTable(r, c));
                close();
              }}
            />
          )}
        </Popover>
        <span className="ml-auto hidden text-[11px] text-fg-faint md:inline">{tr("@ tags a person, project, task, requirement or info item · paste a copied table to add a grid")}</span>
      </div>

      <div className="px-2 py-1.5">
        {blocks.map((b, i) => {
          if (b.type === "table") {
            const ord = ordinals[i];
            return (
              <div key={`tbl-${ord}`} className="group/t relative my-1">
                <TableEditor value={b.table} onChange={(t) => setTable(i, t)} focusNonce={focusTable?.ordinal === ord ? focusTable.nonce : undefined} />
                <div className="absolute -top-2.5 right-2 flex gap-1 opacity-0 transition group-focus-within/t:opacity-100 group-hover/t:opacity-100">
                  <button type="button" onClick={() => copyTable(i, b.table)} className="rounded-full border border-line bg-surface p-1 text-fg-muted shadow-app hover:text-fg" aria-label={tr("Copy as TSV")} title={tr("Copy as TSV")}>
                    {copied === i ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                  <button type="button" onClick={() => removeTable(i)} className="rounded-full border border-line bg-surface p-1 text-fg-muted shadow-app hover:text-rose-500" aria-label={tr("Delete table")} title={tr("Delete table")}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          }
          const only = blocks.length === 1;
          return (
            <div key={`t-${i}`} className="relative">
              <RichParagraph
                ref={(h) => {
                  paras.current[i] = h;
                }}
                index={i}
                value={b.text}
                onChange={(text) => setText(i, text)}
                onCaret={() => trackCaret(i)}
                onBlur={() => setMention(null)}
                onKeyDown={(e) => onParaKeyDown(e, i)}
                onPaste={(e) => onPasteText(e, i)}
                onMentionClick={openMention}
                placeholder={only ? placeholder : i === 0 && empty ? placeholder : tr("Add text…")}
                mono={mono}
                className={only ? "min-h-[7rem]" : undefined}
              />
              {mention?.index === i ? <MentionPicker query={mention.query} items={items} loading={searching} highlight={highlight} onHover={(n) => setHl({ q: mention.query, i: n })} onPick={pickMention} /> : null}
              {/* insert handle: appears on hover between paragraphs / after the last one */}
              <div className="group/h relative flex h-3 items-center">
                <div className="h-px flex-1 transition group-hover/h:bg-accent/40" />
                <button
                  type="button"
                  onClick={() => insertTable(emptyTable(3, 3), { index: i, pos: b.text.length })}
                  className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-2 py-px text-[10px] text-fg-muted opacity-0 transition hover:border-accent hover:text-accent focus:opacity-100 group-hover/h:opacity-100"
                  aria-label={tr("Insert table here")}
                >
                  <Plus size={10} /> {tr("Table")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <MentionChips text={value} label={tr("Linked")} className="border-t border-line px-3 py-2" />
    </div>
  );
}
