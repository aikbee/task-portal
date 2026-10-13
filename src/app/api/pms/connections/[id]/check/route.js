import { handler, ok, requireId } from "@/lib/api-utils";
import { checkConnection } from "@/lib/pms-sync";

/** Ask Bitara PMS again what the token reaches. */
export const POST = handler(async (_req, params, user) => ok({ connections: await checkConnection(user, requireId(params.id)) }));
