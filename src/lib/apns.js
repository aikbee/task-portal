import http2 from "node:http2";
import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";

/**
 * iPhone notifications through Apple's push service (APNs). An administrator saves the portal's APNs key on the
 * Mobile app page: the .p8 file made under Keys in the Apple Developer account, its Key ID and the Team ID. The
 * iPhone app registers its device token for the session it is signed in with (apns_devices), so a phone stops
 * getting pushes the moment that session ends. Without a key nothing is sent and nothing else changes.
 */
export const APNS_TOPIC = "com.systemportal.task";
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" };
export const TOKEN_RE = /^[0-9a-f]{64,200}$/;
export const BUNDLE_RE = /^com\.systemportal\.task(\.[a-z]+)?$/;
const ID_RE = /^[A-Z0-9]{10}$/; // Team ID and Key ID: ten letters and digits
const JWT_REUSE_MS = 40 * 60 * 1000; // Apple wants a new provider token at most every 20 minutes and at least every hour
export const MAX_DEVICES_PER_USER = 20;

// one HTTP/2 connection per Apple host, the provider token, and what happened last (for the admin card)
const state = globalThis.__apnsState ?? (globalThis.__apnsState = { sessions: new Map(), jwt: null, lastOkAt: null, lastError: null, lastErrorAt: null });

/** The saved key, decrypted. `ready` once all three parts are there. */
export async function readApnsSettings() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = 'apns'").catch(() => null);
  let raw = null;
  try { raw = row?.value ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null; } catch {}
  let key = null;
  try { key = raw?.key_enc ? decryptSecret(raw.key_enc) : null; } catch {}
  const teamId = ID_RE.test(raw?.team_id ?? "") ? raw.team_id : null;
  const keyId = ID_RE.test(raw?.key_id ?? "") ? raw.key_id : null;
  return {
    team_id: teamId,
    key_id: keyId,
    key,
    key_enc: raw?.key_enc ?? null,
    ready: Boolean(teamId && keyId && key),
    // a stand-in for Apple's servers in tests, never in production
    test_host: process.env.NODE_ENV !== "production" && typeof raw?.test_host === "string" && /^https?:\/\/[\w.:[\]-]+$/.test(raw.test_host) ? raw.test_host : null,
  };
}

/** What administrators see: the key itself never leaves the server. */
export async function publicApnsSettings(s) {
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM apns_devices d JOIN sessions s ON s.id = d.session_id WHERE s.expires_at > NOW()");
  return {
    team_id: s.team_id,
    key_id: s.key_id,
    key_set: Boolean(s.key),
    ready: s.ready,
    topic: APNS_TOPIC,
    devices: Number(n),
    last_ok_at: state.lastOkAt ? new Date(state.lastOkAt).toISOString() : null,
    last_error: state.lastError,
    last_error_at: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : null,
  };
}

/** { team_id, key_id, key (PEM text or null to keep, "" to remove), test_host } */
export async function saveApnsSettings({ team_id, key_id, key, test_host }, userId) {
  const current = await readApnsSettings();
  const next = { team_id: team_id ?? current.team_id, key_id: key_id ?? current.key_id, key_enc: key === undefined || key === null ? current.key_enc : key ? encryptSecret(key) : null };
  if (process.env.NODE_ENV !== "production" && test_host) next.test_host = test_host;
  await execute("INSERT INTO app_settings (name, value, updated_by) VALUES ('apns', ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [JSON.stringify(next), userId]);
  state.jwt = null;
  state.lastOkAt = state.lastError = state.lastErrorAt = null; // what Apple said was about the key before
  for (const session of state.sessions.values()) session.close();
  state.sessions.clear();
}

export const validTeamOrKeyId = (v) => ID_RE.test(v);

/** The text of an AuthKey_XXXXXXXXXX.p8 file, checked: an EC P-256 private key is what Apple hands out. */
export function readP8(text) {
  const pem = String(text ?? "").trim();
  if (!/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/.test(pem)) throw new Error("That is not a .p8 key file: it should start with -----BEGIN PRIVATE KEY-----.");
  let key;
  try { key = crypto.createPrivateKey(pem); } catch { throw new Error("The .p8 file could not be read as a private key."); }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("This key is not an APNs key (Apple's are P-256 EC keys).");
  return pem;
}

/** The provider token (a JWT signed with the key), reused for 40 minutes. */
function providerToken(s) {
  const id = `${s.team_id}:${s.key_id}:${crypto.createHash("sha256").update(s.key).digest("hex")}`;
  if (state.jwt?.id === id && Date.now() - state.jwt.at < JWT_REUSE_MS) return state.jwt.token;
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signed = `${part({ alg: "ES256", kid: s.key_id })}.${part({ iss: s.team_id, iat: Math.floor(Date.now() / 1000) })}`;
  const signature = crypto.sign("sha256", Buffer.from(signed), { key: s.key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  state.jwt = { id, at: Date.now(), token: `${signed}.${signature}` };
  return state.jwt.token;
}

const originFor = (s, environment) => s.test_host || HOSTS[environment] || HOSTS.production;

function connection(origin) {
  const open = state.sessions.get(origin);
  if (open && !open.closed && !open.destroyed) return open;
  const session = http2.connect(origin);
  session.on("error", () => {});
  session.on("close", () => { if (state.sessions.get(origin) === session) state.sessions.delete(origin); });
  session.on("goaway", () => { state.sessions.delete(origin); session.close(); });
  session.setTimeout(60_000, () => session.close()); // idle: Apple keeps connections open, but there is no need to
  state.sessions.set(origin, session);
  return session;
}

/** One POST over HTTP/2: { status, reason } (status 0 = Apple could not be reached). Never throws. */
function post(origin, path, headers, body) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    let req;
    try {
      req = connection(origin).request({ ":method": "POST", ":path": path, ...headers });
    } catch {
      // the connection was closing (Apple said goodbye): a new one
      state.sessions.delete(origin);
      try {
        req = connection(origin).request({ ":method": "POST", ":path": path, ...headers });
      } catch (e) {
        return finish({ status: 0, reason: e.code || e.message });
      }
    }
    let status = 0;
    let text = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { status = Number(h[":status"]) || 0; });
    req.on("data", (c) => { if (text.length < 2000) text += c; });
    req.on("end", () => {
      let reason = null;
      try { reason = text ? JSON.parse(text).reason ?? null : null; } catch {}
      finish({ status, reason });
    });
    req.on("error", (e) => finish({ status: 0, reason: e.code || e.message }));
    req.setTimeout(10_000, () => { req.close(http2.constants.NGHTTP2_CANCEL); finish({ status: 0, reason: "Timeout" }); });
    req.end(body);
  });
}

/** Apple's reasons in words an administrator can act on. */
export function reasonText(status, reason) {
  if (status === 0) return `Apple's push service could not be reached (${reason || "no answer"}).`;
  switch (reason) {
    case "InvalidProviderToken": return "Apple refused the key: check the Team ID, the Key ID and that the .p8 file is the one made for that Key ID.";
    case "ExpiredProviderToken": return "Apple says the key's token is out of date: check this server's clock.";
    case "MissingProviderToken": return "Apple got no key with the request.";
    case "Forbidden": return "This key may not send notifications: tick Apple Push Notifications service (APNs) for it in the developer account.";
    case "TopicDisallowed": case "BadTopic": return `The key's team may not send for ${APNS_TOPIC}: the app ID must belong to the same team as the key.`;
    case "TooManyProviderTokenUpdates": return "Apple saw too many new key tokens in a short time; it settles by itself.";
    default: return `Apple answered ${status}${reason ? ` (${reason})` : ""}.`;
  }
}

function noteError(text) {
  state.lastError = text;
  state.lastErrorAt = Date.now();
}

/** The chat or task a notification is about, so the phone stacks them (thread) and opens the right screen. */
function threadOf(href) {
  const chat = /^\/chat\?(?:.*&)?c=(\d+)/.exec(href || "");
  if (chat) return `chat-${chat[1]}`;
  const task = /^\/tasks\/(\d+)/.exec(href || "");
  return task ? `task-${task[1]}` : "portal";
}

/** What APNs gets for a notification ({ title, body, href, tag, type, … } as for Web Push), under its 4 KB limit. */
export function apnsPayload(p, badge = null) {
  const clip = (v, n) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const title = clip(p.title, 200);
  const body = clip(p.body, 600);
  return {
    // no body: the title is the whole message (chat lines are "Ann: hi"), shown in full under the app's name
    aps: { alert: body ? { title, body } : { body: title }, sound: "default", "thread-id": threadOf(p.href), ...(badge != null ? { badge } : {}) },
    href: p.href || "/notifications",
    ...(p.type ? { type: p.type } : {}),
    ...(p.notification_id ? { notification_id: p.notification_id } : {}),
    ...(p.profile_id ? { profile_id: p.profile_id } : {}),
    ...(p.missed ? { missed: true } : {}),
  };
}

/** Send to these device rows. Gone tokens are dropped; a token of the other environment is tried there once. */
async function deliver(s, devices, payload, { ttl = 12 * 3600, urgency = "normal", badge = null } = {}) {
  const body = JSON.stringify(apnsPayload(payload, badge));
  let sent = 0;
  let error = null;
  await Promise.all(
    devices.map(async (d) => {
      const send = (environment) =>
        post(originFor(s, environment), `/3/device/${d.token}`, {
          authorization: `bearer ${providerToken(s)}`,
          "apns-topic": d.bundle_id || APNS_TOPIC,
          "apns-push-type": "alert",
          "apns-priority": urgency === "low" || urgency === "very-low" ? "5" : "10",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + Math.max(0, Number(ttl) || 0)),
          "content-type": "application/json",
        }, body);
      let r = await send(d.environment);
      if (r.status === 403 && r.reason === "ExpiredProviderToken") {
        state.jwt = null;
        r = await send(d.environment);
      }
      if (r.status === 400 && r.reason === "BadDeviceToken") {
        // a token from the other environment: a TestFlight build where a build from Xcode was before, or the reverse
        const other = d.environment === "sandbox" ? "production" : "sandbox";
        const again = await send(other);
        if (again.status === 200) {
          r = again;
          execute("UPDATE apns_devices SET environment = ? WHERE id = ?", [other, d.id]).catch(() => {});
        }
      }
      if (r.status === 200) {
        sent++;
        state.lastOkAt = Date.now();
        execute("UPDATE apns_devices SET last_sent_at = NOW(), last_error = NULL WHERE id = ?", [d.id]).catch(() => {});
        return;
      }
      if (r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"))) {
        await execute("DELETE FROM apns_devices WHERE id = ?", [d.id]).catch(() => {}); // the app was removed, or the token was never good
        return;
      }
      error = reasonText(r.status, r.reason);
      noteError(error);
      execute("UPDATE apns_devices SET last_error = ? WHERE id = ?", [`${r.status} ${r.reason ?? ""}`.trim().slice(0, 255), d.id]).catch(() => {});
    })
  );
  return { sent, total: devices.length, error };
}

const unreadOf = async (userId) => Number((await queryOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]))?.n ?? 0);

/**
 * Push a notification to a user's iPhones (the ones signed in now). `ring` pushes are skipped: the iPhone app does
 * not take calls yet, and the missed-call notice follows. Never throws.
 */
export async function sendApns(userId, payload, options = {}) {
  try {
    if (payload?.ring) return { sent: 0, total: 0 };
    const s = await readApnsSettings();
    if (!s.ready) return { sent: 0, total: 0 };
    const devices = await query("SELECT d.id, d.token, d.environment, d.bundle_id FROM apns_devices d JOIN sessions s ON s.id = d.session_id WHERE d.user_id = ? AND s.expires_at > NOW()", [userId]);
    if (!devices.length) return { sent: 0, total: 0 };
    return await deliver(s, devices, payload, { ...options, badge: await unreadOf(userId) });
  } catch (e) {
    noteError(e.message);
    return { sent: 0, total: 0, error: e.message };
  }
}

/** The phone signed in with this session: a test notification from its own More screen. */
export async function sendApnsToSession(sessionId, userId, payload) {
  const s = await readApnsSettings();
  if (!s.ready) return { sent: 0, total: 0, error: "iPhone notifications are not set up on this portal yet: an administrator adds Apple's push key on the Mobile app page." };
  const devices = await query("SELECT id, token, environment, bundle_id FROM apns_devices WHERE session_id = ? AND user_id = ?", [sessionId, userId]);
  if (!devices.length) return { sent: 0, total: 0, error: "This iPhone has not registered for notifications yet." };
  return deliver(s, devices, payload, { badge: await unreadOf(userId) });
}

/**
 * Check the saved key without a phone: a push to a token that cannot exist. Apple checks the key first, so
 * BadDeviceToken means the key, the team and the app ID are fine. Throws with a readable message otherwise.
 */
export async function testApnsKey(s) {
  if (!s.ready) throw new Error("Save the Team ID, the Key ID and the .p8 key first.");
  const r = await post(originFor(s, "production"), `/3/device/${"0".repeat(64)}`, {
    authorization: `bearer ${providerToken(s)}`,
    "apns-topic": APNS_TOPIC,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "content-type": "application/json",
  }, JSON.stringify({ aps: { alert: { body: "Key check" } } }));
  if (r.status === 400 && r.reason === "BadDeviceToken") {
    state.lastOkAt = Date.now();
    state.lastError = state.lastErrorAt = null;
    return { ok: true };
  }
  if (r.status === 403) state.jwt = null;
  const message = reasonText(r.status, r.reason);
  noteError(message);
  throw new Error(message);
}
