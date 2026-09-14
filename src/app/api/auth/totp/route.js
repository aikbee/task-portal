import { handler, ok } from "@/lib/api-utils";
import { totpStatus } from "@/lib/mfa";

/** Two-factor status of the signed-in user. */
export const GET = handler(async (_request, _params, user) => ok(await totpStatus(user.id)));
