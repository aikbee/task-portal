/**
 * Repeating tasks. A task with a `repeat_rule` makes its successor when it is completed: the next due date is
 * counted from the current one (so "every Monday" stays on Mondays even when you finish late) and rolled forward
 * until it is not in the past. Pure date maths on YYYY-MM-DD strings: no time zones involved.
 */
export const REPEAT_RULES = {
  daily: { label: "Every day" },
  weekdays: { label: "Every weekday" },
  weekly: { label: "Every week" },
  biweekly: { label: "Every 2 weeks" },
  monthly: { label: "Every month" },
  quarterly: { label: "Every 3 months" },
  yearly: { label: "Every year" },
};
const DAY = 86400000;
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d }; };
const fmt = (date) => date.toISOString().slice(0, 10);
const utc = (iso) => { const { y, m, d } = parse(iso); return new Date(Date.UTC(y, m - 1, d)); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
export const addDaysIso = (iso, n) => fmt(new Date(utc(iso).getTime() + n * DAY));
/** Same day of the month n months later, or that month's last day when it is shorter (31 Jan -> 28 Feb). */
function addMonthsIso(iso, n) {
  const { y, m, d } = parse(iso);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))));
}
export function nextDate(iso, rule) {
  switch (rule) {
    case "daily": return addDaysIso(iso, 1);
    case "weekdays": { let next = addDaysIso(iso, 1); while ([0, 6].includes(utc(next).getUTCDay())) next = addDaysIso(next, 1); return next; }
    case "weekly": return addDaysIso(iso, 7);
    case "biweekly": return addDaysIso(iso, 14);
    case "monthly": return addMonthsIso(iso, 1);
    case "quarterly": return addMonthsIso(iso, 3);
    case "yearly": return addMonthsIso(iso, 12);
    default: return null;
  }
}
/** Dates of the task that follows `task`, or null when the series is over (or the task does not repeat). */
export function nextOccurrence(task, today) {
  const rule = task.repeat_rule;
  if (!REPEAT_RULES[rule]) return null;
  const anchor = task.due_date || task.start_date || today;
  let next = nextDate(anchor, rule);
  for (let i = 0; next < today && i < 5000; i++) next = nextDate(next, rule);
  if (task.repeat_until && next > task.repeat_until) return null;
  if (task.due_date) return { due_date: next, start_date: task.start_date ? addDaysIso(next, -Math.max(0, daysBetween(task.start_date, task.due_date))) : null };
  return { start_date: task.start_date ? next : null, due_date: task.start_date ? null : next };
}
