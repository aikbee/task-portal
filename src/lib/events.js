import { query, queryOne } from "./db";
import { HttpError } from "./http-error";
import { notify } from "./notifications";

/** Calendar events of a profile: meetings, holidays, releases. Floating dates and times, no time zones. */
export const EVENT_SELECT = `
  SELECT e.id, e.profile_id, e.project_id, e.title, e.description, e.location, e.all_day, e.start_date, e.end_date,
    TIME_FORMAT(e.start_time, '%H:%i') AS start_time, TIME_FORMAT(e.end_time, '%H:%i') AS end_time, e.color, e.created_by,
    COALESCE(u.name, e.created_by_name) AS created_by_name, e.created_at, e.updated_at, p.name AS project_name, p.color AS project_color, p.code AS project_code
  FROM calendar_events e LEFT JOIN projects p ON p.id = e.project_id LEFT JOIN users u ON u.id = e.created_by`;

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Validate and normalise a body; `current` is the stored row when only part of it is being changed. */
export async function cleanEvent(body, profileId, current = null) {
  const pick = (k) => (k in body ? body[k] : current?.[k]);
  const title = String(pick("title") ?? "").trim();
  if (!title) throw new HttpError("An event needs a title.", 400);
  if (title.length > 200) throw new HttpError("The title is too long (max 200).", 400);
  const start_date = pick("start_date");
  let end_date = pick("end_date") || start_date;
  if (!isDate(start_date)) throw new HttpError("start_date must be a date (YYYY-MM-DD).", 400);
  if (!isDate(end_date)) throw new HttpError("end_date must be a date (YYYY-MM-DD).", 400);
  if (end_date < start_date) throw new HttpError("The event ends before it starts.", 400);
  const all_day = "all_day" in body ? Boolean(body.all_day) : current ? Boolean(current.all_day) : !body.start_time;
  let start_time = null, end_time = null;
  if (!all_day) {
    start_time = pick("start_time") || null;
    end_time = pick("end_time") || null;
    if (!isTime(start_time)) throw new HttpError("A timed event needs a start time (HH:MM).", 400);
    if (end_time != null && !isTime(end_time)) throw new HttpError("end_time must be HH:MM.", 400);
    if (end_time && end_date === start_date && end_time < start_time) throw new HttpError("The event ends before it starts.", 400);
  }
  let project_id = pick("project_id") ? Number(pick("project_id")) : null;
  if (project_id && !(await queryOne("SELECT id FROM projects WHERE id = ? AND profile_id = ?", [project_id, profileId]))) throw new HttpError("That project is not in this profile.", 400);
  const color = pick("color") && /^#[0-9a-fA-F]{6}$/.test(pick("color")) ? pick("color") : null;
  return { title, description: String(pick("description") ?? "").trim() || null, location: String(pick("location") ?? "").trim().slice(0, 200) || null, all_day: all_day ? 1 : 0, start_date, end_date, start_time, end_time, color, project_id };
}

export async function getEvent(id, profileId) {
  const row = await queryOne(`${EVENT_SELECT} WHERE e.id = ? AND e.profile_id = ?`, [id, profileId]);
  if (!row) throw new HttpError("Event not found.", 404);
  return row;
}
/** Events that touch [from, to] (both optional), by start. */
export function listEvents(profileId, { from, to, project_id } = {}) {
  const where = ["e.profile_id = ?"], args = [profileId];
  if (isDate(to)) { where.push("e.start_date <= ?"); args.push(to); }
  if (isDate(from)) { where.push("e.end_date >= ?"); args.push(from); }
  if (project_id) { where.push("e.project_id = ?"); args.push(Number(project_id)); }
  return query(`${EVENT_SELECT} WHERE ${where.join(" AND ")} ORDER BY e.start_date, e.all_day DESC, e.start_time, e.id LIMIT 2000`, args);
}

/** Cron: tell the profile's owner and the person who made the event, the day before and on the day. Returns how many were sent. */
export async function ensureEventReminders(ownerId, profileId) {
  const rows = await query(
    `SELECT e.id, e.title, e.start_date, e.all_day, TIME_FORMAT(e.start_time, '%H:%i') AS start_time, e.location, e.created_by, DATEDIFF(e.start_date, CURDATE()) AS days
     FROM calendar_events e WHERE e.profile_id = ? AND e.start_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [profileId]
  );
  let created = 0;
  for (const e of rows) {
    const when = `${e.days === 0 ? "today" : "tomorrow"}${e.all_day ? "" : ` at ${e.start_time}`}`;
    const members = new Set((await query("SELECT user_id FROM profile_members WHERE profile_id = ? AND status = 'active'", [profileId])).map((r) => r.user_id));
    const recipients = new Set([ownerId, ...(e.created_by && (e.created_by === ownerId || members.has(e.created_by)) ? [e.created_by] : [])]);
    for (const userId of recipients) {
      const made = await notify({ userId, type: "event_reminder", title: `${e.title} is ${when}`, body: e.location || null, href: `/calendar?day=${e.start_date}`, entityType: "event", entityId: e.id, profileId, dedupeKey: `event:${e.id}:${e.start_date}:${e.days}` }).catch(() => false);
      if (made) created++;
    }
  }
  return created;
}
