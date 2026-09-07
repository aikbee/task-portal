"use client";
import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Users, FolderKanban, CheckSquare, ClipboardList, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNav } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import { MENTION_TYPES, parseMentions } from "@/lib/mentions";

export const MENTION_ICONS = { employee: Users, project: FolderKanban, task: CheckSquare, requirement: ClipboardList, info: BookOpen };

/** Clickable chips for every `@[Label](type:id)` in the text — the way to open a tagged record while editing. */
export function MentionChips({ text, label, className, size = "sm" }) {
  const nav = useNav();
  const tr = useT();
  const mentions = useMemo(() => parseMentions(text), [text]);
  if (!mentions.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label ? <span className="text-[10px] uppercase tracking-wider text-fg-faint">{label}</span> : null}
      {mentions.map((m) => {
        const Icon = MENTION_ICONS[m.type];
        return (
          <Link
            key={`${m.type}:${m.id}`}
            href={nav.href(m.href)}
            onClick={(e) => e.stopPropagation()}
            title={tr(MENTION_TYPES[m.type].label)}
            className={cn("inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-line bg-surface-2/60 text-fg-muted transition hover:border-accent hover:text-accent", size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]")}
          >
            <Icon size={size === "xs" ? 10 : 11} className="shrink-0" />
            <span className="truncate">{m.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Suggestion list shown under a paragraph while typing `@…`. Keyboard is handled by the editor. */
export function MentionPicker({ query, items, loading, highlight, onHover, onPick }) {
  const tr = useT();
  const list = useRef(null);
  useEffect(() => {
    list.current?.querySelector('[data-hl="1"]')?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  return (
    <div className="absolute left-1 z-30 mt-1 w-80 max-w-[calc(100%-0.5rem)] overflow-hidden rounded-app border border-line bg-surface shadow-app-lg anim-fade">
      <div className="border-b border-line px-2.5 py-1.5 text-[11px] text-fg-muted">{query ? tr("Tag “{q}”", { q: query }) : tr("Type to search people, projects, tasks, requirements and info")}</div>
      <ul ref={list} className="max-h-64 overflow-y-auto py-1">
        {items.map((it, i) => {
          const Icon = MENTION_ICONS[it.type];
          return (
            <li key={`${it.type}:${it.id}`}>
              <button
                type="button"
                data-hl={i === highlight ? "1" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(it)}
                className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs", i === highlight ? "bg-accent/15" : "hover:bg-surface-2")}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: it.color || "var(--accent)" }}><Icon size={12} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{it.label}</span>
                  {it.sub ? <span className="block truncate text-[10px] text-fg-muted">{it.sub}</span> : null}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-faint">{tr(MENTION_TYPES[it.type].label)}</span>
              </button>
            </li>
          );
        })}
        {!items.length && query ? <li className="px-2.5 py-2 text-xs text-fg-faint">{loading ? tr("Searching…") : tr("No matches")}</li> : null}
      </ul>
      <div className="border-t border-line px-2.5 py-1 text-[10px] text-fg-faint">↑ ↓ · Enter · Esc</div>
    </div>
  );
}
