import { queryOne } from "@/lib/db";
import { handler, ok, readJson } from "@/lib/api-utils";
import { takeSignup } from "@/lib/signup";
import { createAccount } from "@/lib/accounts";
import { finishLogin } from "@/lib/login";
import { notifyAdmins } from "@/lib/notifications";

/** Public: { email, code, remember? } — the code from the email makes the account and signs it in. */
export const POST = handler(async (request) => {
  const body = await readJson(request);
  const s = await takeSignup(body);
  const userId = await createAccount({ name: s.name, email: s.email, passwordHash: s.passwordHash });
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [userId]);
  await finishLogin(request, user, { method: "signup", remember: body.remember !== false });
  notifyAdmins({ id: userId }, { type: "user_created", title: `New account: ${s.name}`, body: `${s.email} · signed up`, href: "/users", entityType: "user", entityId: userId });
  return ok({ id: userId, name: s.name, email: s.email }, { status: 201 });
}, { auth: false });
