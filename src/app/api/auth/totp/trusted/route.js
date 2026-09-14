import { handler, ok } from "@/lib/api-utils";
import { forgetTrustedDevices, listTrustedDevices, totpStatus } from "@/lib/mfa";

/** Browsers remembered for 30 days after a second-factor sign-in. */
export const GET = handler(async (_request, _params, user) => ok(await listTrustedDevices(user.id)));

/** Forget every remembered browser: the next password sign-in asks for a code again everywhere. */
export const DELETE = handler(async (_request, _params, user) => {
  await forgetTrustedDevices(user.id);
  return ok(await totpStatus(user.id));
});
