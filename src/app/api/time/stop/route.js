import { handler, ok } from "@/lib/api-utils";
import { stopRunning } from "@/lib/time-tracking";

/** Stop my running timer and keep its time. Works from any page and any active profile: it is my own entry. */
export const POST = handler(async (_request, _params, user) => ok({ stopped: await stopRunning(user.id) }));
