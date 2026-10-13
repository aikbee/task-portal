import { handler, ok } from "@/lib/api-utils";
import { searchTickets } from "@/lib/pms-sync";

/** Tickets of a Bitara PMS project, for linking a task to one: ?project=KEY&q=text */
export const GET = handler(async (request, _params, user) => {
  const sp = new URL(request.url).searchParams;
  return ok(await searchTickets(user, sp.get("project"), sp.get("q")));
});
