import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { listTime, stopRunning } from "@/lib/time-tracking";
import { parseDuration } from "@/lib/duration";
import { getTask } from "../route";

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export function cleanEntry(body, { partial = false } = {}) {
  const out = {};
  if ("minutes" in body || "duration" in body || !partial) {
    const minutes = "minutes" in body ? Math.round(Number(body.minutes)) : parseDuration(body.duration);
    if (!Number.isFinite(minutes) || minutes == null || minutes < 1) throw new HttpError('Enter the time spent, like "1h 30m", "45m" or "1.5".', 400);
    if (minutes > 24 * 60) throw new HttpError("One entry holds up to 24 hours.", 400);
    out.minutes = minutes;
  }
  if ("spent_on" in body && body.spent_on != null && body.spent_on !== "") {
    if (!isDate(body.spent_on)) throw new HttpError("spent_on must be a date (YYYY-MM-DD).", 400);
    out.spent_on = body.spent_on;
  }
  if ("note" in body) out.note = String(body.note ?? "").trim().slice(0, 255) || null;
  return out;
}

/** { entries, total_minutes, running } for one task. */
export const GET = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  return ok(await listTime(id, user));
});

/**
 * Log time on a task: { duration: "1h 30m" | minutes, spent_on?, note? }, or { start: true, spent_on? } to start a
 * timer. Starting one stops my timer that runs elsewhere (its time is kept).
 */
export const POST = handler(async (request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  const body = await readJson(request);
  const day = isDate(body.spent_on) ? body.spent_on : new Date().toISOString().slice(0, 10);
  if (body.start) {
    const stopped = await stopRunning(user.id);
    await execute("INSERT INTO time_entries (task_id, user_id, user_name, minutes, spent_on, note, started_at) VALUES (?, ?, ?, 0, ?, ?, NOW())", [id, user.id, user.name, day, String(body.note ?? "").trim().slice(0, 255) || null]);
    return ok({ ...(await listTime(id, user)), stopped }, { status: 201 });
  }
  const entry = cleanEntry(body);
  await execute("INSERT INTO time_entries (task_id, user_id, user_name, minutes, spent_on, note) VALUES (?, ?, ?, ?, ?, ?)", [id, user.id, user.name, entry.minutes, entry.spent_on ?? day, entry.note ?? null]);
  return ok(await listTime(id, user), { status: 201 });
});
