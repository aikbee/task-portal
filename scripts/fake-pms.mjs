/**
 * A stand-in for Bitara PMS (pms.bitara.co/api/v1) for the smoke test and local checks: real PMS tickets cannot be
 * deleted with a token, so tests never talk to the real one. It follows the request bodies of PMS's OpenAPI file and
 * answers in plausible, deliberately mixed shapes (bare, { data }, { items }), because PMS does not document its
 * answers and Task Portal must read them tolerantly. Errors are problem+json like PMS's.
 *
 *   import { startFakePms } from "./fake-pms.mjs";  const pms = await startFakePms();  … pms.close()
 *   node scripts/fake-pms.mjs [port]                 (prints its address and test token)
 */
import http from "node:http";
import crypto from "node:crypto";

export const FAKE_TOKEN = "pms_pat_fakeTEST_0123456789abcdef";
const CATEGORIES = ["BUG", "FEATURE", "DESIGN", "CHANGE_REQUEST", "SUPPORT", "DATA_FIX", "INFRA", "SECURITY", "QUESTION"];
const KINDS = ["DEV", "TEST", "REVIEW", "DESIGN", "DOCS", "SUPPORT", "MEETING", "ADMIN", "AGENT", "OTHER"];
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export async function startFakePms({ port = 0, tokens, projects, maxFileBytes = 5 * 1024 * 1024 } = {}) {
  const state = {
    projects: projects ?? [
      { key: "DEMOV2", name: "Demo v2", agentMode: "SUGGEST_ONLY", role: "DEVELOPER" },
      { key: "DEMOV1", name: "Demo v1", agentMode: "SUGGEST_ONLY", role: "DEVELOPER" },
    ],
    // token → the person and the projects it may reach (a token can be limited to one project)
    tokens: tokens ?? { [FAKE_TOKEN]: { uid: "u_1", name: "Test Person", email: "test.person@example.com", projects: null } },
    tickets: new Map(), // key → ticket
    counters: {},
    worklogs: [], // { uid, projectKey, ownerUid, externalRef, … }
    requests: [], // { method, path, client, body }
    options: { refuseDueAt: false, omitKey: false, refuseClaim: false },
  };
  const uid = (p) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
  const problem = (res, status, title, extra = {}) => send(res, status, { type: `https://pms.example/errors/${title.toLowerCase().replace(/\W+/g, "-")}`, title, status, ...extra }, "application/problem+json");
  function send(res, status, body, type = "application/json") {
    res.writeHead(status, { "content-type": `${type}; charset=utf-8` });
    res.end(body == null ? "" : JSON.stringify(body));
  }
  const reachable = (who) => state.projects.filter((p) => !who.projects || who.projects.includes(p.key));

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, "http://fake");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const ctype = req.headers["content-type"] || "";
    let body = null;
    if (ctype.includes("application/json") && raw.length) {
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        return problem(res, 400, "Bad JSON");
      }
    }
    let files = null;
    if (ctype.includes("multipart/form-data")) {
      const form = await new Response(raw, { headers: { "content-type": ctype } }).formData();
      files = await Promise.all(form.getAll("files").map(async (f) => ({ name: f.name, size: f.size, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) })));
    }
    state.requests.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), client: req.headers["x-pms-client"] ?? null, body, files: files?.map(({ bytes, ...f }) => f) ?? null });

    const auth = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
    const who = auth ? state.tokens[auth] : null;
    if (!who) return problem(res, 401, "Unauthorized", { detail: "Token missing, expired or revoked" });
    const mayProject = (key) => reachable(who).some((p) => p.key === key);
    const ticketFor = (key) => {
      const t = state.tickets.get(String(key).toUpperCase());
      return t && mayProject(t.projectKey) ? t : null;
    };
    let m;

    // who am I, what may I do
    if (req.method === "GET" && path === "/agent/manifest") {
      return send(res, 200, { token: { name: "Task Portal test", kind: "PAT" }, actingAs: { uid: who.uid, name: who.name, email: who.email }, scopes: ["tickets:read", "tickets:write", "comments:write", "worklogs:write", "projects:read"], projects: reachable(who).map((p) => ({ key: p.key, name: p.name, role: p.role, agentMode: p.agentMode })), refusedForTokens: ["ticket.delete"] });
    }
    if (req.method === "GET" && path === "/auth/me") return send(res, 200, { data: { uid: who.uid, name: who.name, email: who.email } });
    if (req.method === "GET" && path === "/projects") return send(res, 200, { items: reachable(who).map((p) => ({ key: p.key, name: p.name })) });
    if (req.method === "GET" && path === "/attachments/meta") return send(res, 200, { maxFileBytes, maxFiles: 10, types: ["image/*", "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/zip", "video/*"] });

    // tickets
    if ((m = /^\/projects\/([A-Z0-9]+)\/tickets$/.exec(path))) {
      const key = m[1];
      if (!mayProject(key)) return problem(res, 404, "Not Found");
      if (req.method === "GET") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const items = [...state.tickets.values()].filter((t) => t.projectKey === key && (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)));
        return send(res, 200, { items: items.map(({ comments, attachments, ...t }) => t), nextCursor: null });
      }
      if (req.method === "POST") {
        const errors = [];
        if (!body || typeof body.title !== "string" || !body.title.trim()) errors.push("title should not be empty");
        if (body?.category != null && !CATEGORIES.includes(body.category)) errors.push("category must be one of the following values");
        if (body?.priority != null && !/^P[1-4]$/.test(body.priority)) errors.push("priority must be one of P1, P2, P3, P4");
        if (body?.lang != null && !["en", "zh-CN"].includes(body.lang)) errors.push("lang must be en or zh-CN");
        if (body?.dueAt != null && (state.options.refuseDueAt || Number.isNaN(Date.parse(body.dueAt)))) errors.push("dueAt must be a valid ISO 8601 date string");
        if (errors.length) return problem(res, 422, "Validation failed", { message: errors });
        state.counters[key] = (state.counters[key] ?? 0) + 1;
        const t = { uid: uid("tk"), key: `${key}-${state.counters[key]}`, projectKey: key, title: body.title, description: body.description ?? "", category: body.category ?? "FEATURE", priority: body.priority ?? "P3", lang: body.lang ?? "en", dueAt: body.dueAt ?? null, estimateMinutes: body.estimateMinutes ?? null, status: "OPEN", reporterUid: who.uid, claims: { owner: body.assigneeUid ?? null, dev: null, test: null }, comments: [], attachments: [] };
        state.tickets.set(t.key, t);
        const { comments, attachments, ...shown } = t;
        return send(res, 201, state.options.omitKey ? { data: { uid: t.uid } } : { data: shown });
      }
    }
    if ((m = /^\/tickets\/([A-Za-z0-9]+-\d+)(\/[a-z-]+)?$/.exec(path))) {
      const t = ticketFor(m[1]);
      if (!t) return problem(res, 404, "Not Found", { detail: `Ticket ${m[1]} does not exist or you cannot see it` });
      const sub = m[2] ?? "";
      if (req.method === "GET" && !sub) {
        const { comments, attachments, ...ticket } = t;
        return send(res, 200, { ticket: { ...ticket, status: { code: t.status, label: t.status } }, comments, worklogs: state.worklogs.filter((w) => w.ticketKey === t.key), transitions: [{ from: "OPEN", action: "close", to: "CLOSED" }] });
      }
      if (req.method === "PATCH" && !sub) {
        for (const k of ["title", "description", "priority", "dueAt", "category"]) if (body?.[k] !== undefined) t[k] = body[k];
        for (const [k, slot] of [["assigneeUid", "owner"], ["devAssigneeUid", "dev"], ["testAssigneeUid", "test"]]) if (body?.[k] !== undefined) t.claims[slot] = body[k] || null;
        const { comments, attachments, ...shown } = t;
        return send(res, 200, shown);
      }
      if (req.method === "POST" && sub === "/claim") {
        if (state.options.refuseClaim) return problem(res, 403, "Forbidden", { detail: "Scope missing: tickets:claim" });
        if (!["owner", "dev", "test"].includes(body?.role)) return problem(res, 422, "Validation failed", { message: ["role must be one of owner, dev, test"] });
        if (t.claims[body.role] && t.claims[body.role] !== who.uid) return problem(res, 409, "Already claimed", { detail: `The ${body.role} slot is taken` });
        t.claims[body.role] = who.uid;
        const { comments, attachments, ...shown } = t;
        return send(res, 201, { data: shown });
      }
      if (req.method === "POST" && sub === "/comments") {
        if (!body || typeof body.body !== "string" || !body.body.trim()) return problem(res, 422, "Validation failed", { message: ["body should not be empty"] });
        const c = { uid: uid("cm"), body: body.body, isInternal: Boolean(body.isInternal), authorUid: who.uid };
        t.comments.push(c);
        return send(res, 201, c);
      }
      if (req.method === "POST" && sub === "/attachments") {
        if (!files?.length) return problem(res, 422, "Validation failed", { message: ["files should not be empty"] });
        if (files.length > 10) return problem(res, 422, "Too many files");
        const big = files.find((f) => f.size > maxFileBytes);
        if (big) return problem(res, 413, "Payload Too Large", { detail: `${big.name} is too large` });
        const saved = files.map((f) => ({ uid: uid("at"), filename: f.name, size: f.size, mimeType: f.type }));
        t.attachments.push(...saved);
        return send(res, 201, { items: saved });
      }
    }

    // worklogs
    if ((m = /^\/projects\/([A-Z0-9]+)\/worklogs(\/batch|\/[a-z]+_[0-9a-f]+)?$/.exec(path))) {
      const key = m[1];
      if (!mayProject(key)) return problem(res, 404, "Not Found");
      const check = (e) => {
        const errs = [];
        if (!e.startedAt || !ISO_OFFSET.test(e.startedAt)) errs.push("startedAt must be ISO 8601 with an offset");
        if (!Number.isInteger(e.minutes) || e.minutes < 1 || e.minutes > 1440) errs.push("minutes must be 1–1440");
        if (e.kind != null && !KINDS.includes(e.kind)) errs.push("kind is not valid");
        if (e.startedAt && Date.parse(e.startedAt) + (e.minutes ?? 0) * 60000 > Date.now() + 60000) errs.push("Times in the future are refused");
        if (e.ticketKey && !(state.tickets.get(e.ticketKey)?.projectKey === key)) errs.push(`ticketKey ${e.ticketKey} is not a ticket in ${key}`);
        return errs;
      };
      if (req.method === "POST" && m[2] === "/batch") {
        const entries = Array.isArray(body?.entries) ? body.entries : [];
        if (!entries.length || entries.length > 50) return problem(res, 422, "Validation failed", { message: ["entries must hold 1–50 entries"] });
        const errs = entries.flatMap((e, i) => check(e).map((x) => `entries.${i}: ${x}`));
        if (errs.length) return problem(res, 422, "Validation failed", { message: errs });
        const created = [];
        const duplicates = [];
        for (const e of entries) {
          const dup = e.externalRef && state.worklogs.find((w) => w.ownerUid === who.uid && w.externalRef === e.externalRef);
          if (dup) {
            duplicates.push(dup);
            continue;
          }
          const w = { uid: uid("wl"), projectKey: key, ownerUid: who.uid, startedAt: e.startedAt, minutes: e.minutes, kind: e.kind ?? "DEV", ticketKey: e.ticketKey ?? null, note: e.note ?? null, externalRef: e.externalRef ?? null };
          state.worklogs.push(w);
          created.push(w);
        }
        return send(res, 201, { data: { entries: created, duplicates } });
      }
      if (req.method === "PATCH" && m[2]) {
        const w = state.worklogs.find((x) => x.uid === m[2].slice(1) && x.projectKey === key && x.ownerUid === who.uid);
        if (!w) return problem(res, 404, "Not Found");
        const next = { ...w, ...Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => ["startedAt", "minutes", "kind", "ticketKey", "note"].includes(k))) };
        const errs = check(next);
        if (errs.length) return problem(res, 422, "Validation failed", { message: errs });
        Object.assign(w, next);
        return send(res, 200, w);
      }
      if (req.method === "GET" && !m[2]) return send(res, 200, { items: state.worklogs.filter((w) => w.projectKey === key && w.ownerUid === who.uid), total: null });
    }
    return problem(res, 404, "Not Found", { detail: `${req.method} ${path}` });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}/api/v1`;
  return {
    url: address,
    token: FAKE_TOKEN,
    state,
    requests: state.requests,
    tickets: state.tickets,
    worklogs: state.worklogs,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// node scripts/fake-pms.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const pms = await startFakePms({ port: Number(process.argv[2]) || 4599 });
  console.log(`Fake Bitara PMS at ${pms.url}\nToken: ${pms.token}\nProjects: ${pms.state.projects.map((p) => p.key).join(", ")}`);
}
