import { execute } from "@/lib/db";
import { handler, ok, readJson, requireId } from "@/lib/api-utils";
import { cleanEvent, getEvent } from "@/lib/events";

export const GET = handler(async (_request, params, user) => ok(await getEvent(requireId(params.id), user.profile_id)));

/** Any subset of the fields; the result is validated as a whole (so moving only the start date cannot leave it after the end). */
export const PUT = handler(async (request, params, user) => {
  const id = requireId(params.id);
  const current = await getEvent(id, user.profile_id);
  const body = await readJson(request);
  // dragging an event to another day sends only start_date: keep its length
  if ("start_date" in body && !("end_date" in body) && /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date))) {
    const len = Math.round((Date.parse(current.end_date) - Date.parse(current.start_date)) / 86400000);
    body.end_date = new Date(Date.parse(body.start_date) + len * 86400000).toISOString().slice(0, 10);
  }
  const data = await cleanEvent(body, user.profile_id, current);
  const keys = Object.keys(data);
  await execute(`UPDATE calendar_events SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`, [...keys.map((k) => data[k]), id, user.profile_id]);
  return ok(await getEvent(id, user.profile_id));
});

export const DELETE = handler(async (_request, params, user) => {
  const id = requireId(params.id);
  await getEvent(id, user.profile_id);
  await execute("DELETE FROM calendar_events WHERE id = ? AND profile_id = ?", [id, user.profile_id]);
  return ok({ id });
});
