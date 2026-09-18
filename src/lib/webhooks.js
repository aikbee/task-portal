import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { notify } from "./notifications";

/**
 * Outgoing webhooks. `emit()` records one delivery per subscribed hook of the profile and posts it at once;
 * what fails is retried by the scheduler (1, 5 and 25 minutes later), and a hook that keeps failing pauses
 * itself. Bodies are signed: X-TaskPortal-Signature: sha256=<HMAC-SHA256 of the raw body with the secret>.
 */
export const WEBHOOK_EVENTS = {
  "task.created": "A task is created", "task.updated": "A task changes", "task.completed": "A task is marked done", "task.deleted": "A task is deleted", "task.comment": "Somebody comments on a task",
  "project.created": "A project is created", "project.updated": "A project changes", "project.deleted": "A project is deleted",
  "requirement.created": "A requirement is created", "requirement.updated": "A requirement changes", "requirement.deleted": "A requirement is deleted",
};
const MAX_ATTEMPTS = 4;
const PAUSE_AFTER = 20;
const TIMEOUT_MS = 8000;
const BACKOFF_MIN = [1, 5, 25];

/** http(s) only; private and loopback addresses are refused in production (a hook must not probe the server's network). */
export function checkWebhookUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? "").trim()); } catch { throw new HttpError("Enter a full address, like https://example.com/hook.", 400); }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError("The address must start with http:// or https://.", 400);
  if (u.username || u.password) throw new HttpError("Put credentials in a header on the receiving side, not in the address.", 400);
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || host === "::1" || host.startsWith("[::1]") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  if (local && process.env.NODE_ENV === "production" && process.env.WEBHOOK_ALLOW_LOCAL !== "1") throw new HttpError("Addresses inside the server's own network are not allowed.", 400);
  if (u.href.length > 500) throw new HttpError("The address is too long.", 400);
  return u.href;
}
const eventList = (raw) => {
  if (raw === "*" || raw == null) return "*";
  const list = (Array.isArray(raw) ? raw : String(raw).split(",")).map((e) => String(e).trim()).filter((e) => WEBHOOK_EVENTS[e]);
  return list.length ? [...new Set(list)].join(",") : "*";
};
const shape = (r) => ({ ...r, active: Boolean(r.active), events: r.events === "*" ? ["*"] : r.events.split(","), secret: undefined, secret_hint: `${r.secret.slice(0, 4)}…` });

export const listWebhooks = async (profileId) => (await query("SELECT w.*, u.name AS created_by FROM webhooks w LEFT JOIN users u ON u.id = w.user_id WHERE w.profile_id = ? ORDER BY w.id", [profileId])).map(shape);

/** { url, events?: [...]|"*" } → the row plus the secret, shown this once. At most 10 per profile. */
export async function createWebhook(user, profileId, body) {
  const url = checkWebhookUrl(body.url);
  const n = await queryOne("SELECT COUNT(*) AS n FROM webhooks WHERE profile_id = ?", [profileId]);
  if (Number(n?.n) >= 10) throw new HttpError("That is enough webhooks for one profile: remove one first.", 400);
  const secret = `whs_${crypto.randomBytes(24).toString("base64url")}`;
  const res = await execute("INSERT INTO webhooks (profile_id, user_id, url, secret, events) VALUES (?, ?, ?, ?, ?)", [profileId, user.id, url, secret, eventList(body.events)]);
  const row = await queryOne("SELECT * FROM webhooks WHERE id = ?", [res.insertId]);
  return { ...shape(row), secret };
}
/** { url?, events?, active? }: turning a paused hook on again clears its failure count. */
export async function updateWebhook(profileId, id, body) {
  const cur = await queryOne("SELECT * FROM webhooks WHERE id = ? AND profile_id = ?", [id, profileId]);
  if (!cur) throw new HttpError("Webhook not found.", 404);
  const sets = [];
  const args = [];
  if ("url" in body) { sets.push("url = ?"); args.push(checkWebhookUrl(body.url)); }
  if ("events" in body) { sets.push("events = ?"); args.push(eventList(body.events)); }
  if ("active" in body) { sets.push("active = ?", "failures = ?"); args.push(body.active ? 1 : 0, 0); }
  if (sets.length) await execute(`UPDATE webhooks SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  return shape(await queryOne("SELECT * FROM webhooks WHERE id = ?", [id]));
}
export async function deleteWebhook(profileId, id) {
  const res = await execute("DELETE FROM webhooks WHERE id = ? AND profile_id = ?", [id, profileId]);
  if (!res.affectedRows) throw new HttpError("Webhook not found.", 404);
}
export const listDeliveries = (webhookId, limit = 30) => query("SELECT id, event, status, attempts, response_status, error, next_attempt_at, delivered_at, created_at FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?", [webhookId, limit]);

/** Tell the hooks of the acting user's profile. Never throws, never awaited by callers. */
export async function emit(user, event, data) {
  try {
    const hooks = await query("SELECT id, events FROM webhooks WHERE profile_id = ? AND active = 1", [user.profile_id]);
    const wanted = hooks.filter((h) => h.events === "*" || h.events.split(",").includes(event));
    if (!wanted.length) return;
    const payload = { event, at: new Date().toISOString(), profile: { id: user.profile_id, name: user.profile?.name ?? null }, actor: { id: user.id, name: user.name }, data };
    for (const h of wanted) {
      const res = await execute("INSERT INTO webhook_deliveries (webhook_id, event, payload, status, next_attempt_at) VALUES (?, ?, ?, 'pending', NOW())", [h.id, event, JSON.stringify(payload)]);
      deliver(res.insertId).catch(() => {});
    }
  } catch (e) {
    console.error("[webhooks] emit", e.message);
  }
}
/** A hook's owner presses "Send test": a ping goes out right away and the result comes back. */
export async function sendTest(user, profileId, id) {
  const hook = await queryOne("SELECT id FROM webhooks WHERE id = ? AND profile_id = ?", [id, profileId]);
  if (!hook) throw new HttpError("Webhook not found.", 404);
  const payload = { event: "ping", at: new Date().toISOString(), profile: { id: profileId, name: user.profile?.name ?? null }, actor: { id: user.id, name: user.name }, data: { message: "Hello from Task Portal" } };
  const res = await execute("INSERT INTO webhook_deliveries (webhook_id, event, payload, status, next_attempt_at) VALUES (?, 'ping', ?, 'pending', NOW())", [id, JSON.stringify(payload)]);
  return deliver(res.insertId, { once: true });
}

/** One attempt at one delivery. `once`: no retry (tests). Returns the delivery row afterwards. */
export async function deliver(deliveryId, { once = false } = {}) {
  const d = await queryOne("SELECT d.*, w.url, w.secret, w.failures, w.active, w.user_id AS owner_id, w.profile_id FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = ? AND d.status = 'pending'", [deliveryId]);
  if (!d) return null;
  const body = typeof d.payload === "string" ? d.payload : JSON.stringify(d.payload);
  const signature = `sha256=${crypto.createHmac("sha256", d.secret).update(body).digest("hex")}`;
  const attempts = d.attempts + 1;
  let status = null;
  let error = null;
  try {
    const res = await fetch(d.url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "TaskPortal-Webhooks/1", "x-taskportal-event": d.event, "x-taskportal-delivery": String(d.id), "x-taskportal-signature": signature }, body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
    status = res.status;
    if (!(res.status >= 200 && res.status < 300)) error = `HTTP ${res.status}`;
  } catch (e) {
    error = (e?.name === "TimeoutError" ? "No answer within 8 seconds" : e?.cause?.code || e?.message || "Request failed").slice(0, 255);
  }
  if (!error) {
    await execute("UPDATE webhook_deliveries SET status = 'sent', attempts = ?, response_status = ?, error = NULL, next_attempt_at = NULL, delivered_at = NOW() WHERE id = ?", [attempts, status, d.id]);
    await execute("UPDATE webhooks SET failures = 0, last_status = ?, last_delivered_at = NOW() WHERE id = ?", [status, d.webhook_id]);
  } else {
    const dead = once || attempts >= MAX_ATTEMPTS;
    const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    await execute(`UPDATE webhook_deliveries SET status = ?, attempts = ?, response_status = ?, error = ?, next_attempt_at = ${dead ? "NULL" : "DATE_ADD(NOW(), INTERVAL ? MINUTE)"} WHERE id = ?`, dead ? ["failed", attempts, status, error, d.id] : ["pending", attempts, status, error, wait, d.id]);
    const failures = d.failures + 1;
    await execute("UPDATE webhooks SET failures = ?, last_status = ? WHERE id = ?", [failures, status, d.webhook_id]);
    if (failures >= PAUSE_AFTER && d.active) {
      await execute("UPDATE webhooks SET active = 0 WHERE id = ?", [d.webhook_id]);
      notify({ userId: d.owner_id, type: "backup_failed", title: "A webhook was paused", body: `${d.url} failed ${failures} times in a row. Fix the receiver, then turn it on again under Profiles → Webhooks.`, href: "/profiles", entityType: "profile", entityId: d.profile_id, dedupeKey: `webhook-paused:${d.webhook_id}:${Date.now()}` }).catch(() => {});
    }
  }
  return queryOne("SELECT id, event, status, attempts, response_status, error, next_attempt_at, delivered_at, created_at FROM webhook_deliveries WHERE id = ?", [d.id]);
}
/** Scheduler: due retries (a few at a time) and old rows. */
export async function retryDeliveries(limit = 50) {
  const due = await query("SELECT d.id FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.status = 'pending' AND d.next_attempt_at <= NOW() AND w.active = 1 ORDER BY d.id LIMIT ?", [limit]);
  for (const r of due) await deliver(r.id).catch(() => {});
  return due.length;
}
export const pruneDeliveries = () => execute("DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL 14 DAY");
