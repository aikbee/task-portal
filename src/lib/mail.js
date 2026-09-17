import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { queryOne, query, execute } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { HttpError } from "./http-error";
import { lastOrigin } from "./origin";

/**
 * Outgoing email. The SMTP account is set by an administrator on the Email page and kept in `app_settings`
 * (the password encrypted with DATA_KEY); SMTP_* environment variables work as a fallback. Every attempt is
 * written to `mail_log` without its body. Nothing here throws into a caller unless asked to (`strict`).
 */
const DEFAULTS = { enabled: false, host: "", port: 587, secure: "starttls", username: "", from_name: "Task Portal", from_email: "", app_url: "", allow_reset: true, allow_notifications: true, allow_invites: true };
export const MAIL_SECURITY = ["none", "starttls", "tls"];

export async function readMailSettings() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'mail'").catch(() => null);
  const raw = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  const env = process.env.SMTP_HOST ? { enabled: true, host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE || "starttls", username: process.env.SMTP_USER || "", from_email: process.env.SMTP_FROM || process.env.SMTP_USER || "", from_name: process.env.SMTP_FROM_NAME || "Task Portal" } : {};
  const s = { ...DEFAULTS, ...env, ...(raw ?? {}) };
  let password = "";
  try { password = s.password_enc ? decryptSecret(s.password_enc) : raw ? "" : process.env.SMTP_PASS || ""; } catch {}
  return { ...s, password, configured: Boolean(s.host && s.from_email) };
}
const ready = (s) => Boolean(s.enabled && s.configured);
/** What anybody may know: whether the portal can send mail and which flows are on. */
export async function publicMailSettings() {
  const s = await readMailSettings();
  return { enabled: ready(s), reset: ready(s) && Boolean(s.allow_reset), invites: ready(s) && Boolean(s.allow_invites), notifications: ready(s) && Boolean(s.allow_notifications) };
}
export async function adminMailSettings() {
  const { password, password_enc, ...rest } = await readMailSettings();
  return { ...rest, password_set: Boolean(password) };
}
export async function saveMailSettings(body, userId) {
  const cur = await readMailSettings();
  const str = (v, max = 190) => String(v ?? "").trim().slice(0, max);
  const next = {
    enabled: Boolean(body.enabled),
    host: str(body.host ?? cur.host),
    port: Number(body.port ?? cur.port) || 587,
    secure: MAIL_SECURITY.includes(body.secure) ? body.secure : cur.secure,
    username: str(body.username ?? cur.username),
    from_name: str(body.from_name ?? cur.from_name, 80) || "Task Portal",
    from_email: str(body.from_email ?? cur.from_email).toLowerCase(),
    app_url: str(body.app_url ?? cur.app_url, 255).replace(/\/+$/, ""),
    allow_reset: "allow_reset" in body ? Boolean(body.allow_reset) : cur.allow_reset,
    allow_notifications: "allow_notifications" in body ? Boolean(body.allow_notifications) : cur.allow_notifications,
    allow_invites: "allow_invites" in body ? Boolean(body.allow_invites) : cur.allow_invites,
  };
  if (next.port < 1 || next.port > 65535) throw new HttpError("The port must be between 1 and 65535.", 400);
  if (next.from_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.from_email)) throw new HttpError("The sender address does not look like an email address.", 400);
  if (next.app_url && !/^https?:\/\//.test(next.app_url)) throw new HttpError("The portal address must start with http:// or https://.", 400);
  if (next.enabled && !(next.host && next.from_email)) throw new HttpError("Enter the mail server and the sender address before turning email on.", 400);
  // an empty password field keeps the stored one; clearing the user name clears it
  const password = typeof body.password === "string" && body.password !== "" ? body.password : next.username ? cur.password : "";
  next.password_enc = password ? encryptSecret(password) : null;
  await execute("INSERT INTO app_settings (name, value, updated_by) VALUES ('mail', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [JSON.stringify(next), userId]);
  return adminMailSettings();
}

/** Absolute address of a page: the configured portal address, else APP_URL, else where this (or the last) request came in. */
export function linkTo(settings, path, request = null) {
  let base = settings?.app_url || process.env.APP_URL || "";
  if (!base && !request) base = lastOrigin();
  if (!base && request) {
    const h = request.headers;
    base = `${h.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")}://${h.get("x-forwarded-host") || h.get("host")}`;
  }
  return `${String(base).replace(/\/+$/, "")}${path}`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** A plain, client-proof message: a title, a few lines, one button, a footer. Returns { html, text }. */
export function renderEmail({ title, lines = [], action = null, footer = "" }) {
  const text = [title, "", ...lines, ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(footer ? ["", "--", footer] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 28px 24px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#6366f1;letter-spacing:.02em">Task Portal</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155">${esc(l)}</p>`).join("")}
${action ? `<p style="margin:22px 0 6px"><a href="${esc(action.url)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">${esc(action.label)}</a></p><p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all">${esc(action.url)}</p>` : ""}
</td></tr>${footer ? `<tr><td style="padding:14px 28px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#64748b">${esc(footer)}</td></tr>` : ""}</table>
</td></tr></table></body></html>`;
  return { html, text };
}

function transportFor(s) {
  return nodemailer.createTransport({
    host: s.host,
    port: Number(s.port),
    secure: s.secure === "tls",
    requireTLS: s.secure === "starttls",
    ignoreTLS: s.secure === "none",
    auth: s.username ? { user: s.username, pass: s.password } : undefined,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
}

// a loop or a bug must not turn the portal into a spam cannon: per-recipient cap, in memory (one process)
const recent = globalThis.__mailRecent ?? (globalThis.__mailRecent = new Map());
function overLimit(to, max = 40, windowMs = 3600000) {
  const now = Date.now();
  const hits = (recent.get(to) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(to, hits);
  return false;
}

/**
 * Send one message. Resolves to { ok, error? }; with `strict` a failure throws (the test button wants the reason).
 * `settings` may be passed to try values that are not saved yet.
 */
export async function sendMail({ to, subject, text, html, kind = "other", settings = null, strict = false }) {
  const s = settings ?? (await readMailSettings());
  const fail = async (message) => {
    await execute("INSERT INTO mail_log (to_email, subject, kind, status, error) VALUES (?, ?, ?, 'failed', ?)", [String(to).slice(0, 190), String(subject).slice(0, 255), kind, String(message).slice(0, 500)]).catch(() => {});
    if (strict) throw new HttpError(message, 502);
    return { ok: false, error: message };
  };
  if (!settings && !ready(s)) return strict ? fail("Email is not set up.") : { ok: false, error: "Email is not set up." };
  if (overLimit(String(to).toLowerCase())) return fail("Too many messages to this address in the last hour.");
  try {
    await transportFor(s).sendMail({ from: { name: s.from_name || "Task Portal", address: s.from_email }, to, subject, text, html });
    await execute("INSERT INTO mail_log (to_email, subject, kind, status) VALUES (?, ?, ?, 'sent')", [String(to).slice(0, 190), String(subject).slice(0, 255), kind]).catch(() => {});
    return { ok: true };
  } catch (e) {
    return fail(e?.message || "The mail server refused the message.");
  }
}
/** Notification types worth an email: things that wait for the person, not a running commentary. */
export const EMAIL_TYPES = new Set(["task_assigned", "task_mention", "task_unblocked", "task_due", "task_overdue", "event_reminder", "profile_invite", "profile_role", "profile_removed", "security_login", "security_method", "backup_failed", "chat_mention"]);
/** The email twin of a bell entry. The link goes through /n/:id so it opens in the right workspace. Never throws. */
export async function sendNotificationEmail({ id, to, type, title, body = null }) {
  try {
    if (!EMAIL_TYPES.has(type)) return false;
    const s = await readMailSettings();
    if (!ready(s) || !s.allow_notifications) return false;
    const url = linkTo(s, `/n/${id}`);
    const { html, text } = renderEmail({ title, lines: body ? [body] : [], action: /^https?:/.test(url) ? { label: "Open in Task Portal", url } : null, footer: "You get this because email notifications are on for your account. Turn them off in Task Portal under Notifications, Settings, Email." });
    return (await sendMail({ to, subject: String(title).slice(0, 200), text, html, kind: "notification", settings: s })).ok;
  } catch {
    return false;
  }
}

export const mailLog = (limit = 40) => query("SELECT id, to_email, subject, kind, status, error, created_at FROM mail_log ORDER BY id DESC LIMIT ?", [limit]);
export const pruneMailLog = () => execute("DELETE FROM mail_log WHERE created_at < NOW() - INTERVAL 60 DAY");

/* ---------- one-time links ---------- */
const sha = (token) => crypto.createHash("sha256").update(token).digest("hex");
/** Create a token row and return the secret to put in the link (it is never stored). */
export async function issueToken({ purpose, userId = null, email = null, profileId = null, role = null, invitedBy = null, ip = null, hours }) {
  const token = crypto.randomBytes(32).toString("base64url");
  await execute("INSERT INTO mail_tokens (purpose, token_hash, user_id, email, profile_id, role, invited_by, ip, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))", [purpose, sha(token), userId, email, profileId, role, invitedBy, ip, hours]);
  return token;
}
/** The live row behind a token, or null (unknown, used or expired). */
export const findToken = (purpose, token) => (typeof token === "string" && token.length >= 20 ? queryOne("SELECT * FROM mail_tokens WHERE purpose = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()", [purpose, sha(token)]) : null);
export const useToken = (id) => execute("UPDATE mail_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [id]);
/** Invitations to people without an account that still wait for an answer. */
export const pendingInvites = (profileId) =>
  query("SELECT t.id, t.email, t.role, t.created_at, t.expires_at, u.name AS invited_by_name FROM mail_tokens t LEFT JOIN users u ON u.id = t.invited_by WHERE t.purpose = 'join' AND t.profile_id = ? AND t.used_at IS NULL AND t.expires_at > NOW() ORDER BY t.id", [profileId]);
export const pruneTokens = () => execute("DELETE FROM mail_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY");
