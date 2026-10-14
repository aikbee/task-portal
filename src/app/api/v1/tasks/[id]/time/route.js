import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { getTask } from "@/app/api/tasks/[id]/route";
import { cleanEntry } from "@/app/api/tasks/[id]/time/route";
import { listTime } from "@/lib/time-tracking";
import { idempotent } from "@/lib/api-v1";

const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : v);
const shape = (e) => ({ id: e.id, minutes: Number(e.minutes), spent_on: String(e.spent_on).slice(0, 10), note: e.note ?? null, person: e.user_name, running: Boolean(e.running), started_at: iso(e.started_at) });

/** Time logged on a task: { entries, total_minutes }. */
export const GET = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getTask(id, user.profile_id);
  const { entries, total_minutes } = await listTime(id, user);
  return ok({ entries: entries.map(shape), total_minutes });
});

/** Log time as the token's owner: { minutes | duration ("1h 30m"), spent_on?, note? }. */
export const POST = handler(async (request, params, user) =>
  idempotent(request, user, async () => {
    const id = requireId(params.id);
    await getTask(id, user.profile_id);
    const entry = cleanEntry(await readJson(request));
    const res = await execute("INSERT INTO time_entries (task_id, user_id, user_name, minutes, spent_on, note) VALUES (?, ?, ?, ?, ?, ?)", [id, user.id, user.name, entry.minutes, entry.spent_on ?? new Date().toISOString().slice(0, 10), entry.note ?? null]);
    const { entries, total_minutes } = await listTime(id, user);
    return ok({ entry: shape(entries.find((e) => e.id === res.insertId)), total_minutes }, { status: 201 });
  })
);
