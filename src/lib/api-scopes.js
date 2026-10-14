/**
 * Fine-grained permissions of API tokens. A token made with "Read" or "Read & write" keeps the plain scope it always
 * had (its `scopes` column is null); a custom token lists what it may do, and every request must map to one of those.
 * Plain module: the server enforces it, the token form (Integrations → Task Portal API) and the API guide list it.
 */
export const API_SCOPES = {
  "tasks:read": { label: "Read tasks", description: "Tasks with their comments, time, files and history." },
  "tasks:write": { label: "Create and change tasks", description: "Create, update and assign tasks; checklists, outputs and dependencies." },
  "tasks:delete": { label: "Delete tasks", description: "Move tasks to the recycle bin." },
  "comments:write": { label: "Write comments", description: "Post, edit and delete comments on tasks." },
  "time:write": { label: "Log time", description: "Log, correct and delete time on tasks." },
  "files:write": { label: "Upload files", description: "Attach files to tasks and remove them." },
  "projects:read": { label: "Read projects", description: "Projects and requirements, to pick where a task goes." },
  "people:read": { label: "Read people", description: "Employees, to pick who a task is assigned to." },
};
export const SCOPE_KEYS = Object.keys(API_SCOPES);
/** What "Read" means when a person picks permissions one by one. */
export const READ_SCOPES = ["tasks:read", "projects:read", "people:read"];

/** Keep only known scopes, unique, in the order above. */
export function normaliseScopes(raw) {
  const set = new Set((Array.isArray(raw) ? raw : []).map(String));
  return SCOPE_KEYS.filter((k) => set.has(k));
}

/**
 * The scope a request needs, or null when the request is outside what custom tokens may do at all (accounts, chat,
 * calendar…). Covers the stable API (/api/v1/…) and the matching routes of the app's own API.
 */
export function scopeFor(method, pathname) {
  const read = method === "GET" || method === "HEAD";
  const p = String(pathname).replace(/\/+$/, "").replace(/^\/api\/v1(?=\/|$)/, "/api");
  if (p === "/api" || p === "/api/me" || p === "/api/openapi.json") return "any";
  let m;
  if ((m = /^\/api\/tasks\/\d+\/comments(\/\d+)?$/.exec(p))) return read ? "tasks:read" : "comments:write";
  if (/^\/api\/tasks\/\d+\/time(\/\d+)?$/.test(p)) return read ? "tasks:read" : "time:write";
  if (/^\/api\/tasks\/\d+\/(attachments|files)(\/\d+)?$/.test(p) || /^\/api\/attachments\/task\/\d+$/.test(p)) return read ? "tasks:read" : "files:write";
  if (/^\/api\/tasks\/\d+$/.test(p)) return read ? "tasks:read" : method === "DELETE" ? "tasks:delete" : "tasks:write";
  if (/^\/api\/tasks(\/\d+\/(status|assignees|checklist(\/\d+)?|outputs|dependencies(\/\d+)?|history))?$/.test(p) || /^\/api\/tasks\/(bulk|tags|mine)$/.test(p) || /^\/api\/outputs\/\d+$/.test(p)) return read ? "tasks:read" : "tasks:write";
  if (/^\/api\/(projects|requirements)(\/\d+)?$/.test(p)) return read ? "projects:read" : null;
  if (/^\/api\/(employees|people)(\/\d+)?$/.test(p)) return read ? "people:read" : null;
  return null;
}

/** May a token with these scopes make this request? Legacy tokens (scopes null) are judged by their plain scope elsewhere. */
export function scopesAllow(scopes, method, pathname) {
  const need = scopeFor(method, pathname);
  if (need === "any") return { ok: true, need };
  return { ok: Boolean(need && scopes.includes(need)), need };
}

/** "203.0.113.4, 10.0.0.0/8, 2001:db8::/32" → normalised list; throws on anything that is not an address or range. */
export function parseIpAllow(raw) {
  const items = String(raw ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (items.length > 20) throw new Error("Up to 20 addresses or ranges.");
  for (const it of items) if (!ipRange(it)) throw new Error(`Not an IP address or range: ${it}`);
  return items;
}

function ipBytes(ip) {
  const s = String(ip).trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const parts = s.split(".").map(Number);
    return parts.every((n) => n <= 255) ? parts : null;
  }
  if (!/^[0-9a-f:]+$/i.test(s) || !s.includes(":")) return null;
  const [head, tail = ""] = s.split("::");
  if (s.split("::").length > 2) return null;
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const groups = [...h, ...Array(Math.max(0, fill)).fill("0"), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255]);
}
function ipRange(item) {
  const [addr, bitsRaw] = item.split("/");
  const bytes = ipBytes(addr);
  if (!bytes) return null;
  const max = bytes.length * 8;
  const bits = bitsRaw == null ? max : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > max) return null;
  return { bytes, bits };
}
/** Is `ip` inside one of the allowed addresses / ranges? */
export function ipAllowed(ip, list) {
  const target = ipBytes(ip);
  if (!target) return false;
  return list.some((item) => {
    const r = ipRange(item);
    if (!r || r.bytes.length !== target.length) return false;
    for (let i = 0; i < r.bits; i++) {
      const byte = i >> 3, bit = 7 - (i & 7);
      if (((r.bytes[byte] >> bit) & 1) !== ((target[byte] >> bit) & 1)) return false;
    }
    return true;
  });
}
