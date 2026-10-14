#!/usr/bin/env node
/**
 * Task Portal API v1: a sample client, written the way another system (a CRM, a help desk, a script) would use it.
 * It walks through what an integration usually does and checks every answer:
 *
 *   who am I → projects and people → create a task (assigned by email, with its own id and an Idempotency-Key)
 *   → retry the same request (no second task) → find it by its own id → update it → move its status → comment
 *   → log time → attach, download and remove a file → "what changed since?" page by page → two mistakes the API
 *   refuses → mark it done → delete it (it goes to the recycle bin)
 *
 * Needs Node 18 or newer and nothing else. The token comes from the environment, never from the command line:
 *
 *   read -s TASK_PORTAL_TOKEN && export TASK_PORTAL_TOKEN      # paste the tp_… token (nothing shows), press Enter
 *   TASK_PORTAL_URL=https://task.system-portal.com node examples/api/task-portal-api-demo.mjs
 *
 * Options:
 *   --keep              leave the test task in place to look at it in Task Portal (delete it there afterwards)
 *   --assignee <email>  also put this person on the task for a moment; they are notified like any assignment
 *   --project <code>    create the task in this project
 *   --quiet             leave out the request lines
 *
 * Make the token in Task Portal under Integrations → Task Portal API with "Read & write" (bound to a test profile if
 * you have one). What the script changes is recorded as you "via" the token's name, and every call it makes is
 * listed under the token's Requests. Revoke the token when you are done testing.
 */
import crypto from "node:crypto";

const BASE = (process.env.TASK_PORTAL_URL || "http://localhost:3000").replace(/\/+$/, "");
const TOKEN = (process.env.TASK_PORTAL_TOKEN || "").trim();
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const KEEP = flag("keep");
const QUIET = flag("quiet");
const OTHER = option("assignee")?.toLowerCase();
const PROJECT = option("project");

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32), red = paint(31), dim = paint(2), bold = paint(1), yellow = paint(33);

if (typeof fetch !== "function") {
  console.error("This script needs Node 18 or newer (it uses the built-in fetch).");
  process.exit(2);
}
if (!/^tp_[A-Za-z0-9_-]{20,}$/.test(TOKEN)) {
  console.error(`Set TASK_PORTAL_TOKEN to a Task Portal API token (tp_…) first:\n\n  read -s TASK_PORTAL_TOKEN && export TASK_PORTAL_TOKEN\n\nMake one in Task Portal under Integrations → Task Portal API.`);
  process.exit(2);
}

/* ---------- a small client: every answer is { data } or { error, details } ---------- */

let rateLeft = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, { body, form, headers = {}, attempt = 1 } = {}) {
  const init = { method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", ...headers } };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const started = Date.now();
  const res = await fetch(`${BASE}/api/v1${path}`, init);
  rateLeft = res.headers.get("x-ratelimit-remaining") ?? rateLeft;
  const type = res.headers.get("content-type") ?? "";
  const payload = type.includes("application/json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (!QUIET) console.log(dim(`     ${method} /api/v1${path} → ${res.status}${res.headers.get("idempotent-replayed") ? " (replayed)" : ""} · ${Date.now() - started} ms`));
  // over the rate limit: wait as long as the API asks, then try again (twice at most)
  if (res.status === 429 && attempt <= 2) {
    const wait = Number(res.headers.get("retry-after")) || 5;
    console.log(yellow(`     rate limited: waiting ${wait} s as Retry-After asks`));
    await sleep(wait * 1000);
    return api(method, path, { body, form, headers, attempt: attempt + 1 });
  }
  return { status: res.status, data: payload?.data, next: payload?.next_cursor, error: payload?.error, details: payload?.details, headers: res.headers, raw: payload };
}
/** The answer must have this status, or the step fails with what the API said. */
function expectStatus(res, status) {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}${res.error ? `: ${res.error}` : ""}`);
  return res;
}
function expect(cond, message) {
  if (!cond) throw new Error(message);
}

/* ---------- steps ---------- */

const results = [];
let n = 0;
async function step(title, fn, { fatal = false } = {}) {
  n += 1;
  console.log(`\n${bold(`${String(n).padStart(2)}. ${title}`)}`);
  try {
    const note = await fn();
    results.push(true);
    console.log(`   ${green("✓")} ${note ?? "ok"}`);
    return true;
  } catch (e) {
    results.push(false);
    console.log(`   ${red("✗")} ${e.message}`);
    if (fatal) throw Object.assign(e, { stop: true });
    return false;
  }
}

const startedAt = new Date();
const stamp = startedAt.toLocaleString("sv-SE").slice(0, 16); // local time, as "2026-10-14 14:30"
const externalId = `demo-${Date.now().toString(36)}`;
const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
let me, myself, other, first, project, task;

console.log(`${bold("Task Portal API demo")} → ${BASE}/api/v1   ${dim(`(token ${TOKEN.slice(0, 10)}…)`)}`);

try {
  await step("Reach the API (public, no token)", async () => {
    let res;
    try {
      res = await fetch(`${BASE}/api/v1`);
    } catch (e) {
      throw new Error(`cannot reach ${BASE} (${e.cause?.code || e.message})`);
    }
    const body = await res.json().catch(() => null);
    expect(res.ok && body?.data?.version, `GET /api/v1 answered ${res.status}: is ${BASE} a Task Portal?`);
    return `API v${body.data.version}, ${body.data.endpoints.length} endpoints; it sees you as ${body.data.your_ip}`;
  }, { fatal: true });

  await step("Who am I", async () => {
    const res = await api("GET", "/me");
    if (res.status === 401) throw new Error(`the token was not accepted (${res.error}): it is wrong, revoked or expired`);
    me = expectStatus(res, 200).data;
    const can = me.token.scopes ? me.token.scopes.join(", ") : me.token.scope === "write" ? "read & write" : "read only";
    return `${me.user.name} <${me.user.email}> in “${me.workspace.name}” (${me.workspace.access}); token “${me.token.name}”: ${can}; ${me.token.rate_limit.per_minute} requests a minute`;
  }, { fatal: true });

  await step("Projects and people", async () => {
    const projects = expectStatus(await api("GET", "/projects"), 200).data;
    const people = expectStatus(await api("GET", "/people"), 200).data;
    if (PROJECT) {
      project = projects.find((p) => p.code?.toLowerCase() === PROJECT.toLowerCase() || String(p.id) === PROJECT);
      expect(project, `no project with the code ${PROJECT} here (codes: ${projects.map((p) => p.code).join(", ") || "none"})`);
    }
    // the task goes to you if you have an employee record with your email here: nobody else is notified
    myself = people.find((p) => p.email?.toLowerCase() === me.user.email.toLowerCase());
    if (OTHER) {
      other = people.find((p) => p.email?.toLowerCase() === OTHER);
      expect(other, `nobody here has the email ${OTHER}`);
    }
    first = myself ?? other; // who the task is made for: you, else the --assignee
    const to = myself ? `you (${myself.name})` : other ? `${other.name} (--assignee)` : "nobody (you have no employee record with your email here; --assignee names somebody)";
    return `${projects.length} projects, ${people.length} people; the task goes to ${to}${project ? `, in ${project.name} (${project.code})` : ""}`;
  });

  const idemKey = crypto.randomUUID();
  const draft = {
    title: `[API test] Call back Acme about the renewal · ${stamp}`,
    description: "Made by the Task Portal API demo script. Safe to delete.",
    priority: "high",
    due_date: inAWeek,
    tags: ["api-test"],
    external_id: externalId,
    ...(first ? { assignees: [first.email] } : {}),
    ...(project ? { project: project.code } : {}),
  };
  await step(first ? "Create a task (assigned by email, with our own id and an Idempotency-Key)" : "Create a task (with our own id and an Idempotency-Key)", async () => {
    const res = await api("POST", "/tasks", { body: draft, headers: { "Idempotency-Key": idemKey } });
    if (res.status === 403) throw new Error(`${res.error} Give the token “Read & write” (or the tasks:write permission) to test writing.`);
    task = expectStatus(res, 201).data;
    expect(task.external_id === externalId && task.status === "todo", "the task came back different from what was sent");
    return `#${task.id} “${task.title}”, ${task.status}, due ${task.due_date}${task.assignees.length ? `, on it: ${task.assignees.map((p) => p.name).join(", ")}${first !== myself && first.has_account ? " (notified)" : ""}` : ""}\n     ${task.url}`;
  }, { fatal: true });

  await step("Send the same request again (a retry after a timeout must not make a second task)", async () => {
    const res = expectStatus(await api("POST", "/tasks", { body: draft, headers: { "Idempotency-Key": idemKey } }), 201);
    expect(res.data.id === task.id, `a second task was made (#${res.data.id})`);
    expect(res.headers.get("idempotent-replayed") === "true", "the answer was not marked Idempotent-Replayed");
    return `same task #${res.data.id}, answered from the first time (Idempotent-Replayed: true)`;
  });

  await step("Find it again by our own id", async () => {
    const res = expectStatus(await api("GET", `/tasks?external_id=${encodeURIComponent(externalId)}`), 200);
    expect(res.data.length === 1 && res.data[0].id === task.id, `found ${res.data.length} tasks`);
    return `external_id ${externalId} → #${res.data[0].id}`;
  });

  await step("Update it", async () => {
    const adding = other && other !== first; // the --assignee joins now unless the task was made for them
    const res = expectStatus(await api("PATCH", `/tasks/${task.id}`, { body: { priority: "urgent", description: `${draft.description}\n\nUpdated by the demo at ${new Date().toISOString()}.`, ...(adding ? { add_assignees: [other.email] } : {}) } }), 200);
    expect(res.data.priority === "urgent", "the priority did not change");
    if (other) expect(res.data.assignees.some((p) => p.id === other.id), `${other.email} is not on the task`);
    task = res.data;
    return `priority urgent${adding ? `; ${other.name} added${other.has_account ? " (their Task Portal account is notified)" : ""}` : ""}`;
  });

  await step("Move its status and check it", async () => {
    expectStatus(await api("PUT", `/tasks/${task.id}/status`, { body: { status: "in_progress" } }), 200);
    const res = expectStatus(await api("GET", `/tasks/${task.id}/status`), 200);
    expect(res.data.status === "in_progress", `status is ${res.data.status}`);
    return `${res.data.status} (“${res.data.label}”)`;
  });

  await step("Comment on it", async () => {
    const res = expectStatus(await api("POST", `/tasks/${task.id}/comments`, { body: { body: "Quote sent, waiting for their answer. (API demo)" }, headers: { "Idempotency-Key": crypto.randomUUID() } }), 201);
    return `comment #${res.data.id} by ${res.data.author}${res.data.via ? `, via “${res.data.via}”` : ""}`;
  });

  await step("Log time", async () => {
    const res = expectStatus(await api("POST", `/tasks/${task.id}/time`, { body: { duration: "25m", note: "Prepared the quote (API demo)" } }), 201);
    expect(res.data.entry.minutes === 25, `logged ${res.data.entry.minutes} minutes`);
    return `${res.data.entry.minutes} min on ${res.data.entry.spent_on}; ${res.data.total_minutes} min on the task in all`;
  });

  await step("Attach a file, download it, remove it", async () => {
    const text = `Quote for Acme, made by the API demo at ${new Date().toISOString()}\n`;
    const form = new FormData();
    form.append("files", new Blob([text], { type: "text/plain" }), "acme-quote.txt");
    const up = expectStatus(await api("POST", `/tasks/${task.id}/files`, { form }), 201);
    const file = up.data.find((f) => f.name === "acme-quote.txt");
    expect(file, "the uploaded file is not listed");
    const down = expectStatus(await api("GET", `/tasks/${task.id}/files/${file.id}`), 200);
    expect(Buffer.isBuffer(down.raw) && down.raw.toString() === text, "the downloaded file differs from the uploaded one");
    const left = expectStatus(await api("DELETE", `/tasks/${task.id}/files/${file.id}`), 200);
    expect(!left.data.some((f) => f.id === file.id), "the file is still listed");
    return `${file.name} (${file.size} bytes) up, down byte for byte, and removed`;
  });

  await step("What changed since we started? (a sync, one task per page)", async () => {
    const since = new Date(startedAt.getTime() - 5000).toISOString();
    let cursor = null, pages = 0, seen = 0, found = false;
    do {
      const res = expectStatus(await api("GET", `/tasks?updated_since=${encodeURIComponent(since)}&limit=1${cursor ? `&cursor=${cursor}` : ""}`), 200);
      pages += 1;
      seen += res.data.length;
      found ||= res.data.some((t) => t.id === task.id);
      cursor = res.next;
    } while (cursor && pages < 10);
    expect(found, "our task is not among the changes");
    return `${seen} changed task${seen === 1 ? "" : "s"} over ${pages} page${pages === 1 ? "" : "s"}, ours among them${cursor ? " (stopped after 10 pages)" : ""}`;
  });

  await step("Mistakes are refused, with the reason", async () => {
    const typo = await api("POST", "/tasks", { body: { title: "never made", asignees: ["someone@example.com"] } });
    expect(typo.status === 400 && typo.details?.unknown?.includes("asignees"), `a misspelt field answered ${typo.status}`);
    const status = await api("PUT", `/tasks/${task.id}/status`, { body: { status: "finished" } });
    expect(status.status === 400, `an unknown status answered ${status.status}`);
    return `400 “${typo.error}”\n     400 “${status.error}”`;
  });

  if (other) {
    await step(`Take ${other.name} off the task again`, async () => {
      const res = expectStatus(await api("PATCH", `/tasks/${task.id}`, { body: { remove_assignees: [other.email] } }), 200);
      expect(!res.data.assignees.some((p) => p.id === other.id), `${other.email} is still on the task`);
      return "done";
    });
  }

  await step("Mark it done", async () => {
    const res = expectStatus(await api("PUT", `/tasks/${task.id}/status`, { body: { status: "done" } }), 200);
    expect(res.data.done === true, `status is ${res.data.status}`);
    return "done";
  });

  if (KEEP) {
    console.log(`\n   ${yellow("Kept")} #${task.id}: ${task.url}\n   Its activity shows every change “via ${me.token.name}”. Delete it there when you have seen it.`);
  } else {
    await step("Delete it (it goes to the recycle bin)", async () => {
      const res = expectStatus(await api("DELETE", `/tasks/${task.id}`), 200);
      expectStatus(await api("GET", `/tasks/${task.id}`), 404);
      return `#${res.data.id} is in the recycle bin (restorable for 30 days); run with --keep to look at it in Task Portal instead`;
    });
  }
} catch (e) {
  if (!e.stop) throw e;
  // a step the rest depends on failed: what ran is summed up below
  if (task && !KEEP) {
    console.log(dim(`\n   cleaning up #${task.id}`));
    await api("DELETE", `/tasks/${task.id}`).catch(() => {});
  }
}

const passed = results.filter(Boolean).length;
const failed = results.length - passed;
const steps = `${results.length} step${results.length === 1 ? "" : "s"}`;
console.log(`\n${failed ? red(bold(`${failed} of ${steps} failed`)) : green(bold(`All ${steps} passed`))}${rateLeft != null ? dim(` · ${rateLeft} requests left this minute`) : ""}`);
if (me) console.log(dim("Every call above is listed in Task Portal under Integrations → Task Portal API → this token → Requests."));
process.exit(failed ? 1 : 0);
