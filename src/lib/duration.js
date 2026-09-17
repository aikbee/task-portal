/** Minutes from what a person types: "1h 30m", "1:30", "90m", "1.5h", "1.5" (hours), "45" with unit "m". Null when unreadable. */
export function parseDuration(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m = /^(\d{1,3}):([0-5]?\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/.exec(s);
  if (m && (m[1] != null || m[2] != null)) return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s) * 60); // a bare number means hours
  return null;
}
/** 200 -> "3h 20m", 45 -> "45m", 120 -> "2h", 0 -> "0m" */
export function formatMinutes(total) {
  const n = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(n / 60), m = n % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
/** 3725 -> "1:02:05" */
export function formatClock(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const p = (x) => String(x).padStart(2, "0");
  return `${Math.floor(n / 3600)}:${p(Math.floor((n % 3600) / 60))}:${p(n % 60)}`;
}
