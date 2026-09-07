"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { MENTION_RE, mentionHref, mentionToken } from "@/lib/mentions";

/**
 * A paragraph of plain text where `@[Label](type:id)` tokens render as inline, clickable links.
 * Uncontrolled contentEditable: the DOM is rebuilt only when `value` changes from outside; typing,
 * paste and mention insertion go through execCommand so the browser's undo stack keeps working.
 * Exposes: textBefore() (serialized text up to the caret), insertText(), insertMention(), focus().
 */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const chipHtml = (type, id, label) =>
  `<a href="${mentionHref(type, id)}" class="mention" contenteditable="false" draggable="false" data-type="${type}" data-id="${id}" data-label="${esc(label)}">@${esc(label)}</a>`;

function htmlFor(text) {
  let html = "";
  let last = 0;
  for (const m of String(text ?? "").matchAll(MENTION_RE)) {
    html += esc(text.slice(last, m.index)) + chipHtml(m[2], Number(m[3]), m[1]);
    last = m.index + m[0].length;
  }
  html += esc(String(text ?? "").slice(last));
  return `${html}<br data-trail="1">`; // keeps a trailing newline visible; never serialized
}

function collect(node, out) {
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) out.push(n.data);
    else if (n.nodeName === "BR") {
      if (!(n.dataset?.trail && !n.nextSibling)) out.push("\n");
    } else if (n.nodeName === "A" && n.classList.contains("mention")) out.push(mentionToken(n.dataset.type, Number(n.dataset.id), n.dataset.label));
    else {
      if ((n.nodeName === "DIV" || n.nodeName === "P") && out.length && !out[out.length - 1].endsWith("\n")) out.push("\n");
      collect(n, out);
    }
  });
  return out;
}
export const textOf = (root) => collect(root, []).join("").replace(/ /g, " ");

/** The mention link immediately before/after a collapsed caret inside `root`, or null. */
function adjacentMention(root, side) {
  const sel = window.getSelection();
  if (!root || !sel?.rangeCount || !sel.isCollapsed) return null;
  const { startContainer: node, startOffset: offset } = sel.getRangeAt(0);
  if (!root.contains(node)) return null;
  let candidate = null;
  if (node.nodeType === 3) {
    if (side === "before" && offset === 0) candidate = node.previousSibling;
    if (side === "after" && offset === node.data.length) candidate = node.nextSibling;
  } else {
    candidate = side === "before" ? node.childNodes[offset - 1] : node.childNodes[offset];
  }
  return candidate?.nodeName === "A" && candidate.classList?.contains("mention") ? candidate : null;
}

const RichParagraph = forwardRef(function RichParagraph({ value, onChange, placeholder, mono, className, onCaret, onKeyDown, onPaste, onBlur, onFocus, onMentionClick, index }, ref) {
  const root = useRef(null);
  const lastEmitted = useRef(undefined);

  // rebuild the DOM only for external changes (initial mount, undo, table insertion, …)
  useEffect(() => {
    const el = root.current;
    if (!el || lastEmitted.current === value) return;
    el.innerHTML = htmlFor(value ?? "");
    lastEmitted.current = value ?? "";
  }, [value]);

  const emit = () => {
    const el = root.current;
    if (!el) return;
    const text = textOf(el);
    lastEmitted.current = text;
    onChange(text);
  };
  const textBefore = () => {
    const el = root.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount || !el.contains(sel.focusNode)) return null;
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(sel.focusNode, sel.focusOffset);
    return collect(r.cloneContents(), []).join("").replace(/ /g, " ");
  };

  useImperativeHandle(ref, () => ({
    el: root.current,
    focus: () => root.current?.focus(),
    textBefore,
    insertText: (text) => {
      root.current?.focus();
      document.execCommand("insertText", false, text);
      emit();
    },
    /** Replace the `@query` (queryLen chars + the @) before the caret with a mention chip. */
    insertMention: (item, queryLen) => {
      const el = root.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      for (let i = 0; i < queryLen + 1; i++) sel.modify("extend", "backward", "character");
      document.execCommand("insertHTML", false, `${chipHtml(item.type, item.id, item.label)} `);
      emit();
    },
  }));

  return (
    <div className="relative">
      {!value ? <span className="pointer-events-none absolute left-1.5 top-1 text-[13px] leading-relaxed text-fg-faint">{placeholder}</span> : null}
      <div
        ref={root}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-para={index}
        spellCheck={false}
        onInput={() => {
          emit();
          onCaret?.();
        }}
        onKeyUp={() => onCaret?.()}
        onClick={(e) => {
          const a = e.target.closest?.("a.mention");
          if (a) {
            e.preventDefault();
            onMentionClick?.(a.getAttribute("href"), e);
            return;
          }
          onCaret?.();
        }}
        onFocus={(e) => {
          onCaret?.();
          onFocus?.(e);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            document.execCommand("insertText", false, "\n");
            return;
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            // a mention is deleted as one unit (and stays undoable)
            const chip = adjacentMention(root.current, e.key === "Backspace" ? "before" : "after");
            if (chip) {
              e.preventDefault();
              const sel = window.getSelection();
              const r = document.createRange();
              r.selectNode(chip);
              sel.removeAllRanges();
              sel.addRange(r);
              document.execCommand("delete");
            }
          }
        }}
        onPaste={onPaste}
        className={cn("richtext block min-h-[1.9rem] w-full whitespace-pre-wrap break-words rounded-app-sm px-1.5 py-1 text-[13px] leading-relaxed outline-none focus:bg-surface-2/50", mono && "font-mono", className)}
      />
    </div>
  );
});

export default RichParagraph;
