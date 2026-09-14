import { handler, ok } from "@/lib/api-utils";
import { appOrigin } from "@/lib/auth-cookies";
import { rotateFriendCode, friendQr, friendLink } from "@/lib/chat";

/** New friend code (old QR codes stop working). */
export const POST = handler(async (request, _params, user) => {
  const code = await rotateFriendCode(user.id);
  const origin = appOrigin(request);
  return ok({ code, link: friendLink(origin, code), qr: await friendQr(origin, code) });
});
