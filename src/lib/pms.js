import { decryptSecret } from "./crypto";
import { HttpError } from "./http-error";

/**
 * Bitara PMS client (REST, https://pms.bitara.co/api/v1; the OpenAPI file is at /api/openapi.json). Every call
 * carries the person's own token and says it comes from Task Portal (X-PMS-Client, used for PMS's audit trail only).
 *
 * PMS documents its request bodies but not its answers, so answers are read tolerantly: a list may come bare or
 * wrapped ({ data }, { items } …), a ticket key is recognised by its shape (PROJECT-12), a worklog by the
 * externalRef we gave it. Errors are RFC 7807 problem+json.
 */
export const PMS_BASE = "https://pms.bitara.co/api/v1";
export const PMS_CLIENT = "task-portal";
const TIMEOUT_MS = 20_000;

/** A local test server instead of Bitara PMS: development and the smoke test only, never in production. */
export const customBaseAllowed = () => process.env.NODE_ENV !== "production" || process.env.PMS_ALLOW_CUSTOM_BASE === "1";
export function checkBaseUrl(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  if (!customBaseAllowed()) throw new HttpError("The Bitara PMS address cannot be changed on this server.", 400);
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new HttpError("That is not a web address.", 400);
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError("The address must start with http:// or https://.", 400);
  return u.href.replace(/\/+$/, "").slice(0, 200);
}
export const baseOf = (conn) => (conn?.base_url && customBaseAllowed() ? conn.base_url : PMS_BASE);

/** A failed PMS call. `status` is what Task Portal answers (a refused token must not look like our own 401). */
export class PmsError extends HttpError {
  constructor(message, pmsStatus, info = {}) {
    super(message, pmsStatus === 401 ? 400 : !pmsStatus || pmsStatus >= 500 ? 502 : pmsStatus, { pms: { status: pmsStatus || null, ...info } });
    this.pmsStatus = pmsStatus || 0;
    this.info = info;
  }
}

const isObj = (x) => x != null && typeof x === "object" && !Array.isArray(x);
const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
/** "OPEN", or { code: "OPEN", label } → "OPEN" */
export const codeOf = (v) => (isObj(v) ? str(v.code ?? v.key ?? v.value ?? v.name) : str(v));

function problemOf(status, body, text) {
  const p = isObj(body) ? body : {};
  const listed = Array.isArray(p.message) ? p.message.map(str).filter(Boolean).join("; ") : Array.isArray(p.errors) ? p.errors.map((e) => (isObj(e) ? str(e.message ?? e.detail) : str(e))).filter(Boolean).join("; ") : "";
  const title = str(p.title) || (typeof p.message === "string" ? p.message.trim() : "") || str(p.error) || (!body && text && text.length < 160 ? text.trim() : "") || `HTTP ${status}`;
  const detail = [str(p.detail), listed].filter((d) => d && d !== title).join(" — ");
  const allowed = Array.isArray(p.allowed) ? p.allowed.map(codeOf).filter(Boolean) : undefined;
  const said = detail ? `${title}: ${detail}` : title;
  const message =
    status === 401 ? "Bitara PMS refused the token: it is wrong, expired or revoked."
    : status === 403 ? `Bitara PMS does not allow this for your token (${said}).`
    : status === 404 ? `Bitara PMS: not found, or your token cannot see it (${said}).`
    : status === 429 ? "Bitara PMS asks to slow down. Try again in a minute."
    : `Bitara PMS: ${said}`;
  return new PmsError(message.slice(0, 600), status, { type: str(p.type) || undefined, title, detail: detail || undefined, allowed });
}

/**
 * One call. conn: a pms_connections row (token_enc) or { token, base_url }. json → JSON body, form → FormData.
 * Answers the parsed JSON (null for an empty answer); throws PmsError.
 */
export async function pmsFetch(conn, method, path, { json, form, query } = {}) {
  const token = conn.token ?? decryptSecret(conn.token_enc);
  const url = new URL(baseOf(conn) + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== "") url.searchParams.set(k, String(v));
  const headers = { authorization: `Bearer ${token}`, accept: "application/json, application/problem+json", "x-pms-client": PMS_CLIENT, "user-agent": "TaskPortal/1 (Bitara PMS link)" };
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) body = form;
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error", cache: "no-store" });
  } catch (e) {
    const why = e?.name === "TimeoutError" ? "it did not answer within 20 seconds" : e?.cause?.code || e?.message || "network error";
    throw new PmsError(`Could not reach Bitara PMS (${why}).`, 0, { network: true });
  }
  const text = await res.text().catch(() => "");
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw problemOf(res.status, data, text);
  return data;
}

/* ---------- reading answers ---------- */

/** The payload inside a { data } / { result } wrapper. */
export function unwrap(x) {
  let v = x;
  for (let i = 0; i < 3 && isObj(v); i++) {
    const inner = v.data ?? v.result;
    if (Object.keys(v).length <= 4 && (isObj(inner) || Array.isArray(inner))) v = inner;
    else break;
  }
  return v;
}
/** The list in an answer: the answer itself, or the first array under one of `keys` (two levels deep at most). */
export function listIn(x, keys = [], depth = 2) {
  const v = unwrap(x);
  if (Array.isArray(v)) return v;
  if (!isObj(v) || depth < 0) return [];
  for (const k of [...keys, "items", "data", "results", "rows", "entries", "list"]) if (Array.isArray(v[k])) return v[k];
  for (const k of [...keys, "data", "result", "page"]) if (isObj(v[k])) { const inner = listIn(v[k], keys, depth - 1); if (inner.length) return inner; }
  return [];
}
/** Every string in a value, depth first, until `fn` returns true. */
function someString(v, fn, depth = 5) {
  if (typeof v === "string") return fn(v);
  if (depth < 0 || v == null || typeof v !== "object") return false;
  for (const x of Array.isArray(v) ? v : Object.values(v)) if (someString(x, fn, depth - 1)) return true;
  return false;
}
/** Every object in a value, depth first. */
function eachObject(v, fn, depth = 5) {
  if (depth < 0 || v == null || typeof v !== "object") return;
  if (!Array.isArray(v)) fn(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) eachObject(x, fn, depth - 1);
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const TICKET_KEY_RE = /^[A-Za-z][A-Za-z0-9]{1,9}-\d{1,9}$/;
/** "BITWINEXV2-12" → "BITWINEXV2" */
export const projectOfKey = (key) => (TICKET_KEY_RE.test(String(key ?? "")) ? String(key).replace(/-\d+$/, "").toUpperCase() : null);

/** The ticket key in an answer: a key / ticketKey field first, then any string shaped like PROJECT-12. */
export function findTicketKey(x, projectKey) {
  const re = projectKey ? new RegExp(`^${escapeRe(projectKey)}-\\d{1,9}$`, "i") : TICKET_KEY_RE;
  const v = unwrap(x);
  for (const o of [v, v?.ticket, v?.item]) {
    if (!isObj(o)) continue;
    for (const k of ["key", "ticketKey", "ticket_key", "code"]) if (typeof o[k] === "string" && re.test(o[k].trim())) return o[k].trim().toUpperCase();
  }
  let found = null;
  someString(v, (s) => (re.test(s.trim()) ? ((found = s.trim().toUpperCase()), true) : false));
  return found;
}

/** A link to the ticket in the PMS web app, when the answer carries one. */
function webUrlOf(t) {
  for (const k of ["url", "webUrl", "web_url", "htmlUrl", "link", "permalink"]) {
    const v = str(t?.[k]);
    if (/^https:\/\//.test(v)) return v.slice(0, 500);
  }
  return null;
}
/** What Task Portal keeps of a ticket answer. */
export function ticketOf(x) {
  const v = unwrap(x);
  const t = isObj(v?.ticket) ? v.ticket : isObj(v) ? v : {};
  return {
    key: findTicketKey(t) || null,
    title: str(t.title) || null,
    description: typeof t.description === "string" ? t.description : null,
    status: codeOf(t.status ?? t.state ?? t.stage) || null,
    lang: str(t.lang ?? t.language) || null,
    url: webUrlOf(t),
  };
}
/** Tickets in a list answer: [{ key, title, status }]. */
export function ticketsIn(x) {
  return listIn(x, ["tickets"]).filter(isObj).map((t) => ticketOf(t)).filter((t) => t.key);
}

const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
/** Projects in an answer (the manifest, /projects, /auth/me): [{ key, name, mode, role }]. */
export function projectsIn(x) {
  const out = new Map();
  const add = (o) => {
    if (!isObj(o)) return;
    const p = isObj(o.project) ? { ...o.project, ...o } : o;
    const key = str(p.key ?? p.projectKey ?? p.project_key ?? (isObj(o.project) ? o.project.key : ""));
    if (!PROJECT_KEY_RE.test(key)) return;
    const prev = out.get(key) ?? { key, name: null, mode: null, role: null };
    out.set(key, {
      key,
      name: prev.name || str(isObj(o.project) ? o.project.name : p.name) || str(p.projectName) || null,
      mode: prev.mode || codeOf(p.agentMode ?? p.agent_mode ?? p.autonomy ?? p.tokenAutonomy ?? p.mode) || null,
      role: prev.role || codeOf(p.role ?? p.myRole ?? p.membership?.role) || null,
    });
  };
  const v = unwrap(x);
  const lists = [listIn(v, ["projects"])];
  if (isObj(v)) for (const k of ["projects", "reachableProjects", "projectsReachable", "memberships"]) if (Array.isArray(v[k])) lists.push(v[k]);
  for (const list of lists) list.forEach(add);
  return [...out.values()].slice(0, 100);
}
/** Scopes a token holds, when the answer says: ["tickets:read", …] or null. */
export function scopesIn(x) {
  const v = unwrap(x);
  const SCOPE = /^[a-z]+:[a-z_]+$/;
  for (const k of ["scopes", "scopesHeld", "heldScopes", "held"]) {
    const s = isObj(v) ? v[k] : null;
    if (Array.isArray(s)) {
      const list = s.map((e) => (isObj(e) ? (e.held === false || e.granted === false ? "" : str(e.scope ?? e.name ?? e.key)) : str(e))).filter((e) => SCOPE.test(e));
      if (list.length) return [...new Set(list)].slice(0, 60);
    }
    if (isObj(s)) {
      const list = Object.entries(s).filter(([name, held]) => SCOPE.test(name) && held !== false).map(([name]) => name);
      if (list.length) return list.slice(0, 60);
    }
  }
  return null;
}
/** The person behind a token, from /auth/me or the manifest: { label: "Name (email)", uid } or null. */
export function personOf(x) {
  const v = unwrap(x);
  // the person may be the answer itself (/auth/me) or sit inside it; a bare object only counts when it has an email,
  // so a token's own name is never taken for its owner
  const u = isObj(v?.user) ? v.user : isObj(v?.me) ? v.me : isObj(v?.actingAs) ? v.actingAs : isObj(v?.owner) ? v.owner : isObj(v) && str(v.email) ? v : null;
  if (!isObj(u)) return null;
  const name = str(u.name ?? u.displayName ?? u.fullName ?? u.full_name);
  const email = str(u.email);
  const label = (name && email ? `${name} (${email})` : name || email || "").slice(0, 190) || null;
  const uid = str(u.uid ?? u.userUid ?? u.user_uid ?? u.id).slice(0, 64) || null;
  return label || uid ? { label, uid } : null;
}
export const personIn = (x) => personOf(x)?.label ?? null;
/** externalRef → PMS uid of the worklogs in a batch answer (created ones and the `duplicates`). */
export function worklogUids(x) {
  const map = new Map();
  eachObject(x, (o) => {
    const ref = str(o.externalRef ?? o.external_ref);
    const uid = str(o.uid ?? o.id);
    if (ref && uid) map.set(ref, uid);
  });
  return map;
}
/** The uid of one created record (a worklog, a document). */
export function uidOf(x) {
  const v = unwrap(x);
  for (const o of [v, v?.entry, v?.worklog, v?.item]) if (isObj(o) && str(o.uid ?? o.id)) return str(o.uid ?? o.id);
  return null;
}
/** Upload limits from /attachments/meta: { maxBytes, maxFiles } where PMS says. */
export function uploadLimitsIn(x) {
  let maxBytes = null;
  let maxFiles = null;
  eachObject(unwrap(x), (o) => {
    for (const [k, val] of Object.entries(o)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (maxBytes == null && /max/i.test(k) && /(byte|size)/i.test(k) && n >= 1024) maxBytes = n;
      if (maxFiles == null && /max/i.test(k) && /(files|count)/i.test(k) && n < 1000) maxFiles = n;
    }
  }, 3);
  return { maxBytes, maxFiles };
}

/**
 * What a token can do: who it belongs to, the projects it reaches (with their token autonomy) and its scopes.
 * The manifest is the authority on reachable projects (a token can be limited to one project); /projects is the
 * fallback when the manifest says nothing usable. Throws PmsError when the token is refused.
 */
export async function probeToken(conn) {
  let manifest = null;
  let manifestError = null;
  try {
    manifest = await pmsFetch(conn, "GET", "/agent/manifest");
  } catch (e) {
    if (!(e instanceof PmsError) || e.pmsStatus === 401 || e.info?.network) throw e;
    manifestError = e;
  }
  let projects = manifest ? projectsIn(manifest) : [];
  if (!projects.length) {
    try {
      projects = projectsIn(await pmsFetch(conn, "GET", "/projects"));
    } catch (e) {
      throw manifestError ?? e;
    }
  }
  // who: the manifest usually says; /auth/me fills in what it does not (the uid is what claiming a slot needs)
  let person = manifest ? personOf(manifest) : null;
  if (!person?.label || !person?.uid) {
    const me = personOf(await pmsFetch(conn, "GET", "/auth/me").catch(() => null));
    person = { label: person?.label || me?.label || null, uid: person?.uid || me?.uid || null };
  }
  return { acting_as: person.label, acting_uid: person.uid, projects, scopes: manifest ? scopesIn(manifest) : null };
}
