/** Bitara PMS: values the server and the pages share. Plain module. */

export const PMS_CATEGORIES = ["FEATURE", "BUG", "CHANGE_REQUEST", "DESIGN", "SUPPORT", "DATA_FIX", "INFRA", "SECURITY", "QUESTION"];
export const PMS_CATEGORY_LABEL = { FEATURE: "Feature", BUG: "Bug report", CHANGE_REQUEST: "Change request", DESIGN: "Design", SUPPORT: "Support", DATA_FIX: "Data fix", INFRA: "Infrastructure", SECURITY: "Security", QUESTION: "Question" };
/** Kinds of work a worklog may be. PMS also has AGENT, which is for work an AI did on its own, so it is not offered. */
export const PMS_WORK_KINDS = ["DEV", "TEST", "REVIEW", "DESIGN", "DOCS", "SUPPORT", "MEETING", "ADMIN", "OTHER"];
export const PMS_KIND_LABEL = { DEV: "Development", TEST: "Testing", REVIEW: "Review", DESIGN: "Design", DOCS: "Documentation", SUPPORT: "Support", MEETING: "Meeting", ADMIN: "Administration", OTHER: "Other" };
export const PMS_LANGS = { en: "English", "zh-CN": "简体中文" };
export const PRIORITY_TO_PMS = { urgent: "P1", high: "P2", medium: "P3", low: "P4" };
export const PMS_STATUS_TONE = { OPEN: "sky", NEEDS_DETAIL: "amber", AWAITING_APPROVAL: "amber", IN_DEV: "indigo", IN_TESTING: "violet", TEST_FAILED: "rose", RELEASE_STAGING: "emerald", RELEASE_PRODUCTION: "emerald", ON_HOLD: "slate", CLOSED: "slate" };
/** "IN_DEV" -> "In dev" */
export const pmsStatusLabel = (s) => String(s ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
/** PMS's own words (ticket statuses, token autonomy) in Chinese. Kept apart from the dictionary: "Open" there means the verb. */
const PMS_WORDS_ZH = { OPEN: "待处理", NEEDS_DETAIL: "待补充信息", AWAITING_APPROVAL: "待审批", IN_DEV: "开发中", IN_TESTING: "测试中", TEST_FAILED: "测试未通过", RELEASE_STAGING: "预发布", RELEASE_PRODUCTION: "已上线", ON_HOLD: "暂停", CLOSED: "已关闭", SUGGEST_ONLY: "仅建议", OFF: "关闭", FULL: "完全" };
export const pmsStatusText = (s, locale) => (locale === "zh-CN" && PMS_WORDS_ZH[s]) || pmsStatusLabel(s);
/**
 * The line a person ends their tickets with (Integrations → Bitara PMS), placeholders filled in: {id} the task's number,
 * {title} its title, {url} its address in Task Portal. Plain text, because PMS shows Markdown as typed. Empty: no line.
 */
export const PMS_FOOTER_MAX = 300;
export function footerLine(template, { id = "", title = "", url = "" } = {}) {
  const text = String(template ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const values = { id, title: String(title ?? "").replace(/\s+/g, " ").trim(), url: url ?? "" };
  return text.replace(/\{(id|title|url)\}/g, (_, k) => String(values[k])).trim();
}
/** What a project's token autonomy means for sending, in words. */
export const PMS_MODE_NOTE = { SUGGEST_ONLY: "Comments, files and time go through; status changes are refused.", OFF: "Read only: nothing can be sent.", FULL: "Everything can be sent." };
