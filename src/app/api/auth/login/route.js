import { queryOne, execute } from "@/lib/db";
import { handler, ok, readJson, HttpError } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/password";
import { createSession, pruneSessions, getSessionUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";

export const POST = handler(
  async (request) => {
    const body = await readJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new HttpError("Email and password are required.", 400);

    const [{ n }] = await (async () => [await queryOne("SELECT COUNT(*) AS n FROM users")])();
    if (n === 0) throw new HttpError("No user accounts exist yet. Run `npm run db:setup` to create the default admin.", 503);

    const user = await queryOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError("Invalid email or password.", 401);
    if (user.status !== "active") throw new HttpError("This account is disabled.", 403);

    await createSession(user.id, { remember: Boolean(body.remember), userAgent: request.headers.get("user-agent") || "" });
    await execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    pruneSessions().catch(() => {});
    const ua = request.headers.get("user-agent") || "";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : !ua || /^(node|curl|python|wget|postman|insomnia)/i.test(ua) ? "an API client" : "a browser";
    const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : null;
    notify({ userId: user.id, type: "security_login", title: `New sign-in from ${browser}${os ? ` on ${os}` : ""}`, body: "If this wasn't you, change your password from Profile & password.", href: "/notifications", entityType: "user", entityId: user.id }).catch(() => {});
    const me = await getSessionUser(request).catch(() => null);
    const { password_hash, ...safe } = user;
    return ok({ ...safe, session_id: me?.session_id ?? null });
  },
  { auth: false }
);
