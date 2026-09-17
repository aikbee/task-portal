import { handler, ok } from "@/lib/api-utils";
import { googleEnabled } from "@/lib/google-auth";
import { publicMailSettings } from "@/lib/mail";

/** Which sign-in methods this server offers (public: the login page reads it). */
export const GET = handler(async () => {
  const mail = await publicMailSettings().catch(() => ({ enabled: false, reset: false, invites: false, notifications: false }));
  return ok({ password: true, passkeys: true, google: googleEnabled(), reset: mail.reset, mail });
}, { auth: false });
