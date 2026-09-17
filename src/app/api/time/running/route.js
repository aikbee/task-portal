import { handler, ok } from "@/lib/api-utils";
import { runningFor } from "@/lib/time-tracking";

/** { running }: my running timer or null, whichever profile its task lives in. (Wrapped: the client unwraps a bare null to the whole payload.) */
export const GET = handler(async (_request, _params, user) => ok({ running: (await runningFor(user.id)) ?? null }));
