import { handler, ok, readJson } from "@/lib/api-utils";
import { requestSignup } from "@/lib/signup";
import { clientIp } from "@/lib/login";

/** Public: { name, email, password } — a 6-digit code goes to the address (lib/signup.js). */
export const POST = handler(async (request) => ok(await requestSignup(request, await readJson(request), clientIp(request)), { status: 201 }), { auth: false });
