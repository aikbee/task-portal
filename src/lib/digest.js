import { query, queryOne, execute } from "./db";
import { NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES } from "./constants";
import { readMailSettings, renderEmail, sendMail, linkTo } from "./mail";

/**
 * The daily digest: one email with what happened since the last one (unread bell entries, grouped), the tasks
 * assigned to the person that are overdue or due today, and today's events. A person chooses it under
 * Preferences → Notifications → Email ("Once a day"), with an hour and their time zone; the scheduler sends it
 * on its first run at or after that hour, once per local day. Nothing to say means no email.
 */
const prefsOf = (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {};
/** Local date ("YYYY-MM-DD") and hour in a time zone; falls back to UTC for an unknown zone. */
export function localNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
  } catch {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}

/** What the digest for one person would say. `since`: ISO time of the previous digest (or 24 h ago). */
export async function buildDigest(userId, { since = null } = {}) {
  const user = await queryOne("SELECT id, name, email, status, notification_prefs FROM users WHERE id = ?", [userId]);
  if (!user || user.status !== "active") return null;
  const prefs = prefsOf(user.notification_prefs);
  const muted = new Set(prefs.muted ?? []);
  const from = since ? new Date(since) : new Date(Date.now() - 24 * 3600000);
  const notes = await query("SELECT id, type, title, body, created_at FROM notifications WHERE user_id = ? AND read_at IS NULL AND created_at > ? ORDER BY id DESC LIMIT 200", [userId, from]);
  const groups = new Map();
  for (const n of notes) {
    const cat = NOTIFICATION_TYPES[n.type]?.category ?? "other";
    if (muted.has(cat)) continue;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(n);
  }
  // tasks assigned to me (linked employee records), overdue or due today, in every profile I can open
  const tasks = await query(
    `SELECT DISTINCT t.id, t.title, t.due_date, DATEDIFF(t.due_date, CURDATE()) AS days, p.name AS project_name, pr.name AS profile_name
     FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id JOIN employees e ON e.id = ta.employee_id AND e.linked_user_id = ?
     JOIN profiles pr ON pr.id = t.profile_id JOIN users o ON o.id = pr.user_id AND o.status = 'active'
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN profile_members pm ON pm.profile_id = pr.id AND pm.user_id = ? AND pm.status = 'active'
     WHERE (pr.user_id = ? OR pm.user_id IS NOT NULL) AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= CURDATE()
     ORDER BY t.due_date, t.title LIMIT 40`,
    [userId, userId, userId]
  );
  const events = await query(
    `SELECT ev.id, ev.title, ev.start_date, ev.start_time, pr.name AS profile_name FROM calendar_events ev JOIN profiles pr ON pr.id = ev.profile_id
     WHERE pr.user_id = ? AND ev.start_date = CURDATE() ORDER BY ev.start_time IS NULL, ev.start_time, ev.title LIMIT 20`,
    [userId]
  ).catch(() => []);
  const total = [...groups.values()].reduce((n, g) => n + g.length, 0);
  return { user, prefs, notes: groups, tasks, events, total, empty: total === 0 && tasks.length === 0 && events.length === 0 };
}

const catLabel = (cat) => NOTIFICATION_CATEGORIES[cat]?.label ?? cat;
/** The email for a built digest. */
export function renderDigest(d, settings) {
  const overdue = d.tasks.filter((t) => t.days < 0);
  const today = d.tasks.filter((t) => t.days === 0);
  const sections = [];
  if (overdue.length) sections.push({ heading: `Overdue (${overdue.length})`, items: overdue.map((t) => ({ text: `${t.title}${t.project_name ? ` · ${t.project_name}` : ""} — ${-t.days} day${t.days === -1 ? "" : "s"} overdue`, url: linkTo(settings, `/tasks/${t.id}`) })) });
  if (today.length) sections.push({ heading: `Due today (${today.length})`, items: today.map((t) => ({ text: `${t.title}${t.project_name ? ` · ${t.project_name}` : ""}`, url: linkTo(settings, `/tasks/${t.id}`) })) });
  if (d.events.length) sections.push({ heading: `Today's events (${d.events.length})`, items: d.events.map((e) => ({ text: `${e.start_time ? `${String(e.start_time).slice(0, 5)} · ` : ""}${e.title}`, url: linkTo(settings, `/calendar?day=${e.start_date}`) })) });
  for (const [cat, list] of d.notes) {
    const shown = list.slice(0, 8);
    sections.push({ heading: `${catLabel(cat)} (${list.length})`, items: [...shown.map((n) => ({ text: n.body ? `${n.title} — ${n.body}` : n.title, url: linkTo(settings, `/n/${n.id}`) })), ...(list.length > shown.length ? [{ text: `…and ${list.length - shown.length} more` }] : [])] });
  }
  const bits = [d.total ? `${d.total} new notification${d.total === 1 ? "" : "s"}` : null, overdue.length ? `${overdue.length} overdue` : null, today.length ? `${today.length} due today` : null, d.events.length ? `${d.events.length} event${d.events.length === 1 ? "" : "s"} today` : null].filter(Boolean);
  const title = `Your daily summary: ${bits.join(", ")}`;
  return { subject: `Task Portal: ${bits.join(", ")}`, ...renderEmail({ title, lines: [`Hello ${d.user.name}, here is what is waiting for you.`], sections, action: { label: "Open Task Portal", url: linkTo(settings, "/notifications") }, footer: "You get one summary a day because you chose it under Preferences → Notifications → Email. Switch to \"Right away\" or \"Off\" there." }) };
}

/** Send one person's digest now (the button, or the scheduler). Returns { sent, reason }. */
export async function sendDigest(userId, { force = false, settings = null } = {}) {
  const s = settings ?? (await readMailSettings());
  if (!(s.enabled && s.configured && s.allow_notifications)) return { sent: false, reason: "Email is not set up." };
  const user = await queryOne("SELECT notification_prefs FROM users WHERE id = ?", [userId]);
  const prefs = prefsOf(user?.notification_prefs);
  const d = await buildDigest(userId, { since: prefs.digest_last_at ?? null });
  if (!d) return { sent: false, reason: "No such person." };
  if (d.empty && !force) return { sent: false, reason: "Nothing to tell.", empty: true };
  const mail = renderDigest(d, s);
  const res = await sendMail({ to: d.user.email, subject: mail.subject, text: mail.text, html: mail.html, kind: "digest", settings: s });
  if (res.ok) await execute("UPDATE users SET notification_prefs = ? WHERE id = ?", [JSON.stringify({ ...prefs, digest_last: localNow(prefs.tz).date, digest_last_at: new Date().toISOString() }), userId]);
  return res.ok ? { sent: true, summary: mail.subject } : { sent: false, reason: res.error };
}

/** Scheduler: everyone on "Once a day" whose local hour has come and who has not had today's yet. */
export async function sendDueDigests() {
  const s = await readMailSettings();
  if (!(s.enabled && s.configured && s.allow_notifications)) return 0;
  // (a JSON column is stored in MySQL's own formatting, so the mode is read with a JSON path, not LIKE)
  const rows = await query("SELECT id, notification_prefs FROM users WHERE status = 'active' AND JSON_UNQUOTE(JSON_EXTRACT(notification_prefs, '$.email_mode')) = 'digest'");
  let sent = 0;
  for (const r of rows) {
    const prefs = prefsOf(r.notification_prefs);
    const { date, hour } = localNow(prefs.tz);
    if (hour < (Number.isInteger(prefs.digest_hour) ? prefs.digest_hour : 8) || prefs.digest_last === date) continue;
    const res = await sendDigest(r.id, { settings: s }).catch(() => ({ sent: false }));
    if (res.sent) sent++;
    else if (res.empty) await execute("UPDATE users SET notification_prefs = ? WHERE id = ?", [JSON.stringify({ ...prefs, digest_last: date }), r.id]); // nothing today: try again tomorrow
  }
  return sent;
}
