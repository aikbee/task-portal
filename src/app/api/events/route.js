import { execute } from "@/lib/db";
import { handler, ok, readJson } from "@/lib/api-utils";
import { cleanEvent, getEvent, listEvents } from "@/lib/events";

/** ?from=&to= (events that touch the range) &project_id= */
export const GET = handler(async (request, _params, user) => {
  const sp = request.nextUrl.searchParams;
  return ok(await listEvents(user.profile_id, { from: sp.get("from"), to: sp.get("to"), project_id: sp.get("project_id") }));
});

/** { title, start_date, end_date?, all_day?, start_time?, end_time?, location?, description?, color?, project_id? } */
export const POST = handler(async (request, _params, user) => {
  const data = await cleanEvent(await readJson(request), user.profile_id);
  const cols = { ...data, user_id: user.owner_id, profile_id: user.profile_id, created_by: user.id, created_by_name: user.name };
  const keys = Object.keys(cols);
  const res = await execute(`INSERT INTO calendar_events (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, keys.map((k) => cols[k]));
  return ok(await getEvent(res.insertId, user.profile_id), { status: 201 });
});
