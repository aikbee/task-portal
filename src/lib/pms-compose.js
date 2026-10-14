import { createHash } from "node:crypto";
import { displayMentions } from "./mentions.js";
import { parseTableJson, tableToMarkdown } from "./text-tables.js";
import { PRIORITY_TO_PMS } from "./pms-shared.js";

/**
 * What a task becomes in Bitara PMS: the ticket's fields, comment bodies, worklog entries, and the hashes that tell
 * later whether something changed since it was sent. Pure functions (the smoke test imports them).
 */

/** The fixed words inside what we write, in the ticket's language (PMS asks for comments in the ticket's language). */
const WORDS = {
  en: { checklist: "Checklist", start: "Start", due: "Due", estimate: "Estimate", tags: "Tags", updated: "updated", output: "Output", empty: "(empty)", cut: "Cut here: the full text is in Task Portal.", comment: "comment in Task Portal" },
  "zh-CN": { checklist: "检查清单", start: "开始", due: "截止", estimate: "预估", tags: "标签", updated: "已更新", output: "产出", empty: "（空）", cut: "内容过长已截断：完整内容在 Task Portal 中。", comment: "Task Portal 中的评论" },
};
const words = (lang) => WORDS[lang] ?? WORDS.en;
/** A comment body PMS should still be happy with; longer outputs are cut with a note. */
export const MAX_BODY = 60_000;

const clean = (s) => displayMentions(String(s ?? "")).replace(/\r\n?/g, "\n").trim();
const oneLine = (s) => clean(s).replace(/\s*\n+\s*/g, " ");
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const hours = (h) => {
  const m = Math.round(Number(h) * 60);
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
};
function capped(text, w) {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n\n_${w.cut}_` : text;
}
export const hashOf = (v) => createHash("sha1").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

/** Chinese text in it → zh-CN, else en. */
export const guessLang = (...texts) => (texts.some((t) => /[㐀-鿿豈-﫿]/.test(String(t ?? ""))) ? "zh-CN" : "en");

export function checklistMarkdown(items, lang) {
  if (!items?.length) return "";
  const done = items.filter((i) => Number(i.done)).length;
  return [`**${words(lang).checklist}** (${done}/${items.length})`, "", ...items.map((i) => `- [${Number(i.done) ? "x" : " "}] ${oneLine(i.title)}`)].join("\n");
}

/**
 * The ticket for a task: { title, description, priority, dueAt? } (+ estimateMinutes when asked). `footer` is the line
 * the sender chose to end their tickets with (footerLine, already filled in); none when they chose none.
 */
export function ticketFields(task, { checklist = [], includeChecklist = false, lang = "en", footer = "", withEstimate = false } = {}) {
  const w = words(lang);
  const parts = [];
  const desc = clean(task.description);
  if (desc) parts.push(desc);
  if (includeChecklist && checklist.length) parts.push(checklistMarkdown(checklist, lang));
  const tags = String(task.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const facts = [
    task.start_date ? `${w.start}: ${day(task.start_date)}` : null,
    task.due_date ? `${w.due}: ${day(task.due_date)}` : null,
    task.estimate_hours != null ? `${w.estimate}: ${hours(task.estimate_hours)}` : null,
    tags.length ? `${w.tags}: ${tags.map((t) => `#${t}`).join(" ")}` : null,
  ].filter(Boolean);
  if (facts.length) parts.push(facts.join(" · "));
  if (footer) parts.push(footer);
  const out = { title: oneLine(task.title).slice(0, 200) || `Task #${task.id}`, description: capped(parts.join("\n\n"), w), priority: PRIORITY_TO_PMS[task.priority] ?? "P3" };
  if (task.due_date) out.dueAt = day(task.due_date);
  if (withEstimate && task.estimate_hours != null && Number(task.estimate_hours) > 0) out.estimateMinutes = Math.round(Number(task.estimate_hours) * 60);
  return out;
}

/** An output as one comment: its title as a heading, the text as it is (pipe tables stay Markdown tables). */
export function outputComment(output, { lang = "en", updated = false } = {}) {
  const w = words(lang);
  const content = output.format === "table" ? tableToMarkdown(parseTableJson(output.content)) : clean(output.content);
  const title = oneLine(output.title) || w.output;
  return capped(`### ${title}${updated ? ` (${w.updated})` : ""}\n\n${content || `_${w.empty}_`}`, w);
}

/** A Task Portal comment as a PMS comment, under its author's name: PMS shows every comment as the token's owner. */
export function commentComment(c, { lang = "en" } = {}) {
  const w = words(lang);
  return capped(`**${oneLine(c.author_name) || "?"}** · ${day(c.created_at)} · ${w.comment}\n\n${clean(c.body)}`, w);
}

/** The checklist as a comment, for a ticket that was not raised from here (or to post its current state). */
export const checklistComment = (items, { lang = "en" } = {}) => checklistMarkdown(items, lang);

/** A worklog entry for PMS's batch call. */
export function worklogEntry(e, { kind, ticketKey, startedAt, taskTitle, ref }) {
  return { startedAt, minutes: Number(e.minutes), kind, ticketKey, note: (oneLine(e.note) || oneLine(taskTitle)).slice(0, 500), externalRef: ref };
}

/**
 * Fingerprints of the Task Portal side, taken when something is sent and again when the dialog opens: equal means
 * "sent, unchanged". They cover what a person edits, not the wording we wrap around it.
 */
export const itemHash = {
  ticket: (t) => hashOf({ title: t.title, description: t.description ?? "", priority: t.priority, start: t.start_date ? day(t.start_date) : null, due: t.due_date ? day(t.due_date) : null, tags: t.tags ?? "", estimate: t.estimate_hours == null ? null : Number(t.estimate_hours) }),
  checklist: (items) => hashOf(items.map((i) => [i.title, Number(i.done) ? 1 : 0])),
  output: (o) => hashOf({ title: o.title ?? "", content: o.content ?? "" }),
  comment: (c) => hashOf(c.body ?? ""),
  file: (f) => hashOf(`${f.stored_name}:${f.size_bytes}`),
  time: (e) => hashOf({ minutes: Number(e.minutes), day: day(e.spent_on), note: e.note ?? "" }),
};
/** The text PMS holds after we wrote it, normalised so that line endings and edge spaces do not look like an edit. */
export const remoteHash = (s) => hashOf(String(s ?? "").replace(/\r\n?/g, "\n").trim());

/** An ISO 8601 time with an offset (what PMS asks for), e.g. 2026-10-13T09:00:00+08:00. */
export const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
