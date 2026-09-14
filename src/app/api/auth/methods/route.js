import { handler, ok } from "@/lib/api-utils";
import { googleEnabled } from "@/lib/google-auth";

/** Which sign-in methods this server offers (public: the login page reads it). */
export const GET = handler(async () => ok({ password: true, passkeys: true, google: googleEnabled() }), { auth: false });
