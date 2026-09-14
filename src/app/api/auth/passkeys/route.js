import { handler, ok } from "@/lib/api-utils";
import { listPasskeys } from "@/lib/passkeys";

/** The signed-in user's passkeys. */
export const GET = handler(async (_request, _params, user) => ok(await listPasskeys(user.id)));
