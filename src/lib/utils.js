import { twMerge } from "tailwind-merge";
let dateLocale; // undefined = browser default; set by the i18n provider
export const setDateLocale = (l) => { dateLocale = l; };
export const getDateLocale = () => dateLocale;

/** Join class names, skipping falsy values. */
/** Join class names, skipping falsy values; later Tailwind classes override earlier conflicting ones (so `hidden` can beat a component's `inline-flex`). */
export function cn(...parts) {
  return twMerge(parts.flat().filter(Boolean).join(" "));
}

export function fullName(e) {
  if (!e) return "";
  return [e.first_name, e.last_name].filter(Boolean).join(" ");
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
}

export function formatDate(value, opts) {
  if (!value) return "";
  const d = typeof value === "string" && value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(dateLocale, opts ?? { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(dateLocale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(value) {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMoney(value) {
  if (value == null || value === "") return "";
  return new Intl.NumberFormat(dateLocale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

export function truncate(str = "", n = 80) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export function isOverdue(dateStr, status) {
  if (!dateStr || status === "done") return false;
  return new Date(dateStr + "T23:59:59") < new Date();
}

/** Turn a string into a URL-safe uppercase code (used for project codes). */
export function toCode(str = "") {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
