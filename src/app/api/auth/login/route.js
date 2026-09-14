import { queryOne } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/password";
import { getSessionUser } from "@/lib/auth";
import { finishLogin } from "@/lib/login";

export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new HttpError("Email and password are required.", 400);

    const { n } = await queryOne("SELECT COUNT(*) AS n FROM users");
    if (n === 0) throw new HttpError("No user accounts exist yet. Run `npm run db:setup` to create the default admin.", 503);

    const user = await queryOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError("Invalid email or password.", 401);

    await finishLogin(request, user, { remember: Boolean(body.remember), method: "password" });
    const me = await getSessionUser(request).catch(() => null);
    const { password_hash, google_sub, ...safe } = user;
    return ok({ ...safe, has_google: Boolean(google_sub), session_id: me?.session_id ?? null });
  },
  { auth: false }
);
