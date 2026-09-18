/**
 * Per-account access: an administrator can turn modules and features off for one person. What is off is hidden
 * in the app and refused by the API. Administrators always have everything. Pure functions, used by the server
 * (handler guard) and the client (menus, pages, buttons).
 *
 * Stored on users.module_access as { modules_off: [...], features_off: [...] } — only what is OFF is kept, so a
 * module added later is on for everybody.
 */
export const ALWAYS_ON = ["dashboard", "profiles", "notifications"];
export const SWITCHABLE_MODULES = ["projects", "requirements", "employees", "tasks", "mytasks", "board", "calendar", "timeline", "time", "info", "drawboards", "chat", "trash"];
/** Pages that are views over another module's data: they go when that module goes. */
export const MODULE_NEEDS = { mytasks: "tasks", board: "tasks", timeline: "tasks", time: "tasks" };
export const FEATURES = {
  import: { label: "Spreadsheet import", description: "Bring tasks, employees, projects and requirements in from a CSV file." },
  export: { label: "Export and reports", description: "CSV export, printable reports and Save as PDF." },
  bulk_edit: { label: "Bulk edit of tasks", description: "Change many tasks at once from the Tasks table.", needs: "tasks" },
  sharing: { label: "Share profiles", description: "Invite people to their profiles, change roles, hand a profile over. Being invited by others still works." },
  calls: { label: "Voice and video calls", description: "Start and receive calls in Chat.", needs: "chat" },
  api_tokens: { label: "API tokens", description: "Create tokens for scripts and other tools. Turning this off also stops their existing tokens." },
  webhooks: { label: "Webhooks", description: "Tell other systems about changes in their profiles." },
};

const parse = (raw) => { try { return (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { return {}; } };
/** Keep only known keys; the shape that is stored. */
export function normaliseAccess(raw) {
  const a = parse(raw);
  const modules_off = [...new Set((Array.isArray(a.modules_off) ? a.modules_off : []).filter((k) => SWITCHABLE_MODULES.includes(k)))];
  const features_off = [...new Set((Array.isArray(a.features_off) ? a.features_off : []).filter((k) => FEATURES[k]))];
  return { modules_off, features_off };
}
/** What is effectively off for this account, dependants included. Administrators: nothing. */
export function offFor(user) {
  if (!user || user.role === "admin") return { modules: new Set(), features: new Set() };
  const a = normaliseAccess(user.module_access);
  const modules = new Set(a.modules_off);
  for (const [view, base] of Object.entries(MODULE_NEEDS)) if (modules.has(base)) modules.add(view);
  const features = new Set(a.features_off);
  for (const [f, def] of Object.entries(FEATURES)) if (def.needs && modules.has(def.needs)) features.add(f);
  return { modules, features };
}
export const moduleAllowed = (user, key) => !offFor(user).modules.has(key);
export const featureAllowed = (user, key) => !offFor(user).features.has(key);
export const isLimited = (user) => { const o = offFor(user); return o.modules.size + o.features.size > 0; };

/** The module a page belongs to: "/tasks/12" → tasks, "/my-tasks" → mytasks, "/report/tasks" → tasks, "/embed/board" → board. */
export function moduleOfPath(pathname = "/") {
  const seg = pathname.split("?")[0].split("/").filter(Boolean);
  if (seg[0] === "embed") seg.shift();
  if (seg[0] === "report") seg.shift();
  const first = seg[0] ?? "";
  if (first === "" || first === "dashboard") return "dashboard";
  if (first === "my-tasks") return "mytasks";
  return first;
}

const ATTACHMENT_MODULE = { task: "tasks", requirement: "requirements", info: "info", drawboard: "drawboards" };
/**
 * What an API request needs: { module?, feature? } or null. The plain lists of projects, employees and
 * requirements stay readable when their module is off, because other pages pick from them (a task's project,
 * its assignees); their detail, everything inside them and every change are refused.
 */
export function apiRule(method, pathname) {
  const p = pathname.replace(/\/+$/, "");
  const read = method === "GET" || method === "HEAD";
  let m;
  if (/^\/api\/import(\/|$)/.test(p)) return { feature: "import" };
  if (/^\/api\/tokens(\/|$)/.test(p)) return { feature: "api_tokens" };
  if (/^\/api\/profiles\/\d+\/webhooks(\/|$)/.test(p)) return { feature: "webhooks" };
  if (/^\/api\/profiles\/\d+\/(members|invites|transfer)(\/|$)/.test(p)) return read ? null : { feature: "sharing" };
  if (/^\/api\/chat\/admin(\/|$)/.test(p)) return null;
  if (/^\/api\/chat\/calls(\/|$)/.test(p)) return { module: "chat", feature: "calls" };
  if (/^\/api\/chat(\/|$)/.test(p)) return { module: "chat" };
  if (/^\/api\/tasks\/bulk$/.test(p)) return { module: "tasks", feature: "bulk_edit" };
  if (/^\/api\/tasks\/mine$/.test(p)) return { module: "mytasks" };
  if (/^\/api\/(tasks|outputs)(\/|$)/.test(p)) return { module: "tasks" };
  if (/^\/api\/time\/report$/.test(p)) return { module: "time" };
  if (/^\/api\/time(\/|$)/.test(p)) return { module: "tasks" };
  if ((m = /^\/api\/(projects|employees|requirements)(\/.*)?$/.exec(p))) return read && !m[2] ? null : { module: m[1] };
  if ((m = /^\/api\/attachments\/([a-z_]+)/.exec(p))) return ATTACHMENT_MODULE[m[1]] ? { module: ATTACHMENT_MODULE[m[1]] } : null;
  if (/^\/api\/(info|info-notes)(\/|$)/.test(p)) return { module: "info" };
  if (/^\/api\/drawboards(\/|$)/.test(p)) return { module: "drawboards" };
  if (/^\/api\/events(\/|$)/.test(p)) return { module: "calendar" };
  if (/^\/api\/trash(\/|$)/.test(p)) return { module: "trash" };
  return null;
}
/** null when the request may go ahead, else { kind: "module" | "feature", key }. */
export function refusalFor(user, method, pathname) {
  const rule = apiRule(method, pathname);
  if (!rule) return null;
  const off = offFor(user);
  if (rule.module && off.modules.has(rule.module)) return { kind: "module", key: rule.module };
  if (rule.feature && off.features.has(rule.feature)) return { kind: "feature", key: rule.feature };
  return null;
}
