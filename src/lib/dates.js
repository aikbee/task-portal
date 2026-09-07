/** Small local-date helpers (all values are 'YYYY-MM-DD' strings or local Date objects). */
export const pad2 = (n) => String(n).padStart(2, "0");

export function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseIso(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const todayIso = () => isoDate(new Date());
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
/** Monday-based start of week. */
export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const sameDay = (a, b) => a && b && isoDate(a) === isoDate(b);
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const monthTitle = (d) => d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
