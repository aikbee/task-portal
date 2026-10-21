import crypto from "node:crypto";
import { queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { hashPassword } from "./password";
import { sessionSecret } from "./session-token";
import { readMailSettings, publicMailSettings, renderEmail, sendMail, linkTo } from "./mail";

/**
 * Open sign-up: anybody may ask for an account with a name, an address and a password; a 6-digit code goes to that
 * address, and the account is made when the code comes back (POST /api/auth/signup, then /verify). Off unless an
 * administrator allows it on the Email page, and only while the portal can send mail. Asking for an address that has
 * an account already answers exactly the same, so nobody learns who has one; that person gets an email saying so
 * instead of a code.
 */
export const SIGNUP_PASSWORD_MIN = 8;
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const PER_IP_PER_HOUR = 5;
const PER_ADDRESS_PER_HOUR = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// asking too often: per address and per IP, in this process (one pm2 process) on top of the table's own count
const recent = globalThis.__signupRecent ?? (globalThis.__signupRecent = new Map());
function tooOften(key, max) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 10_000) recent.clear();
  return false;
}

export async function signupOpen() {
  return (await publicMailSettings()).signup;
}

const codeHash = (email, code) => crypto.createHmac("sha256", sessionSecret()).update(`signup:${email}:${code}`).digest("hex");

/** Step 1: { name, email, password } → a code by email. Always answers { sent, email } for a well-formed request. */
export async function requestSignup(request, body, ip) {
  if (!(await signupOpen())) throw new HttpError("Creating an account is not open on this portal. Ask an administrator for one.", 403);
  pruneSignups();
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!name) throw new HttpError("Enter your name.", 400);
  if (!EMAIL_RE.test(email) || email.length > 190) throw new HttpError("Enter a valid email address.", 400);
  if (password.length < SIGNUP_PASSWORD_MIN) throw new HttpError(`The password needs at least ${SIGNUP_PASSWORD_MIN} characters.`, 400);
  if (password.toLowerCase() === email) throw new HttpError("Choose a password that is not your email address.", 400);
  // this machine itself (tests, the developer) is not counted outside production
  const counted = ip && !(process.env.NODE_ENV !== "production" && /^(127\.|::1$|::ffff:127\.)/.test(ip)) ? ip : null;
  const fromIp = counted ? Number((await queryOne("SELECT COUNT(*) AS n FROM signup_requests WHERE ip = ? AND created_at > NOW() - INTERVAL 1 HOUR", [counted]))?.n ?? 0) : 0;
  if (fromIp >= PER_IP_PER_HOUR || (counted && tooOften(`ip:${counted}`, PER_IP_PER_HOUR)) || tooOften(`to:${email}`, PER_ADDRESS_PER_HOUR)) {
    throw new HttpError("Too many sign-up attempts. Try again in an hour.", 429);
  }
  const settings = await readMailSettings();
  const existing = await queryOne("SELECT id, name, status FROM users WHERE LOWER(email) = ?", [email]);
  if (existing) {
    // the same answer as for a new address; the owner of the address hears about it instead
    await execute("DELETE FROM signup_requests WHERE email = ?", [email]);
    const { html, text } = renderEmail({
      title: "You already have an account",
      lines: [
        `Somebody (probably you) tried to create a Task Portal account with ${email}, which already has one.`,
        "Sign in with it instead. If you forgot the password, use \"Forgot password?\" on the sign-in page.",
        "If this was not you, you can ignore this email: nothing has changed.",
      ],
      action: { label: "Sign in", url: linkTo(settings, "/login", request) },
    });
    await sendMail({ to: email, subject: "You already have a Task Portal account", text, html, kind: "signup", settings });
    return { sent: true, email };
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await execute(
    `INSERT INTO signup_requests (email, name, password_hash, code_hash, attempts, ip, expires_at) VALUES (?, ?, ?, ?, 0, ?, NOW() + INTERVAL ${CODE_MINUTES} MINUTE) AS new
     ON DUPLICATE KEY UPDATE name = new.name, password_hash = new.password_hash, code_hash = new.code_hash, attempts = 0, ip = new.ip, expires_at = new.expires_at, created_at = CURRENT_TIMESTAMP`,
    [email, name, hashPassword(password), codeHash(email, code), ip]
  );
  const { html, text } = renderEmail({
    title: `${code} is your Task Portal code`,
    lines: [`Hello ${name}, enter this code to finish creating your Task Portal account:`, code, `It works for ${CODE_MINUTES} minutes. If you did not ask for an account, ignore this email: without the code nothing happens.`],
  });
  const res = await sendMail({ to: email, subject: `${code} is your Task Portal code`, text, html, kind: "signup", settings });
  if (!res.ok) {
    await execute("DELETE FROM signup_requests WHERE email = ?", [email]);
    throw new HttpError("The code could not be sent. Check the address, or try again later.", 502);
  }
  return { sent: true, email };
}

/** Step 2: { email, code } → the request, once (the caller makes the account). Wrong codes count; five end it. */
export async function takeSignup(body) {
  if (!(await signupOpen())) throw new HttpError("Creating an account is not open on this portal. Ask an administrator for one.", 403);
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\D/g, "");
  const row = await queryOne("SELECT id, email, name, password_hash, code_hash, attempts, expires_at > NOW() AS live FROM signup_requests WHERE email = ?", [email]);
  if (!row || !row.live) {
    if (row) await execute("DELETE FROM signup_requests WHERE id = ?", [row.id]);
    throw new HttpError("That code is not right, or it has expired. Ask for a new one.", 400);
  }
  const want = Buffer.from(row.code_hash, "hex");
  const got = Buffer.from(codeHash(email, code), "hex");
  if (code.length !== 6 || !crypto.timingSafeEqual(want, got)) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await execute("DELETE FROM signup_requests WHERE id = ?", [row.id]);
      throw new HttpError("Too many wrong codes. Start again to get a new one.", 400);
    }
    await execute("UPDATE signup_requests SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    throw new HttpError("That code is not right, or it has expired. Ask for a new one.", 400);
  }
  // spent before the account exists, so the same code cannot make two
  const gone = await execute("DELETE FROM signup_requests WHERE id = ?", [row.id]);
  if (!gone.affectedRows) throw new HttpError("That code is not right, or it has expired. Ask for a new one.", 400);
  if (await queryOne("SELECT id FROM users WHERE LOWER(email) = ?", [email])) throw new HttpError("An account with this email exists already. Sign in instead.", 409);
  return { email: row.email, name: row.name, passwordHash: row.password_hash };
}

/** Old requests nobody finished. */
const pruneSignups = () => execute("DELETE FROM signup_requests WHERE expires_at < NOW() - INTERVAL 1 DAY").catch(() => {});
