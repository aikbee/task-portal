/**
 * Relay (TURN) servers for calls. Two ways to have one:
 *  - Cloudflare Realtime TURN: the portal keeps a TURN key (id + API token) and asks Cloudflare for short-lived
 *    credentials when somebody starts or takes a call. Nothing runs on our own server, and what a signed-in account
 *    gets stops working after a few hours.
 *  - a TURN server of your own (turn_url + a fixed username / credential), as before.
 * Without either, calls use public STUN only, which connects most networks but not strict mobile or company NATs.
 */
const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
const CLOUDFLARE_API = "https://rtc.live.cloudflare.com";
const TTL_SECONDS = 6 * 60 * 60; // longer than any call; a leaked credential is useless the same day
const REUSE_MS = 10 * 60 * 1000; // a group call joining, a page reload: no new request to Cloudflare for every one of them
const cache = globalThis.__turnCache ?? (globalThis.__turnCache = new Map()); // userId -> { at, key, servers }

export const turnMode = (s) => (s?.cf_turn_key_id && s?.cf_turn_token ? "cloudflare" : s?.turn_url ? "static" : null);

/** Ask Cloudflare for ICE servers with fresh credentials. Throws with a readable message when the key is refused. */
export async function cloudflareIceServers(settings, { ttl = TTL_SECONDS } = {}) {
  // a test double may stand in for Cloudflare, but never in production
  const base = process.env.NODE_ENV !== "production" && settings.cf_turn_api ? settings.cf_turn_api : CLOUDFLARE_API;
  let res;
  try {
    res = await fetch(`${base}/v1/turn/keys/${encodeURIComponent(settings.cf_turn_key_id)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.cf_turn_token}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(6000),
    });
  } catch (e) {
    throw new Error(`Cloudflare could not be reached (${e.name === "TimeoutError" ? "timed out" : e.message}).`);
  }
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Cloudflare refused the TURN key: check the key ID and the API token." : res.status === 404 ? "Cloudflare does not know this TURN key ID." : `Cloudflare answered ${res.status}.`);
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
  const servers = list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === "string" && !/:53(\?|$)/.test(u)) })) // browsers block port 53: such a URL only times out
    .filter((s) => s.urls.length);
  if (!servers.some((s) => s.username && s.credential)) throw new Error("Cloudflare answered without TURN credentials.");
  return servers;
}

/** What a client passes to RTCPeerConnection. A relay that fails never breaks a call: it falls back to STUN. */
export async function iceServersForUser(settings, userId) {
  const mode = turnMode(settings);
  if (mode === "static") return [STUN, { urls: settings.turn_url, username: settings.turn_username || undefined, credential: settings.turn_credential || undefined }];
  if (mode !== "cloudflare") return [STUN];
  const key = `${settings.cf_turn_key_id}:${settings.cf_turn_api ?? ""}`;
  const hit = cache.get(userId);
  if (hit && hit.key === key && Date.now() - hit.at < REUSE_MS) return hit.servers;
  try {
    const servers = [STUN, ...(await cloudflareIceServers(settings))];
    cache.set(userId, { at: Date.now(), key, servers });
    if (cache.size > 5000) cache.clear();
    return servers;
  } catch (e) {
    console.error("[turn]", e.message);
    return [STUN];
  }
}
export const forgetTurnCache = () => cache.clear();
