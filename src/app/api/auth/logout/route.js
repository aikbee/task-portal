import { handler, ok } from "@/lib/api-utils";
import { destroySession } from "@/lib/auth";

export const POST = handler(
  async (request) => {
    await destroySession(request);
    return ok({ ok: true });
  },
  { auth: false }
);
