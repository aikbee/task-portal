/**
 * End-to-end API smoke test against a running dev server.
 *   npm run dev            (in another terminal)
 *   node scripts/smoke-test.mjs [http://localhost:3000]
 */
const BASE = process.argv[2] || "http://localhost:3000";
let failures = 0;
let jar = {}; // current cookie jar { name: value }
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function call(method, path, { body, form, noAuth } = {}) {
  const init = { method, headers: {} };
  if (Object.keys(jar).length && !noAuth) init.headers.Cookie = cookieHeader();
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = sc.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=.*1970/i.test(a));
    if (!value || expired) delete jar[name];
    else jar[name] = value;
  }
  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data: payload?.data, error: payload?.error, raw: payload, headers: res.headers };
}
function check(label, cond, extra = "") {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label} ${extra}`);
  }
}

console.log("health");
{
  const r = await call("GET", "/api/health");
  check("GET /api/health 200 (public)", r.status === 200 && r.data.status === "ok", JSON.stringify(r.raw));
}

console.log("sign-in methods");
{
  const m = await call("GET", "/api/auth/methods", { noAuth: true });
  check("GET /api/auth/methods (public)", m.status === 200 && m.data?.passkeys === true && typeof m.data?.google === "boolean");
  const opts = await call("POST", "/api/auth/passkeys/login/options", { body: {}, noAuth: true });
  check("passkey login options (discoverable)", opts.status === 200 && typeof opts.data?.challenge === "string" && typeof opts.data?.rpId === "string" && Boolean(jar.ap_passkey), JSON.stringify(opts.raw).slice(0, 200));
  const byMail = await call("POST", "/api/auth/passkeys/login/options", { body: { email: "admin@example.com" }, noAuth: true });
  check("passkey login options with email", byMail.status === 200 && typeof byMail.data?.challenge === "string" && (byMail.data.allowCredentials === undefined || Array.isArray(byMail.data.allowCredentials)));
  const junk = await call("POST", "/api/auth/passkeys/login/verify", { body: { response: { id: "not-a-real-credential-id", rawId: "x", response: {}, type: "public-key" } }, noAuth: true });
  check("passkey login verify rejects an unknown credential", junk.status === 400 && !jar.ap_session, JSON.stringify(junk.raw));
  const expired = await call("POST", "/api/auth/passkeys/login/verify", { body: { response: { id: "not-a-real-credential-id" } }, noAuth: true });
  check("passkey login verify without a challenge -> 400", expired.status === 400);
  const g = await fetch(BASE + "/api/auth/google", { redirect: "manual" });
  const googleOn = m.data?.google;
  const isRedirect = (res) => [302, 307, 308].includes(res.status);
  check(googleOn ? "GET /api/auth/google redirects to Google" : "GET /api/auth/google -> 404 when not configured", googleOn ? isRedirect(g) && /accounts\.google\.com/.test(g.headers.get("location") || "") : g.status === 404);
  const cb = await fetch(BASE + "/api/auth/google/callback?code=x&state=y", { redirect: "manual" });
  check("google callback without state cookie -> back to /login with an error", isRedirect(cb) && /\/login\?error=/.test(cb.headers.get("location") || ""), `${cb.status} ${cb.headers.get("location")}`);
  jar = {};
}

console.log("table detection (lib)");
{
  const lib = await import(new URL("../src/lib/text-tables.js", import.meta.url));
  const sample = "Check\tExpected\nRequest URL\n/v2/farm/enter_v2 (proxied to bitwinex.cloud in dev)\nRequest body\n{ \"client\": \"h5\" } only — no uid, no API key\nResponse\ncode: 0 + data.redirectUrl\nRedirect\nNew tab opens RichFarm";
  const d = lib.detectTable(sample);
  check("stacked header + one cell per line -> 2 columns × 4 rows", d?.kind === "stacked" && d.table.columns.join("|") === "Check|Expected" && d.table.rows.length === 4 && d.table.rows[3][1] === "New tab opens RichFarm" && d.table.rows[1][1].startsWith("{ \"client\""));
  const tsv = lib.detectTable("a\tb\tc\n1\t2\t3\n4\t5");
  check("tsv paste (ragged rows padded)", tsv?.kind === "tsv" && tsv.table.rows.length === 2 && tsv.table.rows[1].length === 3);
  const csv = lib.detectTable('name,qty\n"Apple, red",3\nPear,10');
  check("csv paste with quotes", csv?.kind === "csv" && csv.table.rows[0][0] === "Apple, red" && csv.table.rows.length === 2);
  check("markdown paste", lib.detectTable("| a | b |\n| --- | --- |\n| 1 | 2 |")?.kind === "markdown");
  check("pipe lines without separator", lib.detectTable("a | b\n1 | 2")?.kind === "pipes");
  check("prose is not a table", lib.detectTable("Hello there.\nThis is a note, with commas, and more.\nBye, now") === null);
  check("two comma lines are not a table", lib.detectTable("Hi, there\nThanks, bye") === null);
  check("single line is not a table", lib.detectTable("just one line") === null);
  const doc = "intro line\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\noutro";
  const blocks = lib.parseDoc(doc);
  check("parseDoc: text, table, text", blocks.map((b) => b.type).join(",") === "text,table,text" && blocks[0].text === "intro line\n" && blocks[2].text === "outro");
  check("serializeDoc round-trips", lib.parseDoc(lib.serializeDoc(blocks)).length === 3 && lib.serializeDoc(lib.parseDoc(lib.serializeDoc(blocks))) === lib.serializeDoc(blocks));
  const onlyTable = lib.parseDoc("| a |\n| --- |\n| 1 |");
  check("parseDoc pads a lone table with empty text", onlyTable.length === 3 && onlyTable[0].text === "" && lib.serializeDoc(onlyTable) === lib.serializeDoc([onlyTable[1]]));
  const two = lib.serializeDoc([{ type: "table", table: { columns: ["a"], rows: [["1"]] } }, { type: "text", text: "" }, { type: "table", table: { columns: ["b"], rows: [["2"]] } }]);
  check("two adjacent tables stay separate", lib.countTables(two) === 2);
}

console.log("mentions (lib)");
{
  const m = await import(new URL("../src/lib/mentions.js", import.meta.url));
  const tok = m.mentionToken("employee", 2, "Marcus [Okafor]");
  check("mentionToken strips brackets", tok === "@[Marcus Okafor](employee:2)");
  const found = m.parseMentions(`see ${tok} and @[Login Access](info:14) again ${tok}`);
  check("parseMentions: unique, ordered, with hrefs", found.length === 2 && found[0].href === "/employees/2" && found[1].type === "info" && found[1].id === 14);
  check("mentionQueryAt: @ at start / after space", m.mentionQueryAt("hello @Mar", 10)?.query === "Mar" && m.mentionQueryAt("@", 1)?.query === "" && m.mentionQueryAt("mail@x", 6) === null);
  check("mentionQueryAt: closed token is not a query", m.mentionQueryAt(`${tok} `, tok.length + 1) === null);
}

console.log("auth");
{
  const anon = await call("GET", "/api/projects", { noAuth: true });
  check("GET /api/projects without session -> 401", anon.status === 401);
  const bad = await call("POST", "/api/auth/login", { body: { email: "admin@example.com", password: "nope" }, noAuth: true });
  check("wrong password -> 401", bad.status === 401);
  const r = await call("POST", "/api/auth/login", { body: { email: "admin@example.com", password: "admin123" }, noAuth: true });
  check("admin login 200 + cookie", r.status === 200 && r.data?.role === "admin" && Boolean(jar.ap_session), JSON.stringify(r.raw));
  const me = await call("GET", "/api/auth/me");
  check("GET /api/auth/me", me.data?.email === "admin@example.com" && !("password_hash" in (me.data || {})) && me.data?.has_google === false);
  const sess = await call("GET", "/api/auth/sessions");
  check("GET /api/auth/sessions lists the current session with device info", sess.status === 200 && sess.data?.some((s) => s.current) && sess.data.every((s) => typeof s.browser === "string" && typeof s.device === "string"), JSON.stringify(sess.raw).slice(0, 200));
  const hist = await call("GET", "/api/auth/login-history");
  check("login history has this sign-in and the failed attempt", hist.status === 200 && hist.data?.some((e) => e.success && e.method === "password" && e.current) && hist.data.some((e) => !e.success && e.reason === "wrong_password"), JSON.stringify(hist.data?.slice(0, 2)));
  const mainJar = { ...jar };
  jar = {};
  const second = await call("POST", "/api/auth/login", { body: { email: "admin@example.com", password: "admin123" }, noAuth: true });
  const secondId = second.data?.session_id;
  jar = mainJar;
  const list2 = await call("GET", "/api/auth/sessions");
  check("a second sign-in shows up as another session", Boolean(secondId) && list2.data?.some((s) => s.id === secondId && !s.current));
  const selfKill = await call("DELETE", `/api/auth/sessions/${list2.data.find((s) => s.current).id}`);
  check("the current session cannot be terminated from the list", selfKill.status === 400);
  const kill = await call("DELETE", `/api/auth/sessions/${secondId}`);
  check("terminate another session", kill.status === 200 && !kill.data.some((s) => s.id === secondId));
  const gone = await call("DELETE", `/api/auth/sessions/${secondId}`);
  check("terminated session -> 404", gone.status === 404);
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: "admin@example.com", password: "admin123" }, noAuth: true });
  jar = mainJar;
  const others = await call("DELETE", "/api/auth/sessions");
  check("sign out other sessions leaves only this one", others.status === 200 && others.data.length === 1 && others.data[0].current);
}

console.log("passkeys (signed in)");
{
  const list = await call("GET", "/api/auth/passkeys");
  check("GET /api/auth/passkeys -> array", list.status === 200 && Array.isArray(list.data));
  const opts = await call("POST", "/api/auth/passkeys/register/options");
  check("register options carry the account", opts.status === 200 && typeof opts.data?.challenge === "string" && opts.data?.user?.name === "admin@example.com" && opts.data?.rp?.name === "Task Portal");
  const bad = await call("POST", "/api/auth/passkeys/register/verify", { body: { response: { id: "nope", rawId: "nope", type: "public-key", response: { clientDataJSON: "e30", attestationObject: "e30" } } } });
  check("register verify rejects a bogus attestation", bad.status === 400, JSON.stringify(bad.raw));
  const missing = await call("DELETE", "/api/auth/passkeys/AAAAAAAAAAAAAAAAAAAAAAAA");
  check("DELETE unknown passkey -> 404", missing.status === 404);
  const badId = await call("DELETE", "/api/auth/passkeys/x");
  check("DELETE malformed passkey id -> 400", badId.status === 400);
  const unlink = await call("DELETE", "/api/auth/google");
  check("DELETE /api/auth/google (no-op when not linked)", unlink.status === 200);
}

console.log("projects");
const suffix = Date.now().toString(36).toUpperCase();
let projectId;
{
  const r = await call("POST", "/api/projects", { body: { name: "Smoke Project", code: `SMK-${suffix}`, status: "active", budget: 1234, employee_ids: [1, 2] } });
  check("POST /api/projects 201", r.status === 201, JSON.stringify(r.raw));
  projectId = r.data?.id;
  check("members assigned on create", r.data?.member_count === 2);
  const bad = await call("POST", "/api/projects", { body: { name: "No code" } });
  check("POST missing code -> 400", bad.status === 400);
  const dup = await call("POST", "/api/projects", { body: { name: "Dup", code: `SMK-${suffix}` } });
  check("POST duplicate code -> 409", dup.status === 409);
  const upd = await call("PUT", `/api/projects/${projectId}`, { body: { status: "on_hold", employee_ids: [3] } });
  check("PUT status + replace members", upd.data?.status === "on_hold" && upd.data?.employees?.length === 1 && upd.data.employees[0].id === 3);
  const add = await call("POST", `/api/projects/${projectId}/employees`, { body: { employees: [{ employee_id: 4, role: "QA" }, { employee_id: 5, role: "Data" }] } });
  check("POST members (bulk)", add.data?.employees?.length === 3);
  const rm = await call("DELETE", `/api/projects/${projectId}/employees`, { body: { employee_id: 4 } });
  check("DELETE member", rm.data?.employees?.length === 2);
  const filtered = await call("GET", `/api/projects?employee_id=5`);
  check("GET ?employee_id filter", filtered.data?.some((p) => p.id === projectId));
}

console.log("employees");
let employeeId;
{
  const r = await call("POST", "/api/employees", { body: { first_name: "Smoke", last_name: "Tester", email: `smoke.${suffix.toLowerCase()}@example.com`, project_ids: [projectId] } });
  check("POST /api/employees 201", r.status === 201, JSON.stringify(r.raw));
  employeeId = r.data?.id;
  check("project linked on create", r.data?.projects?.some((p) => p.id === projectId));
  const det = await call("GET", `/api/employees/${employeeId}`);
  check("GET detail has projects + tasks arrays", Array.isArray(det.data?.projects) && Array.isArray(det.data?.tasks));
  const upd = await call("PUT", `/api/employees/${employeeId}`, { body: { job_title: "QA Bot", status: "on_leave" } });
  check("PUT employee", upd.data?.job_title === "QA Bot" && upd.data?.status === "on_leave");
}

console.log("tasks");
let taskId;
{
  const r = await call("POST", "/api/tasks", { body: { title: "Smoke task", project_id: projectId, employee_id: employeeId, priority: "urgent", due_date: "2026-12-31" } });
  check("POST /api/tasks 201", r.status === 201, JSON.stringify(r.raw));
  taskId = r.data?.id;
  check("joined fields present", r.data?.project_name === "Smoke Project" && r.data?.assignee_name === "Smoke Tester");
  const badStatus = await call("POST", "/api/tasks", { body: { title: "x", status: "nope" } });
  check("invalid status -> 400", badStatus.status === 400);
  const reorder = await call("PUT", "/api/tasks/reorder", { body: { order: [taskId, 999999] } });
  check("PUT /api/tasks/reorder ignores foreign ids and orders own tasks", reorder.status === 200 && reorder.data.order.length === 1 && reorder.data.order[0] === taskId, JSON.stringify(reorder.raw));
  const byRange = await call("GET", `/api/tasks?due_from=2026-12-01&due_to=2026-12-31&has_due=1`);
  check("GET ?due_from/due_to range includes the task", byRange.data.some((t) => t.id === taskId) && byRange.data.every((t) => t.due_date >= "2026-12-01" && t.due_date <= "2026-12-31"));
  const byEmp = await call("GET", `/api/tasks?employee_id=${employeeId}`);
  check("GET ?employee_id", byEmp.data?.length === 1 && byEmp.data[0].id === taskId);
}

console.log("requirements");
let reqIds;
{
  const a = await call("POST", "/api/requirements", { body: { project_id: projectId, title: "Login with SSO", type: "functional", priority: "must", acceptance_criteria: "- works" } });
  check("POST /api/requirements 201 with REQ-001", a.status === 201 && a.data?.code === "REQ-001", JSON.stringify(a.raw));
  const b = await call("POST", "/api/requirements", { body: { project_id: projectId, title: "Fast page loads", type: "non_functional", priority: "should" } });
  check("second requirement gets REQ-002", b.data?.code === "REQ-002" && b.data?.sort_order === 2);
  reqIds = [a.data.id, b.data.id];
  const bad = await call("POST", "/api/requirements", { body: { title: "no project" } });
  check("missing project -> 400", bad.status === 400);
  const list = await call("GET", `/api/requirements?project_id=${projectId}`);
  check("GET ?project_id lists both", list.data.length === 2);
  const rename = await call("PUT", `/api/requirements/${reqIds[0]}`, { body: { code: "auth-01" } });
  check("PUT custom code (normalised to upper-case)", rename.data?.code === "AUTH-01", JSON.stringify(rename.raw));
  const dup = await call("PUT", `/api/requirements/${reqIds[1]}`, { body: { code: "AUTH-01" } });
  check("duplicate code in the same project -> 409", dup.status === 409);
  const badCode = await call("PUT", `/api/requirements/${reqIds[1]}`, { body: { code: "bad code!" } });
  check("invalid code -> 400", badCode.status === 400);
  const custom = await call("POST", "/api/requirements", { body: { project_id: projectId, title: "Custom coded", code: "REQ-010" } });
  check("POST with custom REQ-010", custom.status === 201 && custom.data?.code === "REQ-010", JSON.stringify(custom.raw));
  const afterCustom = await call("POST", "/api/requirements", { body: { project_id: projectId, title: "Auto after custom" } });
  check("auto code continues after manual REQ-010", afterCustom.data?.code === "REQ-011", afterCustom.data?.code);
  await call("DELETE", `/api/requirements/${custom.data.id}`);
  await call("DELETE", `/api/requirements/${afterCustom.data.id}`);
  const re = await call("PUT", `/api/projects/${projectId}/requirements`, { body: { order: [reqIds[1], reqIds[0]] } });
  check("reorder within project", re.data[0].id === reqIds[1] && re.data[0].sort_order === 1);
  const link = await call("PUT", `/api/tasks/${taskId}`, { body: { requirement_id: reqIds[0] } });
  check("task links to requirement", link.data?.requirement_code === "AUTH-01", link.data?.requirement_code);
  const det = await call("GET", `/api/requirements/${reqIds[0]}`);
  check("requirement detail lists linked task", det.data?.tasks?.some((t) => t.id === taskId) && det.data.task_count === 1);
  const upd = await call("PUT", `/api/requirements/${reqIds[0]}`, { body: { status: "done", priority: "could" } });
  check("PUT requirement", upd.data?.status === "done" && upd.data?.priority === "could");
  const proj = await call("GET", `/api/projects/${projectId}`);
  check("project detail includes requirements", proj.data?.requirements?.length === 2);
  const del = await call("DELETE", `/api/requirements/${reqIds[1]}`);
  check("DELETE requirement", del.status === 200);
  const c = await call("POST", "/api/requirements", { body: { project_id: projectId, title: "Third" } });
  check("codes never collide after delete (counter keeps advancing)", /^REQ-\d{3}$/.test(c.data?.code ?? "") && Number(c.data.code.slice(4)) > 11, c.data?.code);
  reqIds = [reqIds[0], c.data.id];
}

console.log("attachments");
let attIds;
{
  const form = new FormData();
  form.append("files", new Blob(["hello world"], { type: "text/plain" }), "a.txt");
  form.append("files", new Blob(["{\"k\":1}"], { type: "application/json" }), "b.json");
  form.append("files", new Blob(["c"], { type: "text/plain" }), "c.txt");
  const up = await call("POST", `/api/tasks/${taskId}/attachments`, { form });
  check("upload 3 files -> 201", up.status === 201 && up.data?.length === 3, JSON.stringify(up.raw));
  attIds = up.data.map((a) => a.id);
  check("sort_order 1..3", up.data.map((a) => a.sort_order).join() === "1,2,3");
  const re = await call("PUT", `/api/tasks/${taskId}/attachments`, { body: { order: [attIds[2], attIds[0], attIds[1]] } });
  check("reorder via PUT", re.data.map((a) => a.original_name).join() === "c.txt,a.txt,b.json", re.data.map((a) => a.original_name).join());
  const pos = await call("PATCH", `/api/attachments/${attIds[1]}`, { body: { position: 1, original_name: "b-renamed.json" } });
  check("PATCH position=1 + rename", pos.data[0].original_name === "b-renamed.json", pos.data.map((a) => a.original_name).join());
  const file = await call("GET", `/api/attachments/${attIds[0]}?download=1`);
  check("GET file bytes", file.status === 200 && Buffer.from(file.raw).toString() === "hello world");
  check("content-disposition attachment", (file.headers.get("content-disposition") || "").startsWith("attachment"));
  const del = await call("DELETE", `/api/attachments/${attIds[2]}`);
  check("DELETE attachment renumbers", del.data.length === 2 && del.data.map((a) => a.sort_order).join() === "1,2");
}

console.log("requirement attachments");
{
  const form = new FormData();
  form.append("files", new Blob(["spec v1"], { type: "text/plain" }), "spec.txt");
  form.append("files", new Blob(["{}"], { type: "application/json" }), "schema.json");
  const up = await call("POST", `/api/requirements/${reqIds[0]}/attachments`, { form });
  check("upload 2 files to a requirement -> 201", up.status === 201 && up.data?.length === 2, JSON.stringify(up.raw));
  const ids = up.data.map((a) => a.id);
  const re = await call("PUT", `/api/requirements/${reqIds[0]}/attachments`, { body: { order: [ids[1], ids[0]] } });
  check("reorder requirement attachments", re.data[0].original_name === "schema.json");
  const file = await call("GET", `/api/attachments/requirement/${ids[0]}?download=1`);
  check("GET requirement file via /api/attachments/requirement/:id", file.status === 200 && Buffer.from(file.raw).toString() === "spec v1");
  const wrongKind = await call("GET", `/api/attachments/task/${ids[0]}`);
  check("kinds are separate tables (task kind never serves the requirement file)", wrongKind.status === 404 || Buffer.from(wrongKind.raw).toString() !== "spec v1");
  const det = await call("GET", `/api/requirements/${reqIds[0]}`);
  check("requirement detail includes attachments", det.data?.attachments?.length === 2);
  const del = await call("DELETE", `/api/attachments/requirement/${ids[1]}`);
  check("DELETE requirement attachment", del.data?.length === 1 && del.data[0].sort_order === 1);
}

console.log("outputs");
{
  const a = await call("POST", `/api/tasks/${taskId}/outputs`, { body: { title: "First", content: "line1\nline2" } });
  const b = await call("POST", `/api/tasks/${taskId}/outputs`, { body: { title: "Second", content: "x".repeat(5000) } });
  check("POST outputs", a.status === 201 && b.data.items.length === 2, JSON.stringify(b.raw).slice(0, 200));
  const ids = b.data.items.map((o) => o.id);
  const re = await call("PUT", `/api/tasks/${taskId}/outputs`, { body: { order: [ids[1], ids[0]] } });
  check("reorder outputs", re.data[0].title === "Second");
  const upd = await call("PUT", `/api/outputs/${ids[0]}`, { body: { content: "updated", position: 1 } });
  check("PUT output content + position", upd.data[0].id === ids[0] && upd.data[0].content === "updated");
  // whole-table outputs
  const t1 = await call("POST", `/api/tasks/${taskId}/outputs`, { body: { title: "Timings", format: "table", content: JSON.stringify({ columns: ["Step", "ms"], rows: [["build", "1200"], ["test", "800"]] }) } });
  const t1row = t1.data.items.find((o) => o.id === t1.data.created_id);
  check("POST table output", t1.status === 201 && t1row?.format === "table" && JSON.parse(t1row.content).columns.length === 2);
  const t1bad = await call("PUT", `/api/outputs/${t1.data.created_id}`, { body: { content: JSON.stringify({ columns: [] }) } });
  check("table output rejects malformed content", t1bad.status === 400);
  const t1text = await call("PUT", `/api/outputs/${t1.data.created_id}`, { body: { format: "text", content: "| Step | ms |\n| --- | --- |\n| build | 1200 |" } });
  check("table output -> text", t1text.data.find((o) => o.id === t1.data.created_id)?.format === "text");
  const t1back = await call("PUT", `/api/outputs/${t1.data.created_id}`, { body: { format: "table", content: { columns: ["Step"], rows: [["build"]] } } });
  check("text output -> table (object body accepted)", t1back.data.find((o) => o.id === t1.data.created_id)?.format === "table");
  const noContent = await call("PUT", `/api/outputs/${ids[0]}`, { body: { format: "table" } });
  check("switching to table without table content -> 400", noContent.status === 400);
  await call("DELETE", `/api/outputs/${t1.data.created_id}`);
  const det = await call("GET", `/api/tasks/${taskId}`);
  check("GET task detail includes attachments + outputs", det.data.attachments.length === 2 && det.data.outputs.length === 2);
  const del = await call("DELETE", `/api/outputs/${ids[1]}`);
  check("DELETE output", del.data.length === 1);
}

console.log("notes + search + stats");
{
  const n = await call("POST", "/api/notes", { body: { module: "tasks", title: "Smoke note", content: "hi", color: "pink" } });
  check("POST note", n.status === 201 && n.data.color === "pink");
  const u = await call("PUT", `/api/notes/${n.data.id}`, { body: { pinned: true, content: "changed" } });
  check("PUT note", u.data.pinned === 1 && u.data.content === "changed");
  const list = await call("GET", "/api/notes?module=tasks");
  check("GET notes by module", list.data.some((x) => x.id === n.data.id));
  const d = await call("DELETE", `/api/notes/${n.data.id}`);
  check("DELETE note", d.status === 200);
  const s = await call("GET", "/api/search?q=smoke");
  check("search finds project/employee/task", s.data.projects.length >= 1 && s.data.employees.length >= 1 && s.data.tasks.length >= 1);
  const st = await call("GET", "/api/stats");
  check("stats shape", st.data.counts && Array.isArray(st.data.projects) && Array.isArray(st.data.workload));
}

console.log("info vault");
{
  const created = await call("POST", "/api/info", { body: { title: "Staging DB", category: "credential", tags: "infra, Staging", username: "app_user", secret: "s3cr3t-pass", url: "db.example.com", summary: "Postgres on staging" } });
  check("POST /api/info 201 (secret encrypted)", created.status === 201 && created.data?.has_secret === true && !("secret_enc" in created.data) && !("secret" in created.data), JSON.stringify(created.raw).slice(0, 200));
  check("tags normalised + url gets https", created.data?.tags === "infra,staging" && created.data?.url === "https://db.example.com");
  const infoId = created.data.id;
  const list = await call("GET", "/api/info?tag=infra");
  check("GET /api/info?tag filter, no secret in list", list.data.some((i) => i.id === infoId) && list.data.every((i) => !("secret_enc" in i) && !("content" in i)));
  const noCreds = await call("POST", `/api/info/${infoId}/reveal`, { body: {} });
  check("reveal without verification -> 401 with needs", noCreds.status === 401 && Array.isArray(noCreds.raw?.details?.needs), JSON.stringify(noCreds.raw));
  const wrong = await call("POST", `/api/info/${infoId}/reveal`, { body: { password: "nope" } });
  check("wrong password -> 401", wrong.status === 401);
  const reveal = await call("POST", `/api/info/${infoId}/reveal`, { body: { password: "admin123" } });
  check("reveal with password returns the decrypted secret", reveal.data?.secret === "s3cr3t-pass" && reveal.data?.unlocked_until, JSON.stringify(reveal.raw));
  const again = await call("POST", `/api/info/${infoId}/reveal`, { body: {} });
  check("second reveal within the window needs no credentials", again.data?.secret === "s3cr3t-pass");
  const setPin = await call("PUT", "/api/auth/pin", { body: { pin: "2468" } });
  check("PUT /api/auth/pin stores a server copy", setPin.data?.has_pin === true);
  const meHasPin = await call("GET", "/api/auth/me");
  check("me reports has_pin", meHasPin.data?.has_pin === true);
  const byPin = await call("POST", `/api/info/${infoId}/reveal`, { body: { pin: "2468" } });
  check("reveal with PIN works", byPin.data?.secret === "s3cr3t-pass");
  const badPin = await call("POST", `/api/info/${infoId}/reveal`, { body: { pin: "0000" } });
  check("wrong PIN -> 401", badPin.status === 401);
  await call("PUT", "/api/auth/pin", { body: { pin: null } });
  const linked = await call("PUT", `/api/info/${infoId}`, { body: { project_id: projectId } });
  check("info linked to a project", linked.data?.project_id === projectId && linked.data?.project_name === "Smoke Project");
  const byProject = await call("GET", `/api/info?project_id=${projectId}`);
  check("GET /api/info?project_id filter", byProject.data.some((i) => i.id === infoId));
  const badProject = await call("PUT", `/api/info/${infoId}`, { body: { project_id: 999999 } });
  check("linking a foreign project -> 400", badProject.status === 400);
  const note = await call("POST", `/api/info/${infoId}/notes`, { body: { title: "Rotation", content: "Rotate monthly" } });
  const note2 = await call("POST", `/api/info/${infoId}/notes`, { body: { title: "Access", content: "VPN required" } });
  check("notes created", note.status === 201 && note2.data.items.length === 2);
  const reordered = await call("PUT", `/api/info/${infoId}/notes`, { body: { order: [note2.data.created_id, note.data.created_id] } });
  check("notes reorder", reordered.data[0].title === "Access");
  // table-format notes: validated JSON in, normalised JSON out, searchable by cell text
  const tbl = await call("POST", `/api/info/${infoId}/notes`, { body: { title: "Ports", format: "table", content: JSON.stringify({ columns: ["Service", "Port"], rows: [["Zebra-Gateway", "8443"], ["db"]] }) } });
  const tblNote = tbl.data.items.find((n) => n.id === tbl.data.created_id);
  check("POST table note -> format table, rows normalised", tbl.status === 201 && tblNote?.format === "table" && JSON.parse(tblNote.content).rows[1].length === 2);
  const badTbl = await call("POST", `/api/info/${infoId}/notes`, { body: { format: "table", content: "not json" } });
  check("table note with bad content -> 400", badTbl.status === 400);
  const badFmt = await call("PUT", `/api/info-notes/${tbl.data.created_id}`, { body: { format: "grid" } });
  check("unknown format -> 400", badFmt.status === 400);
  const sCell = await call("GET", `/api/info/search?q=Zebra-Gateway&fields=notes`);
  const cellHit = sCell.data.items.find((i) => i.id === infoId)?.matches.find((m) => m.field === "note");
  check("info search: table cells are searchable with a flat snippet", Boolean(cellHit) && cellHit.snippet.includes("Zebra-Gateway") && !cellHit.snippet.includes("{"));
  const toText = await call("PUT", `/api/info-notes/${tbl.data.created_id}`, { body: { format: "text", content: "| Service | Port |\n| --- | --- |\n| Zebra-Gateway | 8443 |" } });
  check("table note -> text (markdown)", toText.status === 200 && toText.data.find((n) => n.id === tbl.data.created_id)?.format === "text");
  await call("DELETE", `/api/info-notes/${tbl.data.created_id}`);
  const form = new FormData();
  form.append("files", new Blob(["cert"], { type: "text/plain" }), "ca.pem");
  const up = await call("POST", `/api/info/${infoId}/attachments`, { form });
  check("info attachment upload", up.status === 201 && up.data.length === 1);
  const file = await call("GET", `/api/attachments/info/${up.data[0].id}?download=1`);
  check("info attachment served via /api/attachments/info/:id", file.status === 200 && Buffer.from(file.raw).toString() === "cert");
  const det = await call("GET", `/api/info/${infoId}`);
  check("detail has notes + attachments, no secret", det.data.notes.length === 2 && det.data.attachments.length === 1 && det.data.has_secret === true && !("secret_enc" in det.data));
  // search page API: words are ANDed across the chosen fields, snippets are returned, secrets never are
  const sTitle = await call("GET", `/api/info/search?q=${encodeURIComponent("staging")}`);
  const sHit = sTitle.data.items.find((i) => i.id === infoId);
  check("info search: title/summary/tags hit with snippets", sTitle.status === 200 && Boolean(sHit) && sHit.matches.some((m) => m.field === "title") && !("content" in sHit));
  const sNote = await call("GET", `/api/info/search?q=monthly&fields=notes`);
  check("info search: notes scope", sNote.data.items.some((i) => i.id === infoId && i.matches.some((m) => m.field === "note" && /monthly/i.test(m.snippet))));
  const sFile = await call("GET", `/api/info/search?q=ca.pem&fields=attachments`);
  check("info search: attachment names", sFile.data.items.some((i) => i.id === infoId && i.matches.some((m) => m.field === "attachment")));
  const sAnd = await call("GET", `/api/info/search?q=${encodeURIComponent("staging monthly")}`);
  check("info search: every word must match (title + note)", sAnd.data.items.some((i) => i.id === infoId));
  const sSecret = await call("GET", `/api/info/search?q=s3cr3t`);
  check("info search: secrets are not searchable nor leaked", sSecret.data.items.every((i) => i.id !== infoId) && !JSON.stringify(sSecret.data.items).includes("s3cr3t"));
  const sMiss = await call("GET", `/api/info/search?q=zzz-nope-zzz`);
  check("info search: no false positives", sMiss.status === 200 && sMiss.data.items.length === 0);
  const sFilter = await call("GET", `/api/info/search?q=staging&category=guideline`);
  check("info search: category filter", sFilter.data.items.every((i) => i.id !== infoId));
  const cleared = await call("PUT", `/api/info/${infoId}`, { body: { secret: null, pinned: true } });
  check("clear secret + pin", cleared.data.has_secret === false && cleared.data.pinned === 1);
  const del = await call("DELETE", `/api/info/${infoId}`);
  check("DELETE info", del.status === 200);
}

console.log("profiles");
{
  const list = await call("GET", "/api/profiles");
  check("GET /api/profiles has a default + active id", list.data?.items?.some((p) => p.is_default) && list.data.active_id, JSON.stringify(list.raw).slice(0, 200));
  const original = list.data.active_id;
  const created = await call("POST", "/api/profiles", { body: { name: `Smoke profile ${suffix}`, color: "#10b981" } });
  check("POST /api/profiles 201", created.status === 201, JSON.stringify(created.raw));
  const dup = await call("POST", "/api/profiles", { body: { name: `Smoke profile ${suffix}` } });
  check("duplicate profile name -> 409", dup.status === 409);
  const act = await call("POST", `/api/profiles/${created.data.id}/activate`);
  check("activate profile sets cookie", act.status === 200 && Boolean(jar.ap_profile));
  const me = await call("GET", "/api/auth/me");
  check("me reports the new active profile", me.data?.profile_id === created.data.id);
  const empty = await call("GET", "/api/projects");
  check("new profile starts empty", empty.data.length === 0);
  const hidden = await call("GET", `/api/projects/${projectId}`);
  check("other profile's project is 404 here", hidden.status === 404);
  const sameCode = await call("POST", "/api/projects", { body: { name: "Same code elsewhere", code: `SMK-${suffix}` } });
  check("same project code allowed in another profile", sameCode.status === 201, JSON.stringify(sameCode.raw));
  const stats = await call("GET", "/api/stats");
  check("stats are per profile", stats.data.counts.projects === 1);
  const back = await call("POST", `/api/profiles/${original}/activate`);
  check("switch back", back.status === 200 && (await call("GET", "/api/auth/me")).data.profile_id === original);
  const visibleAgain = await call("GET", `/api/projects/${projectId}`);
  check("original project visible again", visibleAgain.status === 200);
  const del = await call("DELETE", `/api/profiles/${created.data.id}`);
  check("DELETE profile (cascades its data)", del.status === 200);
  const gone = await call("GET", `/api/projects/${sameCode.data.id}`);
  check("profile's project gone", gone.status === 404);
  const last = await call("DELETE", `/api/profiles/${original}`);
  check("cannot delete the last profile", last.status === 400);
}

console.log("notifications");
{
  const list = await call("GET", "/api/notifications");
  check("GET /api/notifications", list.status === 200 && Array.isArray(list.data.items) && typeof list.data.unread === "number");
  check("sign-in produced a security notification", list.data.items.some((n) => n.type === "security_login"));
  const done = await call("PUT", `/api/tasks/${taskId}`, { body: { status: "done" } });
  check("task -> done", done.data?.status === "done");
  const after = await call("GET", "/api/notifications?unread=1");
  const doneNote = after.data.items.find((n) => n.type === "task_done" && n.entity_id === taskId);
  check("task_done notification created for the owner", Boolean(doneNote), JSON.stringify(after.data.items.slice(0, 3)));
  await call("PUT", `/api/tasks/${taskId}`, { body: { status: "todo", due_date: "2020-01-01" } });
  const reminders = await call("GET", "/api/notifications?unread=1");
  check("overdue reminder generated lazily", reminders.data.items.some((n) => n.type === "task_overdue" && n.entity_id === taskId));
  const again = await call("GET", "/api/notifications?unread=1");
  check("reminder not duplicated", again.data.items.filter((n) => n.type === "task_overdue" && n.entity_id === taskId).length === 1);
  const one = await call("PUT", `/api/notifications/${doneNote.id}`, { body: { read: true } });
  check("mark one read", one.data?.read_at != null);
  const readAll = await call("POST", "/api/notifications/read-all");
  check("mark all read", readAll.status === 200);
  const count = await call("GET", "/api/notifications/count");
  check("unread count is 0", count.data?.unread === 0);
  const mute = await call("PUT", "/api/auth/profile", { body: { notification_prefs: { muted: ["tasks"] } } });
  check("mute tasks category", (typeof mute.data?.notification_prefs === "string" ? JSON.parse(mute.data.notification_prefs) : mute.data?.notification_prefs)?.muted?.includes("tasks"));
  await call("PUT", `/api/tasks/${taskId}`, { body: { status: "done" } });
  const muted = await call("GET", "/api/notifications?unread=1");
  check("muted category produces no notification", !muted.data.items.some((n) => n.type === "task_done"));
  await call("PUT", "/api/auth/profile", { body: { notification_prefs: { muted: [] } } });
  const cleared = await call("DELETE", "/api/notifications");
  check("clear read notifications", cleared.status === 200);
}

console.log("background settings");
{
  const pub = await call("GET", "/api/settings/backgrounds", { noAuth: true });
  check("GET is public and returns defaults", pub.status === 200 && Array.isArray(pub.data.enabled) && pub.data.enabled.length >= 10 && typeof pub.data.default === "string" && pub.data.locked === false);
  const before = pub.data;
  const bad1 = await call("PUT", "/api/settings/backgrounds", { body: { enabled: ["aurora", "nope"], default: "aurora" } });
  check("unknown key -> 400", bad1.status === 400);
  const bad2 = await call("PUT", "/api/settings/backgrounds", { body: { enabled: ["aurora"], default: "stars" } });
  check("default outside enabled -> 400", bad2.status === 400);
  const bad3 = await call("PUT", "/api/settings/backgrounds", { body: { enabled: [], default: "none" } });
  check("empty list -> 400", bad3.status === 400);
  const saved = await call("PUT", "/api/settings/backgrounds", { body: { enabled: ["stars", "none", "rain"], default: "rain", locked: true } });
  check("admin saves settings", saved.status === 200 && saved.data.default === "rain" && saved.data.locked === true && saved.data.enabled.join() === "stars,rain,none");
  const readBack = await call("GET", "/api/settings/backgrounds", { noAuth: true });
  check("settings persist", readBack.data.default === "rain" && readBack.data.locked === true);
  const restore = await call("PUT", "/api/settings/backgrounds", { body: before });
  check("restore defaults", restore.status === 200 && restore.data.locked === false);
}

console.log("draw boards");
{
  const created = await call("POST", "/api/drawboards", { body: { title: "Smoke board", description: "sketch", width: 1280, height: 800, background: "#ffffff" } });
  check("POST /api/drawboards 201", created.status === 201 && created.data?.id > 0 && created.data.has_drawing === false, JSON.stringify(created.raw).slice(0, 160));
  const bid = created.data.id;
  const badSize = await call("POST", "/api/drawboards", { body: { title: "x", width: 10 } });
  check("width out of range -> 400", badSize.status === 400);
  const badBg = await call("PUT", `/api/drawboards/${bid}`, { body: { background: "red" } });
  check("non-hex background -> 400", badBg.status === 400);
  const badData = await call("PUT", `/api/drawboards/${bid}`, { body: { data: "{not json" } });
  check("non-JSON drawing -> 400", badData.status === 400);
  const badThumb = await call("PUT", `/api/drawboards/${bid}`, { body: { thumbnail: "http://evil" } });
  check("non-data-URL thumbnail -> 400", badThumb.status === 400);
  const fabricJson = JSON.stringify({ version: "7.0.0", objects: [{ type: "Rect", left: 10, top: 10, width: 100, height: 50, fill: "red" }], background: "#ffffff" });
  const saved = await call("PUT", `/api/drawboards/${bid}?light=1`, { body: { data: fabricJson, thumbnail: "data:image/jpeg;base64,/9j/4AAQ", notes: "see @[Smoke Project](project:1)" } });
  check("PUT drawing + thumbnail + notes (light response)", saved.status === 200 && saved.data.has_drawing === true && !("data" in saved.data));
  const detail = await call("GET", `/api/drawboards/${bid}`);
  check("GET detail carries data, thumbnail, attachments", detail.data.data === fabricJson && detail.data.thumbnail.startsWith("data:image/") && Array.isArray(detail.data.attachments));
  const list = await call("GET", "/api/drawboards");
  check("list has the board without the drawing data", list.data.some((b) => b.id === bid) && list.data.every((b) => !("data" in b)));
  const form = new FormData();
  form.append("files", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "pasted.png");
  const up = await call("POST", `/api/drawboards/${bid}/attachments`, { form });
  check("image upload for a board", up.status === 201 && up.data.length === 1);
  const file = await call("GET", `/api/attachments/drawboard/${up.data[0].id}`);
  check("board image served via /api/attachments/drawboard/:id", file.status === 200);
  const s = await call("GET", "/api/search?q=Smoke%20board");
  check("global search finds boards", Array.isArray(s.data.drawboards) && s.data.drawboards.some((b) => b.id === bid));
  const stats = await call("GET", "/api/stats");
  check("stats count boards", typeof stats.data.counts.drawboards === "number" && stats.data.counts.drawboards >= 1);
  const foreign = await call("PUT", `/api/drawboards/${bid}`, { body: { project_id: 999999 } });
  check("foreign project -> 400", foreign.status === 400);
  const del = await call("DELETE", `/api/drawboards/${bid}`);
  check("DELETE board (purges images)", del.status === 200);
  const gone = await call("GET", `/api/attachments/drawboard/${up.data[0].id}`);
  check("image gone after delete", gone.status === 404);
}

console.log("task depth: checklist, tags, dates");
{
  const made = await call("POST", "/api/tasks", { body: { title: "Depth task", start_date: "2026-10-01", due_date: "2026-10-15", estimate_hours: "12.5", tags: "Release, Client X, release, #QA" } });
  check("a task takes a start date, an estimate and normalised tags", made.status === 201 && made.data.start_date === "2026-10-01" && Number(made.data.estimate_hours) === 12.5 && made.data.tags === "release,client-x,qa", JSON.stringify(made.raw).slice(0, 220));
  const tid = made.data.id;
  const badOrder = await call("PUT", `/api/tasks/${tid}`, { body: { start_date: "2026-11-01" } });
  const badEst = await call("PUT", `/api/tasks/${tid}`, { body: { estimate_hours: -1 } });
  const badDate = await call("PUT", `/api/tasks/${tid}`, { body: { start_date: "soon" } });
  check("start after due, a negative estimate and a non-date -> 400", badOrder.status === 400 && /after the due date/.test(badOrder.error) && badEst.status === 400 && badDate.status === 400);
  const byTag = await call("GET", "/api/tasks?tag=Client-X");
  const byOther = await call("GET", "/api/tasks?tag=client");
  check("the list filters by exact tag", byTag.data.some((t) => t.id === tid) && !byOther.data.some((t) => t.id === tid));
  check("…and search matches tags", (await call("GET", "/api/tasks?q=client-x")).data.some((t) => t.id === tid));
  const tags = await call("GET", "/api/tasks/tags");
  check("the tag list counts usage", tags.status === 200 && tags.data.some((t) => t.tag === "release" && t.count >= 1) && tags.data.some((t) => t.tag === "qa"));
  const cleared = await call("PUT", `/api/tasks/${tid}`, { body: { tags: "", estimate_hours: null, start_date: null } });
  check("tags, estimate and start date can be cleared", cleared.data.tags === null && cleared.data.estimate_hours === null && cleared.data.start_date === null);
  const noTitle = await call("POST", `/api/tasks/${tid}/checklist`, { body: { title: "   " } });
  check("an empty checklist item -> 400", noTitle.status === 400);
  const one = await call("POST", `/api/tasks/${tid}/checklist`, { body: { title: "Write the changelog" } });
  const many = await call("POST", `/api/tasks/${tid}/checklist`, { body: { title: "- Tag the build\n- [ ] Notify the client\n3. Update the docs\n\n" } });
  check("one item, then a pasted list becomes one item per line without its bullets", one.status === 201 && one.data.length === 1 && many.status === 201 && many.data.map((i) => i.title).join("|") === "Write the changelog|Tag the build|Notify the client|Update the docs", JSON.stringify(many.data?.map((i) => i.title)));
  const [a, b, c, d] = many.data;
  const tick = await call("PUT", `/api/tasks/${tid}/checklist/${b.id}`, { body: { done: true } });
  check("ticking an item records who and when", tick.status === 200 && tick.data.find((i) => i.id === b.id).done === 1 && tick.data.find((i) => i.id === b.id).done_by_name === "Admin User" && tick.data.find((i) => i.id === b.id).done_at !== null);
  const renamed = await call("PUT", `/api/tasks/${tid}/checklist/${c.id}`, { body: { title: "Notify the client by email" } });
  const blank = await call("PUT", `/api/tasks/${tid}/checklist/${c.id}`, { body: { title: "" } });
  check("an item can be renamed, not blanked", renamed.data.find((i) => i.id === c.id).title === "Notify the client by email" && blank.status === 400);
  const order = await call("PUT", `/api/tasks/${tid}/checklist`, { body: { order: [d.id, a.id] } });
  check("reordering keeps unlisted items after the listed ones", order.status === 200 && order.data.map((i) => i.id).join() === [d.id, a.id, b.id, c.id].join());
  const gone = await call("DELETE", `/api/tasks/${tid}/checklist/${a.id}`);
  check("an item can be deleted", gone.status === 200 && gone.data.length === 3);
  const detail = await call("GET", `/api/tasks/${tid}`);
  const inList = (await call("GET", "/api/tasks")).data.find((t) => t.id === tid);
  check("the task carries its checklist and the list carries the progress", detail.data.checklist.length === 3 && Number(inList.checklist_total) === 3 && Number(inList.checklist_done) === 1);
  const hist = await call("GET", `/api/tasks/${tid}/history`);
  const acts = hist.data.map((h) => `${h.action}:${h.field ?? ""}`);
  check("history covers tags, dates, estimate and the checklist", ["created:", "updated:tags", "updated:start_date", "updated:estimate", "checklist_added:", "checklist_done:", "checklist_removed:"].every((k) => acts.includes(k)), acts.join(" "));
  check("a checklist item of another task -> 404", (await call("PUT", `/api/tasks/${taskId}/checklist/${b.id}`, { body: { done: false } })).status === 404);
  const del = await call("DELETE", `/api/tasks/${tid}`);
  check("deleting the task takes its checklist along", del.status === 200 && (await call("PUT", `/api/tasks/${tid}/checklist/${b.id}`, { body: { done: false } })).status === 404);
}

console.log("planning: dependencies");
{
  const mk = async (title, extra = {}) => (await call("POST", "/api/tasks", { body: { title, ...extra } })).data;
  const a = await mk("Dep A design"), b = await mk("Dep B build"), c = await mk("Dep C ship");
  const ab = await call("POST", `/api/tasks/${b.id}/dependencies`, { body: { depends_on_id: a.id } });
  check("B waits for A -> 201 with both directions listed", ab.status === 201 && ab.data.blocked_by.length === 1 && ab.data.blocked_by[0].id === a.id && ab.data.open === 1);
  const bc = await call("POST", `/api/tasks/${c.id}/dependencies`, { body: { depends_on_id: b.id } });
  check("C waits for B", bc.status === 201);
  const dup = await call("POST", `/api/tasks/${b.id}/dependencies`, { body: { depends_on_id: a.id } });
  const self = await call("POST", `/api/tasks/${a.id}/dependencies`, { body: { depends_on_id: a.id } });
  const ghost = await call("POST", `/api/tasks/${a.id}/dependencies`, { body: { depends_on_id: 999999 } });
  const junk = await call("POST", `/api/tasks/${a.id}/dependencies`, { body: {} });
  check("duplicate 409, itself 400, unknown task 404, nothing 400", dup.status === 409 && self.status === 400 && ghost.status === 404 && junk.status === 400);
  const loop = await call("POST", `/api/tasks/${a.id}/dependencies`, { body: { depends_on_id: c.id } });
  check("a loop through two hops is refused (409) and says why", loop.status === 409 && /loop/.test(loop.error) && /Dep C ship/.test(loop.error));
  const ofB = await call("GET", `/api/tasks/${b.id}/dependencies`);
  check("a task lists what it waits for and what needs it", ofB.data.blocked_by[0].title === "Dep A design" && ofB.data.blocking[0].title === "Dep C ship");
  const rowB = (await call("GET", "/api/tasks")).data.find((t) => t.id === b.id);
  check("list rows carry dependency_count and blocked_by_open", Number(rowB.dependency_count) === 1 && Number(rowB.blocked_by_open) === 1);
  const pairs = await call("GET", "/api/tasks/dependencies");
  check("every pair of the profile is listed for the timeline", pairs.status === 200 && pairs.data.some((p) => p.task_id === b.id && p.depends_on_id === a.id) && pairs.data.some((p) => p.task_id === c.id && p.depends_on_id === b.id));
  await call("PUT", `/api/tasks/${a.id}`, { body: { status: "done" } });
  check("finishing the blocker unblocks the waiting task", Number((await call("GET", `/api/tasks/${b.id}`)).data.blocked_by_open) === 0);
  const hist = (await call("GET", `/api/tasks/${b.id}/history`)).data;
  check("history records the dependency", hist.some((h) => h.action === "dependency_added" && h.new_value === "Dep A design"));
  const rm = await call("DELETE", `/api/tasks/${c.id}/dependencies/${b.id}`);
  const rmAgain = await call("DELETE", `/api/tasks/${c.id}/dependencies/${b.id}`);
  check("a dependency can be removed once", rm.status === 200 && rm.data.blocked_by.length === 0 && rmAgain.status === 404);
  await call("DELETE", `/api/tasks/${a.id}`);
  check("deleting a task removes the dependencies that pointed at it", (await call("GET", `/api/tasks/${b.id}/dependencies`)).data.blocked_by.length === 0);
  await call("DELETE", `/api/tasks/${b.id}`);
  await call("DELETE", `/api/tasks/${c.id}`);
}

console.log("planning: time tracking");
{
  const t1 = (await call("POST", "/api/tasks", { body: { title: "Time A", estimate_hours: 2 } })).data;
  const t2 = (await call("POST", "/api/tasks", { body: { title: "Time B" } })).data;
  const bad = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "soon" } });
  const zero = await call("POST", `/api/tasks/${t1.id}/time`, { body: { minutes: 0 } });
  const huge = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "30h" } });
  const badDay = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "1h", spent_on: "yesterday" } });
  check("unreadable, zero, over a day and a non-date -> 400", [bad, zero, huge, badDay].every((r) => r.status === 400), [bad, zero, huge, badDay].map((r) => r.status).join());
  const e1 = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "1h 30m", spent_on: "2026-09-01", note: "  drafting  " } });
  const e2 = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "0:45" } });
  const e3 = await call("POST", `/api/tasks/${t1.id}/time`, { body: { duration: "0,5" } });
  check("durations are read as people write them (1h 30m, 0:45, 0,5)", e1.status === 201 && e3.status === 201 && e3.data.total_minutes === 165 && e3.data.entries.some((e) => e.minutes === 90 && e.note === "drafting" && e.spent_on === "2026-09-01" && e.mine === true), JSON.stringify(e3.data?.entries?.map((e) => e.minutes)));
  check("the task row carries minutes_logged", Number((await call("GET", `/api/tasks/${t1.id}`)).data.minutes_logged) === 165);
  const mine = e2.data.entries.find((e) => e.minutes === 45);
  const edited = await call("PUT", `/api/tasks/${t1.id}/time/${mine.id}`, { body: { duration: "1h", note: "review" } });
  check("an entry can be corrected", edited.status === 200 && edited.data.total_minutes === 180 && edited.data.entries.find((e) => e.id === mine.id).note === "review");
  const start = await call("POST", `/api/tasks/${t1.id}/time`, { body: { start: true } });
  check("starting a timer -> a running entry", start.status === 201 && start.data.running && start.data.running.running === true && start.data.stopped === null);
  const run = await call("GET", "/api/time/running");
  check("my running timer is known everywhere", run.status === 200 && run.data.running?.task_id === t1.id && run.data.running.task_title === "Time A" && typeof run.data.running.elapsed_seconds === "number");
  const lockEdit = await call("PUT", `/api/tasks/${t1.id}/time/${start.data.running.id}`, { body: { duration: "5h" } });
  check("a running entry cannot be edited (409)", lockEdit.status === 409);
  const second = await call("POST", `/api/tasks/${t2.id}/time`, { body: { start: true } });
  check("starting another timer stops the first and keeps at least a minute", second.status === 201 && second.data.stopped?.task_id === t1.id && second.data.stopped.minutes >= 1);
  const afterSwitch = await call("GET", `/api/tasks/${t1.id}/time`);
  check("…the first task has no running timer any more", afterSwitch.data.running === null && afterSwitch.data.total_minutes >= 181);
  const stop = await call("POST", "/api/time/stop", { body: {} });
  const stopAgain = await call("POST", "/api/time/stop", { body: {} });
  check("stop ends my timer once", stop.status === 200 && stop.data.stopped?.task_id === t2.id && stopAgain.data.stopped === null && (await call("GET", "/api/time/running")).data.running === null);
  const del = await call("DELETE", `/api/tasks/${t1.id}/time/${mine.id}`);
  check("an entry can be deleted", del.status === 200 && !del.data.entries.some((e) => e.id === mine.id));
  check("an entry of another task -> 404", (await call("DELETE", `/api/tasks/${t2.id}/time/${e1.data.entries[0].id}`)).status === 404);
  await call("DELETE", `/api/tasks/${t1.id}`);
  await call("DELETE", `/api/tasks/${t2.id}`);
}

console.log("planning: repeating tasks");
{
  const badRule = await call("POST", "/api/tasks", { body: { title: "Repeat bad", repeat_rule: "hourly" } });
  check("an unknown repeat rule -> 400", badRule.status === 400);
  const made = await call("POST", "/api/tasks", { body: { title: "Repeat weekly report", repeat_rule: "weekly", start_date: "2026-08-29", due_date: "2026-08-31", estimate_hours: 1, tags: "report", priority: "high" } });
  check("a task can repeat", made.status === 201 && made.data.repeat_rule === "weekly" && made.data.repeat_next_id === null);
  const rid = made.data.id;
  const list = await call("POST", `/api/tasks/${rid}/checklist`, { body: { title: "Collect numbers\nWrite summary" } });
  await call("PUT", `/api/tasks/${rid}/checklist/${list.data[0].id}`, { body: { done: true } });
  const moved = await call("PUT", `/api/tasks/${rid}`, { body: { status: "in_progress" } });
  check("moving it without finishing makes nothing", moved.status === 200 && !moved.data.next_task);
  const done = await call("PUT", `/api/tasks/${rid}`, { body: { status: "done", today: "2026-09-18" } });
  check("completing it creates the next one: same weekday, first date not in the past, start date moved along", done.status === 200 && done.data.next_task?.due_date === "2026-09-21" && done.data.next_task.start_date === "2026-09-19" && done.data.repeat_next_id === done.data.next_task.id, JSON.stringify(done.data.next_task));
  const next = await call("GET", `/api/tasks/${done.data.next_task.id}`);
  check("the next task copies what matters and starts fresh", next.data.status === "todo" && next.data.priority === "high" && next.data.tags === "report" && Number(next.data.estimate_hours) === 1 && next.data.repeat_rule === "weekly" && next.data.repeat_series_id === rid && next.data.checklist.map((k) => `${k.title}:${k.done}`).join() === "Collect numbers:0,Write summary:0" && Number(next.data.comment_count) === 0);
  await call("PUT", `/api/tasks/${rid}`, { body: { status: "todo" } });
  const again = await call("PUT", `/api/tasks/${rid}`, { body: { status: "done", today: "2026-09-18" } });
  check("reopening and completing again does not make a second one", again.status === 200 && !again.data.next_task && (await call("GET", "/api/tasks?q=Repeat weekly report")).data.length === 2);
  const hist = (await call("GET", `/api/tasks/${rid}/history`)).data;
  check("history says the next one was created", hist.some((h) => h.action === "repeat_spawned" && h.new_value === "2026-09-21") && (await call("GET", `/api/tasks/${next.data.id}/history`)).data[0].action === "created_from_repeat");
  const ending = await call("POST", "/api/tasks", { body: { title: "Repeat ending", repeat_rule: "monthly", due_date: "2026-09-10", repeat_until: "2026-10-01" } });
  const ended = await call("PUT", `/api/tasks/${ending.data.id}`, { body: { status: "done", today: "2026-09-18" } });
  check("a series stops at its end date", ended.status === 200 && !ended.data.next_task);
  const monthEnd = await call("POST", "/api/tasks", { body: { title: "Repeat month end", repeat_rule: "monthly", due_date: "2027-01-31" } });
  const feb = await call("PUT", `/api/tasks/${monthEnd.data.id}`, { body: { status: "done", today: "2027-01-31" } });
  check("monthly from the 31st lands on the last day of a shorter month", feb.data.next_task?.due_date === "2027-02-28");
  const off = await call("PUT", `/api/tasks/${next.data.id}`, { body: { repeat_rule: null } });
  const offDone = await call("PUT", `/api/tasks/${next.data.id}`, { body: { status: "done" } });
  check("turning repeat off ends the series", off.data.repeat_rule === null && !offDone.data.next_task);
  for (const t of (await call("GET", "/api/tasks?q=Repeat ")).data) await call("DELETE", `/api/tasks/${t.id}`);
}

console.log("planning: calendar events");
{
  const noTitle = await call("POST", "/api/events", { body: { start_date: "2026-10-05" } });
  const noDate = await call("POST", "/api/events", { body: { title: "Ev nothing" } });
  const backwards = await call("POST", "/api/events", { body: { title: "Ev backwards", start_date: "2026-10-05", end_date: "2026-10-01" } });
  const noTime = await call("POST", "/api/events", { body: { title: "Ev timed", start_date: "2026-10-05", all_day: false } });
  const badTime = await call("POST", "/api/events", { body: { title: "Ev timed", start_date: "2026-10-05", all_day: false, start_time: "25:00" } });
  const endsEarly = await call("POST", "/api/events", { body: { title: "Ev timed", start_date: "2026-10-05", all_day: false, start_time: "14:00", end_time: "13:00" } });
  const strangerProject = await call("POST", "/api/events", { body: { title: "Ev project", start_date: "2026-10-05", project_id: 999999 } });
  check("no title, no date, ends before it starts, missing/odd times, a foreign project -> 400", [noTitle, noDate, backwards, noTime, badTime, endsEarly, strangerProject].every((r) => r.status === 400), [noTitle, noDate, backwards, noTime, badTime, endsEarly, strangerProject].map((r) => r.status).join());
  const holiday = await call("POST", "/api/events", { body: { title: "Ev Public holiday", start_date: "2026-10-05" } });
  check("an all-day event needs only a title and a day", holiday.status === 201 && holiday.data.all_day === 1 && holiday.data.end_date === "2026-10-05" && holiday.data.start_time === null && holiday.data.created_by_name === "Admin User");
  const workshop = await call("POST", "/api/events", { body: { title: "Ev Workshop", start_date: "2026-10-07", end_date: "2026-10-09", location: "KL office", color: "#f97316", project_id: projectId } });
  const review = await call("POST", "/api/events", { body: { title: "Ev Sprint review", start_date: "2026-10-08", all_day: false, start_time: "14:00", end_time: "15:30", description: "Demo the release" } });
  check("multi-day and timed events keep their fields", workshop.status === 201 && workshop.data.project_id === projectId && workshop.data.color === "#f97316" && review.status === 201 && review.data.all_day === 0 && review.data.start_time === "14:00" && review.data.end_time === "15:30");
  const day8 = await call("GET", "/api/events?from=2026-10-08&to=2026-10-08");
  check("a range lists every event that touches it, all-day first", day8.status === 200 && day8.data.map((e) => e.title).join("|") === "Ev Workshop|Ev Sprint review", day8.data?.map((e) => e.title).join("|"));
  const before = await call("GET", "/api/events?from=2026-10-01&to=2026-10-04");
  check("…and nothing outside it", !before.data.some((e) => /^Ev /.test(e.title)));
  const byProject = await call("GET", `/api/events?from=2026-10-01&to=2026-10-31&project_id=${projectId}`);
  check("events filter by project", byProject.data.length >= 1 && byProject.data.every((e) => e.project_id === projectId));
  const moved = await call("PUT", `/api/events/${workshop.data.id}`, { body: { start_date: "2026-10-12" } });
  check("moving only the start keeps the length (dragging on the calendar)", moved.status === 200 && moved.data.start_date === "2026-10-12" && moved.data.end_date === "2026-10-14");
  const broken = await call("PUT", `/api/events/${workshop.data.id}`, { body: { end_date: "2026-10-01" } });
  check("an edit is validated as a whole", broken.status === 400);
  const toTimed = await call("PUT", `/api/events/${holiday.data.id}`, { body: { all_day: false, start_time: "09:00" } });
  const backAllDay = await call("PUT", `/api/events/${holiday.data.id}`, { body: { all_day: true } });
  check("all-day and timed can be switched; all-day drops the times", toTimed.data.start_time === "09:00" && backAllDay.data.start_time === null && backAllDay.data.all_day === 1);
  check("an unknown event -> 404", (await call("GET", "/api/events/999999")).status === 404);
  for (const e of [holiday, workshop, review]) await call("DELETE", `/api/events/${e.data.id}`);
  check("events can be deleted", (await call("GET", "/api/events?from=2026-10-01&to=2026-10-31")).data.filter((e) => /^Ev /.test(e.title)).length === 0);
}

console.log("several assignees");
{
  const mkE = async (first) => (await call("POST", "/api/employees", { body: { first_name: first, last_name: "Multi", email: `${first.toLowerCase()}.multi@example.com` } })).data;
  const ana = await mkE("Ana"), ben = await mkE("Ben"), cy = await mkE("Cy");
  const made = await call("POST", "/api/tasks", { body: { title: "Multi shared task", assignee_ids: [ana.id, ben.id] } });
  check("a task takes several assignees; the first leads", made.status === 201 && made.data.employee_id === ana.id && made.data.assignees.map((p) => p.name).join() === "Ana Multi,Ben Multi" && made.data.assignee_names === "Ana Multi, Ben Multi", JSON.stringify(made.raw).slice(0, 200));
  const mid = made.data.id;
  const legacy = await call("POST", "/api/tasks", { body: { title: "Multi legacy task", employee_id: cy.id } });
  check("the older single employee_id still works and becomes the lead", legacy.status === 201 && legacy.data.employee_id === cy.id && legacy.data.assignees.length === 1);
  const swap = await call("PUT", `/api/tasks/${mid}`, { body: { employee_id: cy.id } });
  check("setting employee_id swaps the lead and keeps the others", swap.data.assignees.map((p) => p.id).join() === [cy.id, ben.id].join() && swap.data.employee_id === cy.id);
  const listed = await call("PUT", `/api/tasks/${mid}`, { body: { assignee_ids: [ben.id, ana.id, cy.id, ana.id] } });
  check("an explicit list sets the order (duplicates dropped)", listed.data.assignees.map((p) => p.id).join() === [ben.id, ana.id, cy.id].join() && listed.data.employee_id === ben.id);
  const untouched = await call("PUT", `/api/tasks/${mid}`, { body: { priority: "high" } });
  check("other edits leave the assignees alone", untouched.data.assignees.length === 3);
  const foreign = await call("PUT", `/api/tasks/${mid}`, { body: { assignee_ids: [999999] } });
  const tooMany = await call("PUT", `/api/tasks/${mid}`, { body: { assignee_ids: Array.from({ length: 13 }, (_, i) => i + 1) } });
  check("unknown employees and more than 12 people -> 400", foreign.status === 400 && tooMany.status === 400 && (await call("GET", `/api/tasks/${mid}`)).data.assignees.length === 3);
  const byCy = await call("GET", `/api/tasks?employee_id=${cy.id}`);
  check("filtering by a person finds tasks they co-own, not only the ones they lead", byCy.data.some((t) => t.id === mid) && byCy.data.some((t) => t.id === legacy.data.id));
  const emps = (await call("GET", "/api/employees")).data;
  check("employee task counts include co-assignments", emps.find((e) => e.id === ana.id).task_count === 1 && emps.find((e) => e.id === cy.id).task_count === 2 && emps.find((e) => e.id === cy.id).open_task_count === 2);
  const cyPage = await call("GET", `/api/employees/${cy.id}`);
  check("an employee's page lists every task they are on, with everybody", cyPage.data.tasks.length === 2 && cyPage.data.tasks.find((t) => t.id === mid).assignees.length === 3);
  const hist = (await call("GET", `/api/tasks/${mid}/history`)).data.filter((h) => h.field === "assignee");
  check("history names the people before and after", hist.length === 2 && hist[1].old_value === "Cy Multi, Ben Multi" && hist[1].new_value === "Ben Multi, Ana Multi, Cy Multi", JSON.stringify(hist.map((h) => [h.old_value, h.new_value])));
  const gone = await call("DELETE", `/api/employees/${ben.id}`);
  const afterGone = await call("GET", `/api/tasks/${mid}`);
  check("deleting the lead's employee record passes the lead to the next in line", gone.status === 200 && afterGone.data.employee_id === ana.id && afterGone.data.assignees.map((p) => p.id).join() === [ana.id, cy.id].join());
  const repeat = await call("PUT", `/api/tasks/${mid}`, { body: { repeat_rule: "weekly", due_date: "2026-09-14", status: "done", today: "2026-09-18" } });
  const next = await call("GET", `/api/tasks/${repeat.data.next_task?.id}`);
  check("a repeating task hands everybody on to the next one", next.status === 200 && next.data.assignees.map((p) => p.id).join() === [ana.id, cy.id].join() && next.data.employee_id === ana.id);
  const cleared = await call("PUT", `/api/tasks/${legacy.data.id}`, { body: { employee_id: null } });
  check("employee_id: null unassigns everyone", cleared.data.assignees.length === 0 && cleared.data.employee_id === null && cleared.data.assignee_names === null);
  for (const t of (await call("GET", "/api/tasks?q=Multi ")).data) await call("DELETE", `/api/tasks/${t.id}`);
  for (const e of [ana, cy]) await call("DELETE", `/api/employees/${e.id}`);
}

console.log("recycle bin");
{
  await call("DELETE", "/api/trash"); // start from an empty bin: earlier sections deleted plenty
  const proj = (await call("POST", "/api/projects", { body: { name: "Bin project", code: "BINP" } })).data;
  const emp = (await call("POST", "/api/employees", { body: { first_name: "Bin", last_name: "Person", email: "bin.person@example.com", project_ids: [proj.id] } })).data;
  const req = (await call("POST", "/api/requirements", { body: { project_id: proj.id, title: "Bin requirement" } })).data;
  const task = (await call("POST", "/api/tasks", { body: { title: "Bin task", project_id: proj.id, requirement_id: req.id, assignee_ids: [emp.id], tags: "bin", due_date: "2026-10-01", estimate_hours: 3.5, description: "multi\nline ✓ 'quoted'" } })).data;
  const follower = (await call("POST", "/api/tasks", { body: { title: "Bin follower", project_id: proj.id } })).data;
  await call("POST", `/api/tasks/${task.id}/checklist`, { body: { title: "one\ntwo" } });
  await call("POST", `/api/tasks/${task.id}/comments`, { body: { body: "a comment 🙂" } });
  await call("POST", `/api/tasks/${task.id}/time`, { body: { duration: "1h 15m", note: "worked" } });
  await call("POST", `/api/tasks/${follower.id}/dependencies`, { body: { depends_on_id: task.id } });
  const fdBin = new FormData();
  fdBin.append("files", new Blob(["hello bin"], { type: "text/plain" }), "bin-note.txt");
  const up = await call("POST", `/api/tasks/${task.id}/attachments`, { form: fdBin });
  const fileId = up.data[0].id;
  const shape = async () => { const t = (await call("GET", `/api/tasks/${task.id}`)).data; const h = (await call("GET", `/api/tasks/${task.id}/history`)).data.filter((x) => x.action !== "restored"); const c = (await call("GET", `/api/tasks/${task.id}/comments`)).data; const tm = (await call("GET", `/api/tasks/${task.id}/time`)).data; return JSON.stringify([t.title, t.description, t.project_id, t.requirement_id, t.employee_id, t.tags, t.due_date, t.estimate_hours, t.created_at, t.assignee_names, t.checklist.map((k) => [k.id, k.title, k.done]), t.attachments.map((a) => [a.id, a.original_name, a.stored_name]), c.map((x) => [x.id, x.body, x.created_at]), tm.entries.map((e) => [e.id, e.minutes, e.note, e.spent_on]), h.map((x) => [x.id, x.action, x.created_at])]); };
  const before = await shape();
  const del = await call("DELETE", `/api/tasks/${task.id}`);
  check("deleting a task answers with its bin entry and the task is gone", del.status === 200 && Number.isInteger(del.data.trash_id) && (await call("GET", `/api/tasks/${task.id}`)).status === 404);
  const bin = await call("GET", "/api/trash");
  const entry = bin.data.items.find((i) => i.id === del.data.trash_id);
  check("the bin lists it with who, when, what came along and the days left", bin.status === 200 && entry?.label === "Task" && entry.title === "Bin task" && entry.deleted_by_name === "Admin User" && entry.file_count === 1 && entry.days_left >= 29 && /related items/.test(entry.detail) && !("snapshot" in entry), JSON.stringify(entry));
  check("its file is still served from the bin's point of view: nothing was removed from disk yet", (await call("GET", `/api/tasks/${follower.id}/dependencies`)).data.blocked_by.length === 0);
  const back = await call("POST", `/api/trash/${del.data.trash_id}/restore`);
  check("restore puts it back under the same id", back.status === 200 && back.data.id === task.id && back.data.entity === "task");
  check("…with every field, checklist item, comment, time entry, file and history row exactly as before", (await shape()) === before);
  check("…its file downloads again", (await call("GET", `/api/attachments/task/${fileId}`)).status === 200);
  check("…the task that waited for it waits again, and history says it was restored", (await call("GET", `/api/tasks/${follower.id}/dependencies`)).data.blocked_by.some((t) => t.id === task.id) && (await call("GET", `/api/tasks/${task.id}/history`)).data.at(-1).action === "restored");
  check("restoring twice -> 404", (await call("POST", `/api/trash/${del.data.trash_id}/restore`)).status === 404);
  const pDel = await call("DELETE", `/api/projects/${proj.id}`);
  const orphan = (await call("GET", `/api/tasks/${task.id}`)).data;
  check("deleting a project takes its requirements along; tasks stay and only lose the links", pDel.status === 200 && orphan.project_id === null && orphan.requirement_id === null && (await call("GET", `/api/requirements/${req.id}`)).status === 404);
  await call("POST", `/api/trash/${pDel.data.trash_id}/restore`);
  const relinked = (await call("GET", `/api/tasks/${task.id}`)).data;
  check("restoring the project brings back requirements, the team and the tasks' links", relinked.project_id === proj.id && relinked.requirement_id === req.id && (await call("GET", `/api/projects/${proj.id}`)).data.employees.some((e) => e.id === emp.id) && (await call("GET", `/api/requirements/${req.id}`)).status === 200);
  const rDel = await call("DELETE", `/api/requirements/${req.id}`);
  const pDel2 = await call("DELETE", `/api/projects/${proj.id}`);
  const tooEarly = await call("POST", `/api/trash/${rDel.data.trash_id}/restore`);
  check("a requirement cannot come back before its project (409 names the project)", tooEarly.status === 409 && /Bin project/.test(tooEarly.error));
  const squatter = await call("POST", "/api/projects", { body: { name: "Squatter", code: "BINP" } });
  const clash = await call("POST", `/api/trash/${pDel2.data.trash_id}/restore`);
  check("a project whose code was taken meanwhile -> 409 with advice", clash.status === 409 && /same code/.test(clash.error));
  await call("DELETE", `/api/projects/${squatter.data.id}`);
  check("after removing the clash both restore, in order", (await call("POST", `/api/trash/${pDel2.data.trash_id}/restore`)).status === 200 && (await call("POST", `/api/trash/${rDel.data.trash_id}/restore`)).status === 200 && (await call("GET", `/api/tasks/${task.id}`)).data.requirement_id === req.id);
  const eDel = await call("DELETE", `/api/employees/${emp.id}`);
  check("deleting an employee takes them off their tasks", (await call("GET", `/api/tasks/${task.id}`)).data.assignees.length === 0);
  await call("POST", `/api/trash/${eDel.data.trash_id}/restore`);
  const reassigned = (await call("GET", `/api/tasks/${task.id}`)).data;
  check("restoring them puts them back on their tasks (as lead) and projects", reassigned.employee_id === emp.id && reassigned.assignees.length === 1 && (await call("GET", `/api/projects/${proj.id}`)).data.employees.length === 1);
  const evt = (await call("POST", "/api/events", { body: { title: "Bin event", start_date: "2026-10-02", all_day: false, start_time: "09:30" } })).data;
  const evDel = await call("DELETE", `/api/events/${evt.id}`);
  await call("POST", `/api/trash/${evDel.data.trash_id}/restore`);
  check("events go through the bin too, times intact", (await call("GET", `/api/events/${evt.id}`)).data.start_time === "09:30");
  await call("DELETE", `/api/attachments/task/${fileId}`);
  const fileEntry = (await call("GET", "/api/trash")).data.items.find((i) => i.label === "File");
  check("a single file goes to the bin, named after the record it hung on", fileEntry?.title === "bin-note.txt" && fileEntry.detail === "Bin task" && (await call("GET", `/api/attachments/task/${fileId}`)).status === 404);
  await call("POST", `/api/trash/${fileEntry.id}/restore`);
  check("…and comes back", (await call("GET", `/api/attachments/task/${fileId}`)).status === 200 && (await call("GET", `/api/tasks/${task.id}`)).data.attachments.length === 1);
  const gone = await call("DELETE", `/api/tasks/${task.id}`);
  const forever = await call("DELETE", `/api/trash/${gone.data.trash_id}`);
  check("delete for good removes the entry", forever.status === 200 && forever.data.purged === 1 && (await call("POST", `/api/trash/${gone.data.trash_id}/restore`)).status === 404);
  for (const path of [`/api/tasks/${follower.id}`, `/api/events/${evt.id}`, `/api/employees/${emp.id}`, `/api/projects/${proj.id}`]) await call("DELETE", path);
  const emptied = await call("DELETE", "/api/trash");
  check("emptying the bin clears everything in it", emptied.status === 200 && emptied.data.purged >= 4 && (await call("GET", "/api/trash")).data.items.length === 0);
  const cronBin = await call("GET", `/api/cron/reminders?key=${process.env.CRON_SECRET || "local-dev-secret"}`, { noAuth: true });
  check("the scheduler purges expired entries", typeof cronBin.data.trash_purged === "number");
}

console.log("push + reminder scheduler");
{
  const key = await call("GET", "/api/push/key");
  check("push public key exposed", key.status === 200 && typeof key.data.publicKey === "string" && key.data.publicKey.length > 20);
  const bad = await call("POST", "/api/push/subscribe", { body: { endpoint: "http://not-https", keys: {} } });
  check("invalid subscription -> 400", bad.status === 400);
  const ep = `https://push.example.test/sub/${Date.now()}`;
  const sub = await call("POST", "/api/push/subscribe", { body: { endpoint: ep, keys: { p256dh: "BPl-fake-p256dh", auth: "fake-auth" } } });
  check("subscribe 200", sub.status === 200 && sub.data.enabled === true);
  const again = await call("POST", "/api/push/subscribe", { body: { endpoint: ep, keys: { p256dh: "BPl-fake-2", auth: "fake-2" } } });
  check("re-subscribe upserts", again.status === 200);
  const test = await call("POST", "/api/push/test", { body: {} });
  check("test push attempted (unreachable endpoint fails gracefully, subscription kept)", test.status === 200 && test.data.total === 1 && test.data.sent === 0);
  const un = await call("POST", "/api/push/unsubscribe", { body: { endpoint: ep } });
  check("unsubscribe 200", un.status === 200);
  const none = await call("POST", "/api/push/test", { body: {} });
  check("test push with no device -> 400", none.status === 400);
  const noauth = await call("GET", "/api/cron/reminders", { noAuth: true });
  check("scheduler without key -> 401", noauth.status === 401);
  const cron = await call("GET", `/api/cron/reminders?key=${process.env.CRON_SECRET || "local-dev-secret"}`, { noAuth: true });
  check("scheduler with key runs over every profile", cron.status === 200 && cron.data.profiles >= 1 && typeof cron.data.created === "number");
  check("the scheduler also looks after the daily backup", typeof cron.data.backup?.ran === "boolean" && (cron.data.backup.ran === false || cron.data.backup.ok === true), JSON.stringify(cron.data.backup));
}

console.log("backups (admin only)");
{
  const anon = await call("GET", "/api/backups", { noAuth: true });
  check("anonymous -> 401", anon.status === 401);
  const made = await call("POST", "/api/backups", { body: {} });
  check("back up now -> 201 with a verified archive", made.status === 201 && made.data.result.ok === true && /^db-\d{8}-\d{6}-manual\.sql\.gz$/.test(made.data.result.file) && made.data.result.tables >= 30, JSON.stringify(made.raw).slice(0, 200));
  const name = made.data?.result?.file;
  const list = await call("GET", "/api/backups");
  check("the overview lists it, reports health ok and the retention policy", list.status === 200 && list.data.health === "ok" && list.data.backups.some((b) => b.name === name && b.reason === "manual" && b.bytes > 1000) && list.data.policy.daily >= 1);
  check("uploaded files are mirrored", typeof list.data.status.files?.total === "number" && ["link", "copy"].includes(list.data.status.files.mode));
  const dl = await call("GET", `/api/backups/${name}`);
  const bytes = new Uint8Array(dl.raw);
  check("an archive downloads as gzip", dl.status === 200 && bytes[0] === 0x1f && bytes[1] === 0x8b && /attachment/.test(dl.headers.get("content-disposition") || ""));
  const sql = (await import("node:zlib")).gunzipSync(Buffer.from(dl.raw)).toString("utf8");
  check("the dump holds the tables, ends cleanly and carries no session rows", /CREATE TABLE `tasks`/.test(sql) && /CREATE TABLE `sessions`/.test(sql) && /Dump completed/.test(sql) && !/INSERT INTO `sessions`/.test(sql));
  const zip = await call("GET", "/api/backups/archive");
  const zb = new Uint8Array(zip.raw);
  check("download everything is a ZIP with the database archive and restore notes", zip.status === 200 && zb[0] === 0x50 && zb[1] === 0x4b && Buffer.from(zip.raw).includes(`database/${name}`) && Buffer.from(zip.raw).includes("README.txt"));
  const trav = await call("GET", "/api/backups/..%2F..%2F.env.local");
  check("anything that is not a backup name -> 400", trav.status === 400);
  const ghost = await call("GET", "/api/backups/db-20200101-000000-auto.sql.gz");
  check("unknown archive -> 404", ghost.status === 404);
  const health = await call("GET", "/api/health", { noAuth: true });
  check("health reports the backup state", health.data.backup?.state === "ok" && typeof health.data.backup.lastOkAt === "string");
  const gone = await call("DELETE", `/api/backups/${name}`);
  check("an archive can be deleted", gone.status === 200 && !gone.data.backups.some((b) => b.name === name));
}

console.log("report pages");
{
  const rec = await call("GET", `/api/tasks/${taskId}`);
  const page = await fetch(`${BASE}/report/tasks/${taskId}`, { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
  check("record report renders for a signed-in user", rec.status === 200 && page.status === 200 && (await page.text()).includes("report"));
  const list = await fetch(`${BASE}/report/tasks`, { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
  check("module report renders", list.status === 200);
  const anon = await fetch(`${BASE}/report/tasks/${taskId}`, { redirect: "manual" });
  check("report requires a session", anon.status === 307 || anon.status === 302);
  const sheet = await fetch(`${BASE}/report/time?from=2031-03-01&to=2031-03-31&group=task`, { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
  check("the printable time report renders", sheet.status === 200 && (await sheet.text()).includes("report-root"));
  const sheetAnon = await fetch(`${BASE}/report/time`, { redirect: "manual" });
  check("…and requires a session", sheetAnon.status === 307 || sheetAnon.status === 302);
  const bad = await fetch(`${BASE}/report/nope/1`, { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
  check("unknown module -> 404", bad.status === 404);
}

console.log("users (admin only)");
let userId;
const adminJar = { ...jar };
{
  const list = await call("GET", "/api/users");
  check("GET /api/users as admin", list.status === 200 && list.data.some((u) => u.role === "admin"));
  const bad = await call("POST", "/api/users", { body: { name: "X", email: `x.${suffix.toLowerCase()}@example.com`, password: "123" } });
  check("short password -> 400", bad.status === 400);
  const r = await call("POST", "/api/users", { body: { name: "Smoke User", email: `smoke.user.${suffix.toLowerCase()}@example.com`, password: "smoke123", role: "user" } });
  check("POST /api/users 201", r.status === 201 && r.data?.role === "user", JSON.stringify(r.raw));
  userId = r.data?.id;
  const upd = await call("PUT", `/api/users/${userId}`, { body: { name: "Smoke User 2", avatar_color: "#10b981" } });
  check("PUT /api/users/:id", upd.data?.name === "Smoke User 2");
  check("user rows carry sign-in method fields", upd.data?.passkey_count === 0 && !upd.data?.has_google);
  const rmPk = await call("DELETE", `/api/users/${userId}/passkeys`);
  check("admin removes passkeys (none yet) -> 200", rmPk.status === 200 && rmPk.data?.passkey_count === 0);
  const rmG = await call("DELETE", `/api/users/${userId}/google`);
  check("admin unlinks Google (not linked) -> 200", rmG.status === 200 && !rmG.data?.has_google);
  const nf = await call("DELETE", "/api/users/999999/passkeys");
  check("remove passkeys of an unknown user -> 404", nf.status === 404);
  const rmTotp = await call("DELETE", `/api/users/${userId}/totp`);
  check("admin resets 2FA (not on) -> 200", rmTotp.status === 200 && !rmTotp.data?.has_totp);
  const kickAll = await call("DELETE", `/api/users/${userId}/sessions`);
  check("admin signs an account out everywhere -> 200", kickAll.status === 200 && kickAll.data?.active_sessions === 0);
  // sign in as the new user in a separate cookie jar
  jar = {};
  const login = await call("POST", "/api/auth/login", { body: { email: `smoke.user.${suffix.toLowerCase()}@example.com`, password: "smoke123" }, noAuth: true });
  check("new user can log in", login.status === 200 && Boolean(jar.ap_session));
  const forbidden = await call("GET", "/api/users");
  check("role user -> 403 on /api/users", forbidden.status === 403);
  const noAdmin = await call("DELETE", `/api/users/${userId}/passkeys`);
  check("role user -> 403 on the admin passkey reset", noAdmin.status === 403);
  const projectsOk = await call("GET", "/api/projects");
  check("role user can read projects", projectsOk.status === 200);

  // two-factor authentication, end to end, as the new user (codes computed from the secret)
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  const totp = await import(new URL("../src/lib/totp.js", import.meta.url));
  const codeAt = (secret, offset) => totp.totpCode(secret, totp.currentStep() + offset);
  const st0 = await call("GET", "/api/auth/totp");
  check("2FA is off by default", st0.status === 200 && st0.data?.enabled === false);
  const setup = await call("POST", "/api/auth/totp/setup");
  check("2FA setup returns secret, otpauth URI and QR", setup.status === 200 && /^[A-Z2-7]{32}$/.test(setup.data?.secret || "") && String(setup.data?.otpauth).startsWith("otpauth://totp/") && String(setup.data?.qr).startsWith("data:image/png"), JSON.stringify(setup.raw).slice(0, 120));
  const secret = setup.data?.secret ?? "";
  const badEnable = await call("POST", "/api/auth/totp/enable", { body: { code: "000000" } });
  check("2FA enable rejects a wrong code", badEnable.status === 400);
  const en = await call("POST", "/api/auth/totp/enable", { body: { code: codeAt(secret, -1) } });
  check("2FA on with 10 recovery codes", en.status === 200 && en.data?.enabled === true && en.data?.recovery_codes?.length === 10, JSON.stringify(en.raw).slice(0, 200));
  const recovery = en.data?.recovery_codes ?? [];
  const meMfa = await call("GET", "/api/auth/me");
  check("session reports has_totp", meMfa.data?.has_totp === true);
  jar = {};
  const step1 = await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke123" } });
  check("password login with 2FA on -> mfa_required and no session", step1.status === 200 && step1.data?.mfa_required === true && !jar.ap_session && Boolean(jar.ap_mfa));
  const wrong = await call("POST", "/api/auth/totp/verify", { body: { code: "000000" } });
  check("wrong second factor -> 400 with attempts left", wrong.status === 400 && /attempt/.test(wrong.error || ""), JSON.stringify(wrong.raw));
  const good = await call("POST", "/api/auth/totp/verify", { body: { code: codeAt(secret, 0), trust: true } });
  check("correct code signs in and remembers the browser", good.status === 200 && Boolean(jar.ap_session) && Boolean(jar.ap_trust) && !jar.ap_mfa, JSON.stringify(good.raw));
  const st1 = await call("GET", "/api/auth/totp");
  check("status: 10 codes left, 1 trusted browser", st1.data?.recovery_codes_left === 10 && st1.data?.trusted_devices === 1);
  await call("POST", "/api/auth/logout");
  const trusted = await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke123" } });
  check("trusted browser skips the second factor", trusted.status === 200 && !trusted.data?.mfa_required && Boolean(jar.ap_session));
  const regenBad = await call("POST", "/api/auth/totp/recovery-codes", { body: { password: "nope" } });
  check("new recovery codes need the password", regenBad.status === 400);
  const regen = await call("POST", "/api/auth/totp/recovery-codes", { body: { password: "smoke123" } });
  check("new recovery codes issued", regen.status === 200 && regen.data?.recovery_codes?.length === 10 && !recovery.includes(regen.data.recovery_codes[0]));
  const forget = await call("DELETE", "/api/auth/totp/trusted");
  check("forget trusted browsers", forget.status === 200 && forget.data?.trusted_devices === 0);
  await call("POST", "/api/auth/logout");
  jar = {};
  const step2 = await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke123" } });
  check("after forgetting, the password login asks for a code again", step2.data?.mfa_required === true);
  const oldRecovery = await call("POST", "/api/auth/totp/verify", { body: { code: recovery[0] } });
  check("old recovery code no longer works", oldRecovery.status === 400);
  const viaRecovery = await call("POST", "/api/auth/totp/verify", { body: { code: regen.data?.recovery_codes?.[0] } });
  check("recovery code signs in", viaRecovery.status === 200 && Boolean(jar.ap_session), JSON.stringify(viaRecovery.raw));
  const st2 = await call("GET", "/api/auth/totp");
  check("used recovery code is consumed", st2.data?.recovery_codes_left === 9);
  const disBad = await call("POST", "/api/auth/totp/disable", { body: { password: "smoke123", code: regen.data?.recovery_codes?.[0] } });
  check("turning off refuses a used recovery code", disBad.status === 400);
  const dis = await call("POST", "/api/auth/totp/disable", { body: { password: "smoke123", code: regen.data?.recovery_codes?.[1] } });
  check("2FA off with password + recovery code", dis.status === 200 && dis.data?.enabled === false, JSON.stringify(dis.raw));
  jar = {};
  const plain = await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke123" } });
  check("password login is direct again", plain.status === 200 && !plain.data?.mfa_required && Boolean(jar.ap_session));

  console.log("workspace isolation");
  check("user does not see the admin's project", !projectsOk.data.some((p) => p.id === projectId));
  const hidden = await call("GET", `/api/projects/${projectId}`);
  check("admin's project is 404 for the user", hidden.status === 404);
  const hiddenTask = await call("GET", `/api/tasks/${taskId}`);
  check("admin's task is 404 for the user", hiddenTask.status === 404);
  const hiddenReq = await call("GET", `/api/requirements/${reqIds[0]}`);
  check("admin's requirement is 404 for the user", hiddenReq.status === 404);
  const own = await call("POST", "/api/projects", { body: { name: "User Project", code: `SMK-${suffix}`, status: "active" } });
  check("same project code allowed in another workspace", own.status === 201, JSON.stringify(own.raw));
  const ownId = own.data?.id;
  const crossRef = await call("POST", "/api/tasks", { body: { title: "cross", project_id: projectId } });
  check("task cannot reference another workspace's project", crossRef.status === 400);
  const empty = await call("GET", "/api/employees");
  check("user starts with no employees", empty.data.length === 0);
  const stats = await call("GET", "/api/stats");
  check("stats are per workspace", stats.data.counts.projects === 1 && stats.data.counts.tasks === 0);
  {
    const userJar = { ...jar };
    jar = { ...adminJar };
    const sw = await call("PUT", "/api/auth/workspace", { body: { user_id: userId } });
    check("admin switches into the user's workspace", sw.status === 200 && sw.data?.workspace?.id === userId, JSON.stringify(sw.raw));
    const me = await call("GET", "/api/auth/me");
    check("me reports owner_id = user", me.data?.owner_id === userId && me.data?.workspace?.id === userId);
    const wsProjects = await call("GET", "/api/projects");
    check("admin sees the user's projects there (not their own)", wsProjects.data.some((p) => p.id === ownId) && !wsProjects.data.some((p) => p.id === projectId));
    const back = await call("PUT", "/api/auth/workspace", { body: { user_id: null } });
    check("admin returns to own workspace", back.status === 200 && back.data?.workspace === null && !jar.ap_workspace);
    const mine = await call("GET", "/api/projects");
    check("admin's own projects are back", mine.data.some((p) => p.id === projectId));
    jar = userJar;
  }
  console.log("sharing a profile");
  {
    // `jar` is the plain user here; the admin owns the profile that gets shared
    const asAdmin = async (fn) => { const keep = jar; jar = { ...adminJar }; try { return await fn(); } finally { jar = keep; } };
    const adminMe = await asAdmin(() => call("GET", "/api/auth/me"));
    const pid = (await asAdmin(() => call("GET", "/api/profiles"))).data.items.find((p) => p.is_default).id;
    const myEmail = (await call("GET", "/api/auth/me")).data.email;
    // (where an administrator allows invitations by email the address would get a link instead: see the email section)
    const mailInvites = (await call("GET", "/api/auth/methods")).data.mail?.invites;
    if (!mailInvites) {
      const ghost = await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { email: "nobody@nowhere.test" } }));
      check("inviting an email without an account -> 404", ghost.status === 404);
    }
    const badRole = await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { user_id: userId, role: "boss" } }));
    check("unknown role -> 400", badRole.status === 400);
    const self = await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { user_id: adminMe.data.id } }));
    check("the owner cannot be invited -> 409", self.status === 409);
    const inv = await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { email: myEmail.toUpperCase(), role: "viewer" } }));
    check("owner invites an account by email (any letter case) -> 201, status invited", inv.status === 201 && inv.data.members.some((m) => m.id === userId && m.status === "invited" && m.role === "viewer") && inv.data.members[0].role === "owner", JSON.stringify(inv.raw).slice(0, 200));
    const again = await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { user_id: userId } }));
    check("inviting twice -> 409", again.status === 409);
    const early = await call("POST", `/api/profiles/${pid}/activate`);
    check("an invitation alone gives no access", early.status === 404);
    const mine = await call("GET", "/api/profiles");
    check("the invitee sees the invitation, with owner and role", mine.data.invites.length === 1 && mine.data.invites[0].id === pid && mine.data.invites[0].role === "viewer" && mine.data.invites[0].owner.id === adminMe.data.id && mine.data.shared.length === 0);
    check("…and a badge count", (await call("GET", "/api/stats")).data.counts.profile_invites === 1);
    const nInv = await call("GET", "/api/notifications?unread=1&limit=20");
    check("…and a notification", nInv.data.items.some((n) => n.type === "profile_invite" && n.entity_id === pid));
    const acc = await call("PUT", `/api/profiles/${pid}/membership`, { body: { accept: true } });
    check("accepting joins the profile", acc.status === 200 && acc.data.status === "active");
    const act = await call("POST", `/api/profiles/${pid}/activate`);
    const me = await call("GET", "/api/auth/me");
    check("switching in: access viewer, records belong to the owner, my own profiles stay mine", act.status === 200 && me.data.access === "viewer" && me.data.owner_id === adminMe.data.id && me.data.home_id === userId && me.data.shared?.owner?.id === adminMe.data.id && me.data.profiles.every((p) => p.user_id === userId) && me.data.shared_profiles.length === 1);
    const seen = await call("GET", "/api/projects");
    check("a viewer reads the owner's projects", seen.status === 200 && seen.data.some((p) => p.id === projectId));
    const vCreate = await call("POST", "/api/tasks", { body: { title: "viewer tries" } });
    const vEdit = await call("PUT", `/api/tasks/${taskId}`, { body: { title: "nope" } });
    const vDel = await call("DELETE", `/api/tasks/${taskId}`);
    const vOrder = await call("PUT", "/api/tasks/reorder", { body: { ids: [] } });
    check("a viewer cannot create, edit, reorder or delete (403)", [vCreate, vEdit, vDel, vOrder].every((r) => r.status === 403) && /view-only/.test(vCreate.error), [vCreate, vEdit, vDel, vOrder].map((r) => r.status).join());
    const vComments = await call("GET", `/api/tasks/${taskId}/comments`);
    const vComment = await call("POST", `/api/tasks/${taskId}/comments`, { body: { body: "viewer speaks" } });
    const vHistory = await call("GET", `/api/tasks/${taskId}/history`);
    check("a viewer reads comments and history but cannot comment (403)", vComments.status === 200 && vHistory.status === 200 && vComment.status === 403);
    const vDep = await call("POST", `/api/tasks/${taskId}/dependencies`, { body: { depends_on_id: taskId } });
    check("a viewer reads dependencies but cannot change them (403)", vDep.status === 403 && (await call("GET", `/api/tasks/${taskId}/dependencies`)).status === 200 && (await call("GET", "/api/tasks/dependencies")).status === 200);
    const vTime = await call("POST", `/api/tasks/${taskId}/time`, { body: { duration: "1h" } });
    check("a viewer sees logged time but cannot log any (403)", vTime.status === 403 && (await call("GET", `/api/tasks/${taskId}/time`)).status === 200);
    const vEvent = await call("POST", "/api/events", { body: { title: "viewer event", start_date: "2026-10-05" } });
    check("a viewer sees the calendar's events but cannot add one (403)", vEvent.status === 403 && (await call("GET", "/api/events?from=2026-10-01&to=2026-10-31")).status === 200);
    const vInfo = await call("GET", "/api/info");
    const vInfoSearch = await call("GET", "/api/info/search?q=a");
    const vSearch = await call("GET", "/api/search?q=a");
    check("the Info vault is never shared (403, and absent from search and counts)", vInfo.status === 403 && vInfoSearch.status === 403 && vSearch.status === 200 && vSearch.data.info.length === 0 && (await call("GET", "/api/stats")).data.counts.info === 0);
    const hijack = await call("PUT", `/api/profiles/${pid}`, { body: { name: "hijacked" } });
    const hijackDel = await call("DELETE", `/api/profiles/${pid}`);
    check("a member cannot rename or delete the owner's profile (404)", hijack.status === 404 && hijackDel.status === 404);
    const vInvite = await call("POST", `/api/profiles/${pid}/members`, { body: { user_id: 1 } });
    const vList = await call("GET", `/api/profiles/${pid}/members`);
    check("a viewer sees the member list but cannot invite", vInvite.status === 403 && vList.status === 200 && vList.data.can_manage === false && vList.data.members.length === 2);
    const selfRole = await call("PUT", `/api/profiles/${pid}/members/${userId}`, { body: { role: "manager" } });
    check("nobody promotes themselves", selfRole.status === 403 || selfRole.status === 400);
    const toEditor = await asAdmin(() => call("PUT", `/api/profiles/${pid}/members/${userId}`, { body: { role: "editor" } }));
    check("owner changes the role", toEditor.status === 200 && toEditor.data.members.find((m) => m.id === userId).role === "editor");
    const eCreate = await call("POST", "/api/tasks", { body: { title: "Made by a shared editor", project_id: projectId } });
    const ownerSees = await asAdmin(() => call("GET", `/api/tasks/${eCreate.data?.id}`));
    check("an editor creates inside the owner's profile", eCreate.status === 201 && ownerSees.status === 200 && ownerSees.data.title === "Made by a shared editor");
    const eEvent = await call("POST", "/api/events", { body: { title: "Editor's event", start_date: "2026-10-06" } });
    const eEventDel = await call("DELETE", `/api/events/${eEvent.data?.id}`);
    check("an editor adds events in the shared profile but cannot delete them (403)", eEvent.status === 201 && eEventDel.status === 403);
    await asAdmin(() => call("DELETE", `/api/events/${eEvent.data.id}`));
    check("the recycle bin is closed to editors (403)", (await call("GET", "/api/trash")).status === 403);
    const eEdit = await call("PUT", `/api/tasks/${eCreate.data.id}`, { body: { status: "in_progress" } });
    const eDel = await call("DELETE", `/api/tasks/${eCreate.data.id}`);
    check("an editor edits but cannot delete a record (403)", eEdit.status === 200 && eDel.status === 403 && /owner or a manager/.test(eDel.error));
    const nOwner = await asAdmin(() => call("GET", "/api/notifications?limit=30"));
    check("the owner hears about what a member did", nOwner.data.items.some((n) => n.type === "task_created" && n.actor_id === userId && /Made by a shared editor/.test(n.title)));
    await asAdmin(() => call("PUT", `/api/profiles/${pid}/members/${userId}`, { body: { role: "manager" } }));
    const mGrant = await call("POST", `/api/profiles/${pid}/members`, { body: { email: "nobody@nowhere.test", role: "manager" } });
    check("a manager cannot hand out the manager role (403)", mGrant.status === 403);
    const mList = await call("GET", `/api/profiles/${pid}/members`);
    const mCand = await call("GET", `/api/profiles/${pid}/candidates`);
    check("a manager may manage members and list candidates", mList.data.can_manage === true && mCand.status === 200 && Array.isArray(mCand.data));
    const mDel = await call("DELETE", `/api/tasks/${eCreate.data.id}`);
    const mBin = await call("GET", "/api/trash");
    check("a manager's delete lands in the shared profile's bin, which a manager may open and restore from", mDel.status === 200 && mBin.status === 200 && mBin.data.items.some((i) => i.id === mDel.data.trash_id) && (await call("POST", `/api/trash/${mDel.data.trash_id}/restore`)).status === 200 && (await call("DELETE", `/api/tasks/${eCreate.data.id}`)).status === 200);
    const mInfo = await call("GET", "/api/info");
    check("a manager deletes records, but the vault stays closed", mDel.status === 200 && mInfo.status === 403);
    // employee records linked to accounts: the member is currently a manager inside the owner's profile
    const poll = async (fn) => { for (let i = 0; i < 15; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)); } return null; };
    const emp = await asAdmin(() => call("POST", "/api/employees", { body: { first_name: "Linked", last_name: "Person", email: myEmail.toUpperCase() } }));
    check("an employee with a member's email links to that account by itself", emp.status === 201 && emp.data.linked_user_id === userId && emp.data.linked_user_name === "Smoke User 2", JSON.stringify(emp.raw).slice(0, 160));
    const stranger = await asAdmin(() => call("POST", "/api/employees", { body: { first_name: "No", last_name: "Body", email: "nobody.linked@example.com", linked_user_id: 999999 } }));
    check("linking someone who is not in the profile -> 400", stranger.status === 400);
    const unlink = await asAdmin(() => call("PUT", `/api/employees/${emp.data.id}`, { body: { linked_user_id: null } }));
    const relink = await asAdmin(() => call("PUT", `/api/employees/${emp.data.id}`, { body: { linked_user_id: userId } }));
    check("the link can be cleared and set by hand", unlink.data.linked_user_id === null && relink.data.linked_user_id === userId);
    const given = await asAdmin(() => call("POST", "/api/tasks", { body: { title: "For the linked person", employee_id: emp.data.id, project_id: projectId } }));
    const told = await poll(async () => (await call("GET", "/api/notifications?limit=30")).data.items.find((n) => n.type === "task_assigned" && n.entity_id === given.data.id));
    check("the assignee is told, in their own words, with the profile to open", told && /assigned you: For the linked person/.test(told.title) && told.profile_id === pid, JSON.stringify(told));
    const mineTasks = await call("GET", "/api/tasks/mine?open=1");
    check("My tasks lists it with profile, owner and my access", mineTasks.status === 200 && mineTasks.data.some((t) => t.id === given.data.id && t.profile_id === pid && t.profile_owner_name === adminMe.data.name && t.access === "manager"));
    check("…and counts it", (await call("GET", "/api/stats")).data.counts.mytasks >= 1);
    const someoneElse = (await asAdmin(() => call("GET", "/api/employees"))).data.find((e) => e.id !== emp.data.id)?.id;
    const coTask = await asAdmin(() => call("POST", "/api/tasks", { body: { title: "Co-assigned to the linked person", assignee_ids: [someoneElse, emp.data.id].filter(Boolean) } }));
    check("being one of several assignees is enough for My tasks and the bell", coTask.status === 201 && (await call("GET", "/api/tasks/mine?open=1")).data.some((t) => t.id === coTask.data.id) && Boolean(await poll(async () => (await call("GET", "/api/notifications?limit=30")).data.items.find((n) => n.type === "task_assigned" && n.entity_id === coTask.data.id))));
    await asAdmin(() => call("DELETE", `/api/tasks/${coTask.data.id}`));
    await asAdmin(() => call("PUT", `/api/tasks/${given.data.id}`, { body: { status: "review" } }));
    check("a status change reaches the assignee too", Boolean(await poll(async () => (await call("GET", "/api/notifications?limit=30")).data.items.find((n) => n.type === "task_status" && n.entity_id === given.data.id))));
    // comments and history on that task (the member is a manager here, the employee record is linked to them)
    const hist0 = await call("GET", `/api/tasks/${given.data.id}/history`);
    check("history records the creation and the status change with names", hist0.status === 200 && hist0.data[0].action === "created" && hist0.data[0].actor_name === adminMe.data.name && hist0.data.some((h) => h.field === "status" && h.old_value === "todo" && h.new_value === "review"), JSON.stringify(hist0.data).slice(0, 200));
    const emptyC = await call("POST", `/api/tasks/${given.data.id}/comments`, { body: { body: "   " } });
    const longC = await call("POST", `/api/tasks/${given.data.id}/comments`, { body: { body: "x".repeat(5001) } });
    check("empty and oversized comments -> 400", emptyC.status === 400 && longC.status === 400);
    const c1 = await asAdmin(() => call("POST", `/api/tasks/${given.data.id}/comments`, { body: { body: `Can you look at this @[Linked Person](employee:${emp.data.id}) today?` } }));
    check("the owner comments and tags the employee", c1.status === 201 && c1.data.items.length === 1 && c1.data.items[0].mine === true && c1.data.items[0].author_name === adminMe.data.name);
    const pinged = await poll(async () => (await call("GET", "/api/notifications?limit=30")).data.items.find((n) => n.type === "task_mention" && n.entity_id === given.data.id));
    check("the tagged person with a linked account is told, once", pinged && /mentioned you on For the linked person/.test(pinged.title) && pinged.profile_id === pid && !(await call("GET", "/api/notifications?limit=30")).data.items.some((n) => n.type === "task_comment" && n.entity_id === given.data.id), JSON.stringify(pinged));
    const c2 = await call("POST", `/api/tasks/${given.data.id}/comments`, { body: { body: "On it." } });
    check("a member replies; the list marks whose comment is whose", c2.status === 201 && c2.data.items.length === 2 && c2.data.items[0].mine === false && c2.data.items[1].mine === true);
    check("…and the owner hears about the reply", Boolean(await poll(async () => (await asAdmin(() => call("GET", "/api/notifications?limit=30"))).data.items.find((n) => n.type === "task_comment" && n.entity_id === given.data.id && n.actor_id === userId))));
    const notMine = await call("PUT", `/api/tasks/${given.data.id}/comments/${c1.data.created_id}`, { body: { body: "rewritten" } });
    check("only the author edits a comment (403)", notMine.status === 403);
    const edited = await call("PUT", `/api/tasks/${given.data.id}/comments/${c2.data.created_id}`, { body: { body: "On it, will finish tomorrow." } });
    check("the author edits; the comment is marked edited", edited.status === 200 && edited.data.find((c) => c.id === c2.data.created_id).edited_at !== null && /tomorrow/.test(edited.data.find((c) => c.id === c2.data.created_id).body));
    check("the task row carries the comment count", (await call("GET", `/api/tasks/${given.data.id}`)).data.comment_count === 2);
    const modDel = await call("DELETE", `/api/tasks/${given.data.id}/comments/${c1.data.created_id}`);
    check("a manager may delete somebody else's comment", modDel.status === 200 && modDel.data.length === 1);
    check("a comment on a task of another profile -> 404", (await call("POST", `/api/tasks/999999/comments`, { body: { body: "hi" } })).status === 404);
    await call("PUT", `/api/tasks/${given.data.id}`, { body: { status: "done" } });
    check("finished tasks leave the open list but stay in the full one", !(await call("GET", "/api/tasks/mine?open=1")).data.some((t) => t.id === given.data.id) && (await call("GET", "/api/tasks/mine")).data.some((t) => t.id === given.data.id));
    await asAdmin(() => call("PUT", `/api/tasks/${given.data.id}`, { body: { status: "todo" } }));
    const leave = await call("DELETE", `/api/profiles/${pid}/membership`);
    const home = await call("GET", "/api/auth/me");
    check("leaving returns me to my own profile", leave.status === 200 && home.data.access === "owner" && home.data.owner_id === userId && home.data.shared_profiles.length === 0);
    const afterLeave = await asAdmin(() => call("GET", `/api/employees/${emp.data.id}`));
    check("leaving unlinks my employee record and empties My tasks", afterLeave.data.linked_user_id === null && !(await call("GET", "/api/tasks/mine")).data.some((t) => t.id === given.data.id));
    await asAdmin(() => call("DELETE", `/api/tasks/${given.data.id}`));
    await asAdmin(() => call("DELETE", `/api/employees/${emp.data.id}`));
    check("…and the door is shut", (await call("POST", `/api/profiles/${pid}/activate`)).status === 404);
    // removal while the member is inside: the stale cookie must not keep the door open
    await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { user_id: userId, role: "editor" } }));
    const declineFirst = await call("PUT", `/api/profiles/${pid}/membership`, { body: { accept: false } });
    check("declining removes the invitation", declineFirst.status === 200 && declineFirst.data.status === "declined" && (await call("GET", "/api/profiles")).data.invites.length === 0);
    await asAdmin(() => call("POST", `/api/profiles/${pid}/members`, { body: { user_id: userId, role: "editor" } }));
    await call("PUT", `/api/profiles/${pid}/membership`, { body: { accept: true } });
    await call("POST", `/api/profiles/${pid}/activate`);
    const kicked = await asAdmin(() => call("DELETE", `/api/profiles/${pid}/members/${userId}`));
    const after = await call("GET", "/api/auth/me");
    const afterProjects = await call("GET", "/api/projects");
    check("a removed member falls back to their own profile at once", kicked.status === 200 && after.data.access === "owner" && after.data.owner_id === userId && !afterProjects.data.some((p) => p.id === projectId));
    delete jar.ap_profile;
    for (const n of (await call("GET", "/api/notifications?limit=50")).data.items.filter((x) => /^profile_/.test(x.type))) await call("DELETE", `/api/notifications/${n.id}`);
    await asAdmin(async () => { for (const n of (await call("GET", "/api/notifications?limit=50")).data.items.filter((x) => /^profile_/.test(x.type) || (x.actor_id === userId && /shared editor|linked person/i.test(x.title)))) await call("DELETE", `/api/notifications/${n.id}`); });
  }
  const notUser = await call("PUT", "/api/auth/workspace", { body: { user_id: 1 } });
  const bgAsUser = await call("PUT", "/api/settings/backgrounds", { body: { enabled: ["none"], default: "none" } });
  check("role user cannot change background settings (403)", bgAsUser.status === 403);
  const backupsAsUser = await call("GET", "/api/backups");
  const backupRunAsUser = await call("POST", "/api/backups", { body: {} });
  check("role user cannot see or run backups (403)", backupsAsUser.status === 403 && backupRunAsUser.status === 403);
  check("role user cannot switch workspace", notUser.status === 403);

  const note = await call("POST", "/api/notes", { body: { module: "tasks", title: "mine" } });
  const adminSees = await (async () => { const c = { ...jar }; jar = { ...adminJar }; const r = await call("GET", "/api/notes?module=tasks"); jar = c; return r; })();
  check("notes are private per user", note.status === 201 && !adminSees.data.some((x) => x.id === note.data.id));
  await call("DELETE", `/api/notes/${note.data.id}`);
  const pw = await call("PUT", "/api/auth/password", { body: { current_password: "smoke123", new_password: "smoke456" } });
  check("change own password", pw.status === 200);
  const logout = await call("POST", "/api/auth/logout");
  check("logout 200", logout.status === 200);
  jar = {};
  const after = await call("GET", "/api/auth/me", { noAuth: true });
  check("me after logout -> 401", after.status === 401);
  jar = { ...adminJar };
  const self = await call("DELETE", `/api/users/${(await call("GET", "/api/auth/me")).data.id}`);
  check("cannot delete own account", self.status === 400);
}

let chatPhotoId;
console.log("chat (friends by code, one-to-one messages)");
{
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  const as = async (j, fn) => { const keep = jar; jar = { ...j }; try { return await fn(); } finally { jar = keep; } };
  const adminId = (await as(adminJar, () => call("GET", "/api/auth/me"))).data.id;
  const notifIds = [];

  const mine = await as(adminJar, () => call("GET", "/api/chat/friends"));
  check("GET /api/chat/friends: code, link and QR", mine.status === 200 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(mine.data.code) && mine.data.link.endsWith(`/chat?add=${mine.data.code}`) && mine.data.qr.startsWith("data:image/png;base64,"), JSON.stringify(mine.raw).slice(0, 200));
  const again = await as(adminJar, () => call("GET", "/api/chat/friends"));
  check("the code is stable between calls", again.data.code === mine.data.code);
  const adminCode = mine.data.code;
  const self = await as(adminJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  check("adding your own code -> 400", self.status === 400);
  const unknown = await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: "ZZZZ-ZZZZ-ZZZZ" } }));
  check("unknown code -> 404", unknown.status === 404);
  const lookup = await as(userJar, () => call("GET", `/api/chat/friends/lookup?code=${adminCode.toLowerCase().replace(/-/g, "")}`));
  check("lookup previews the owner (case and dashes ignored)", lookup.status === 200 && lookup.data.user.id === adminId && lookup.data.relation === "none", JSON.stringify(lookup.raw));
  const tooEarly = await as(userJar, () => call("POST", "/api/chat/conversations", { body: { user_id: adminId } }));
  check("no chat before being friends -> 403", tooEarly.status === 403);

  const req = await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  check("POST /api/chat/friends sends a request (201)", req.status === 201 && req.data.status === "requested" && req.data.user.id === adminId, JSON.stringify(req.raw));
  const dup = await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  check("sending it twice -> 409", dup.status === 409);
  const inbox = await as(adminJar, () => call("GET", "/api/chat/friends"));
  check("admin sees it as incoming", inbox.data.incoming.some((u) => u.id === userId) && inbox.data.friends.every((u) => u.id !== userId));
  const outbox = await as(userJar, () => call("GET", "/api/chat/friends"));
  check("sender sees it as outgoing", outbox.data.outgoing.some((u) => u.id === adminId));
  const rel = await as(userJar, () => call("GET", `/api/chat/friends/lookup?code=${adminCode}`));
  check("lookup now says outgoing", rel.data.relation === "outgoing");
  const statsPending = await as(adminJar, () => call("GET", "/api/stats"));
  check("stats.counts.chat counts the pending request", Number(statsPending.data.counts.chat) >= 1, JSON.stringify(statsPending.data.counts.chat));
  const n1 = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  const fr = n1.data.items.find((n) => n.type === "friend_request" && n.entity_id === userId);
  check("admin got a friend_request notification", Boolean(fr));
  if (fr) notifIds.push(fr.id);

  const wrongSide = await as(userJar, () => call("POST", `/api/chat/friends/requests/${adminId}/accept`));
  check("the sender cannot accept their own request -> 404", wrongSide.status === 404);
  const cancel = await as(userJar, () => call("DELETE", `/api/chat/friends/requests/${adminId}`));
  check("sender cancels the request", cancel.status === 200 && cancel.data.outgoing.length === 0);
  await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  const decline = await as(adminJar, () => call("DELETE", `/api/chat/friends/requests/${userId}`));
  check("admin declines a request", decline.status === 200 && decline.data.incoming.every((u) => u.id !== userId));
  await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  const accept = await as(adminJar, () => call("POST", `/api/chat/friends/requests/${userId}/accept`));
  check("admin accepts -> friends", accept.status === 200 && accept.data.friends.some((u) => u.id === userId), JSON.stringify(accept.raw));
  const n2 = await as(userJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("sender got a friend_accepted notification", n2.data.items.some((n) => n.type === "friend_accepted" && n.entity_id === adminId));
  const nowFriends = await as(userJar, () => call("GET", `/api/chat/friends/lookup?code=${adminCode}`));
  check("lookup says friends", nowFriends.data.relation === "friends");
  const already = await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  check("adding a friend again -> 409", already.status === 409);

  const convo = await as(userJar, () => call("POST", "/api/chat/conversations", { body: { user_id: adminId } }));
  check("POST /api/chat/conversations opens the chat", convo.status === 200 && convo.data.id > 0 && convo.data.user_id === adminId && convo.data.email, JSON.stringify(convo.raw));
  const convoId = convo.data.id;
  const same = await as(adminJar, () => call("POST", "/api/chat/conversations", { body: { user_id: userId } }));
  check("the other side gets the same conversation", same.data.id === convoId);
  const empty = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "   " } }));
  check("empty message -> 400", empty.status === 400);
  const long = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "x".repeat(4001) } }));
  check("message over 4000 chars -> 400", long.status === 400);
  const m1 = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "Hello from the smoke test\r\nsecond line" } }));
  check("POST message 201, CRLF normalised", m1.status === 201 && m1.data.sender_id === userId && m1.data.body === "Hello from the smoke test\nsecond line", JSON.stringify(m1.raw));
  const strangers = await call("GET", `/api/chat/conversations/999999/messages`);
  check("unknown conversation -> 404", strangers.status === 404);
  const adminList = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  const row = adminList.data.find((c) => c.id === convoId);
  check("admin's list shows 1 unread and the last message", row && row.unread === 1 && row.last_body.startsWith("Hello") && row.last_sender_id === userId && row.friend_status === "accepted", JSON.stringify(row));
  const statsUnread = await as(adminJar, () => call("GET", "/api/stats"));
  check("stats.counts.chat counts unread messages", Number(statsUnread.data.counts.chat) >= 1);
  const n3 = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  const cm = n3.data.items.find((n) => n.type === "chat_message" && n.entity_id === convoId);
  check("admin got a chat_message notification linking to the thread", Boolean(cm) && cm.href === `/chat?c=${convoId}`);
  const readElsewhere = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/read`, { body: { message_id: 999999 } }));
  check("marking read with a message from outside the chat -> 404", readElsewhere.status === 404);
  const read = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/read`, { body: { message_id: m1.data.id } }));
  check("mark read clears unread", read.status === 200 && read.data.last_read_message_id === m1.data.id);
  const afterRead = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("unread is 0 after reading", afterRead.data.find((c) => c.id === convoId).unread === 0);
  const n4 = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("reading the thread also clears the bell entry", !n4.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId));
  const receipt = await as(userJar, () => call("GET", "/api/chat/conversations"));
  check("sender sees the read receipt", Number(receipt.data.find((c) => c.id === convoId).peer_last_read) === m1.data.id);
  const m2 = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "Hi back" } }));
  const thread = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("thread is oldest-first with both messages", thread.data.length === 2 && thread.data[0].id === m1.data.id && thread.data[1].id === m2.data.id);
  const older = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages?before=${m2.data.id}&limit=1`));
  check("?before pages backwards", older.data.length === 1 && older.data[0].id === m1.data.id);
  const n5 = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("your own message does not notify you", !n5.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && n.actor_id === adminId));

  // photos: multipart with an optional caption, files checked by content
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAADklEQVQIW2NkYGD4DwABBAEAX+XyrwAAAABJRU5ErkJggg==", "base64"); // 2 x 3 px
  const fdPhoto = new FormData();
  fdPhoto.append("body", "Look at this");
  fdPhoto.append("files", new Blob([png], { type: "image/png" }), "tiny.png");
  const photoMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdPhoto }));
  const att = photoMsg.data?.attachments?.[0];
  check("multipart message with a photo -> 201, size read from the bytes", photoMsg.status === 201 && photoMsg.data.body === "Look at this" && att && att.width === 2 && att.height === 3 && att.mime === "image/png" && att.url === `/api/chat/photos/${att.id}`, JSON.stringify(photoMsg.raw));
  chatPhotoId = att?.id;
  const fdOnly = new FormData();
  fdOnly.append("files", new Blob([png], { type: "image/png" }), "only.png");
  const photoOnly = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdOnly }));
  check("photo without text -> 201 with an empty body", photoOnly.status === 201 && photoOnly.data.body === "" && photoOnly.data.attachments.length === 1);
  const fdBlank = new FormData();
  fdBlank.append("body", "   ");
  const blank = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdBlank }));
  check("multipart with neither text nor files -> 400", blank.status === 400);
  const fdMany = new FormData();
  for (let i = 0; i < 9; i++) fdMany.append("files", new Blob([png], { type: "image/png" }), `p${i}.png`);
  const many = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdMany }));
  check("nine photos in one message -> 400", many.status === 400);
  const img = await as(adminJar, () => call("GET", `/api/chat/photos/${chatPhotoId}`));
  check("the other member can load the photo", img.status === 200 && img.headers.get("content-type") === "image/png" && img.raw.byteLength === png.length && /immutable/.test(img.headers.get("cache-control") || ""));
  const dl = await as(adminJar, () => call("GET", `/api/chat/photos/${chatPhotoId}?download=1`));
  check("?download=1 sends it as an attachment", dl.status === 200 && /^attachment/.test(dl.headers.get("content-disposition") || ""));
  const anonImg = await fetch(`${BASE}/api/chat/photos/${chatPhotoId}`);
  check("photos require a session", anonImg.status === 401);
  await anonImg.body?.cancel();
  const noImg = await as(adminJar, () => call("GET", "/api/chat/photos/999999"));
  check("unknown photo -> 404", noImg.status === 404);
  const withPhotos = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("messages carry their photos", withPhotos.data.find((m) => m.id === photoMsg.data.id)?.attachments?.[0]?.id === chatPhotoId && withPhotos.data.find((m) => m.id === m2.data.id)?.attachments?.length === 0);
  const listPhoto = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("conversation preview counts the last message's photos", listPhoto.data.find((c) => c.id === convoId)?.last_photos === 1);
  const nPhoto = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("a photo-only message notifies as a photo", nPhoto.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && /📷/.test(n.title)));
  // stickers, locations, GIF plumbing and video clips
  const badSticker = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { sticker: "not-an-emoji" } }));
  check("a sticker outside the pack -> 400", badSticker.status === 400);
  const unreadBefore = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId)?.unread ?? 0;
  const sticker = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { sticker: "🎉" } }));
  check("POST { sticker } -> 201 kind sticker", sticker.status === 201 && sticker.data.kind === "sticker" && sticker.data.body === "🎉", JSON.stringify(sticker.raw).slice(0, 160));
  const rowSticker = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  check("stickers count as unread and show in the preview", rowSticker.unread === unreadBefore + 1 && rowSticker.last_kind === "sticker" && rowSticker.last_body === "🎉", JSON.stringify({ unread: rowSticker.unread, before: unreadBefore, kind: rowSticker.last_kind }));
  const nSticker = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("a sticker notifies as '🎉 Sticker'", nSticker.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && /🎉 Sticker/.test(n.title)));
  const editSticker = await as(userJar, () => call("PUT", `/api/chat/messages/${sticker.data.id}`, { body: { body: "😀" } }));
  check("stickers cannot be edited -> 400", editSticker.status === 400);
  const badLoc = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { location: { lat: 123, lng: 5 } } }));
  check("a location off the globe -> 400", badLoc.status === 400);
  const loc = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { location: { lat: 3.1390123456, lng: 101.6868, accuracy: 12.6 } } }));
  const locBody = loc.data ? JSON.parse(loc.data.body) : null;
  check("POST { location } -> 201 kind location with rounded coordinates", loc.status === 201 && loc.data.kind === "location" && locBody?.lat === 3.139012 && locBody?.lng === 101.6868 && locBody?.accuracy === 13, JSON.stringify(loc.raw).slice(0, 160));
  const replyLoc = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "on my way", reply_to: loc.data.id } }));
  check("a reply quotes a location as a pin, not JSON", replyLoc.status === 201 && replyLoc.data.reply_to?.body === "📍 Location", JSON.stringify(replyLoc.data?.reply_to));
  const nLoc = await as(userJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  const nLocAdmin = await as(adminJar, () => call("GET", "/api/notifications?limit=30"));
  check("a location notifies as '📍 Location'", nLocAdmin.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && /📍 Location/.test(n.title)) || nLoc.data.items.some((n) => /📍 Location/.test(n.title)));
  const gifs = await as(userJar, () => call("GET", "/api/chat/gifs?q=cats"));
  check("GET /api/chat/gifs says not configured until an admin adds a key", gifs.status === 200 && gifs.data.configured === false && gifs.data.items.length === 0, JSON.stringify(gifs.raw));
  const badGif = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { gif_url: "https://example.com/x.gif" } }));
  check("a GIF from an unknown host -> 400", badGif.status === 400);
  const gifCfgUser = await as(userJar, () => call("PUT", "/api/chat/admin/settings", { body: { gif_provider: "giphy", gif_api_key: "k" } }));
  check("users cannot set the GIF key -> 403", gifCfgUser.status === 403);
  const gifCfgBad = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { gif_provider: "imgur" } }));
  check("unknown GIF provider -> 400", gifCfgBad.status === 400);
  const gifCfg = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { gif_provider: "giphy", gif_api_key: "smoke-key" } }));
  check("admin sets a GIF provider and key (key never echoed)", gifCfg.status === 200 && gifCfg.data.gif_provider === "giphy" && gifCfg.data.gif_key_set === true && gifCfg.data.gif_search === true && !JSON.stringify(gifCfg.raw).includes("smoke-key"), JSON.stringify(gifCfg.raw));
  const rowGif = (await as(userJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  check("conversations then carry gif_search: true", rowGif.gif_search === true);
  const ovGif = await as(adminJar, () => call("GET", "/api/chat/admin/overview"));
  check("the overview reports gif_key_set without the key", ovGif.data.settings.gif_key_set === true && !JSON.stringify(ovGif.raw).includes("smoke-key"));
  const gifOff = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { gif_provider: null, gif_api_key: "" } }));
  check("admin turns GIF search off again", gifOff.status === 200 && gifOff.data.gif_search === false && gifOff.data.gif_key_set === false);
  // video clips: recognised by content (an MP4 'ftyp' box), 15 MB cap, served inline
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2mp41"), Buffer.alloc(64)]);
  const fdVideo = new FormData();
  fdVideo.append("body", "clip");
  fdVideo.append("files", new Blob([mp4], { type: "video/mp4" }), "clip.mp4");
  const video = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdVideo }));
  const vAtt = video.data?.attachments?.[0];
  check("multipart message with a video -> 201, kind video, mime from the bytes", video.status === 201 && vAtt?.kind === "video" && vAtt?.mime === "video/mp4" && vAtt?.name === "clip.mp4", JSON.stringify(video.raw).slice(0, 200));
  const rowVideo = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  check("the list preview counts videos", rowVideo.last_videos === 1);
  const vGet = await as(adminJar, () => call("GET", `/api/chat/photos/${vAtt.id}`));
  check("videos are served inline as video/mp4", vGet.status === 200 && vGet.headers.get("content-type") === "video/mp4" && /^inline/.test(vGet.headers.get("content-disposition") || ""));
  const fdBigMedia = new FormData();
  fdBigMedia.append("files", new Blob([mp4, new Uint8Array(15 * 1024 * 1024 + 1024)], { type: "video/mp4" }), "big.mp4");
  const tooBig = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdBigMedia }));
  check("a video over 15 MB -> 413", tooBig.status === 413, String(tooBig.status));
  const m4a = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypM4A "), Buffer.alloc(80)]);
  const fdM4a = new FormData();
  fdM4a.append("files", new Blob([m4a], { type: "audio/mp4" }), "song.m4a");
  const m4aFile = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdM4a }));
  check("an M4A audio file stays a plain file", m4aFile.status === 201 && m4aFile.data.attachments[0].kind === "file");
  const fwdSticker = await as(userJar, () => call("POST", `/api/chat/messages/${sticker.data.id}/forward`, { body: { conversation_ids: [convoId] } }));
  check("forwarding a sticker keeps it a sticker", fwdSticker.status === 201 && fwdSticker.data[0].kind === "sticker" && fwdSticker.data[0].body === "🎉");
  const fdFake = new FormData();
  fdFake.append("files", new Blob(["hello"], { type: "image/png" }), "fake.png");
  const fake = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdFake }));
  check("a text file disguised as a PNG is kept as a plain file, not a photo", fake.status === 201 && fake.data.attachments[0].kind === "file" && fake.data.attachments[0].mime === "image/png");

  // replies and forwarding
  const replyBad = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "?", reply_to: 999999 } }));
  check("replying to a message outside the chat -> 400", replyBad.status === 400);
  const reply = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "Replying to your first one", reply_to: m1.data.id } }));
  check("POST with reply_to quotes the original (author + snippet)", reply.status === 201 && reply.data.reply_to?.id === m1.data.id && reply.data.reply_to.sender_name === "Smoke User 2" && /^Hello/.test(reply.data.reply_to.body) && reply.data.forwarded === false, JSON.stringify(reply.raw).slice(0, 300));
  const replyPhoto = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "nice", reply_to: photoOnly.data.id } }));
  check("a quote of a photo-only message describes the photo", replyPhoto.status === 201 && replyPhoto.data.reply_to.attachment?.kind === "image" && replyPhoto.data.reply_to.body === "");
  const replyToPhotoMsg = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "got it", reply_to: photoMsg.data.id } }));
  check("a quote of a captioned photo shows the caption", replyToPhotoMsg.status === 201 && replyToPhotoMsg.data.reply_to.body === "Look at this");
  const listed = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("quotes travel with the message list", listed.data.find((m) => m.id === reply.data.id)?.reply_to?.id === m1.data.id);
  const fwdSelf = await as(userJar, () => call("POST", `/api/chat/messages/${photoOnly.data.id}/forward`, { body: { conversation_ids: [convoId] } }));
  check("POST /api/chat/messages/:id/forward copies the message with its own copy of the photo", fwdSelf.status === 201 && fwdSelf.data.length === 1 && fwdSelf.data[0].forwarded === true && fwdSelf.data[0].attachments.length === 1 && fwdSelf.data[0].attachments[0].id !== photoOnly.data.attachments[0].id, JSON.stringify(fwdSelf.raw).slice(0, 300));
  const copied = await as(adminJar, () => call("GET", `/api/chat/photos/${fwdSelf.data[0].attachments[0].id}`));
  check("the forwarded copy is served from its own file", copied.status === 200 && copied.raw.byteLength === png.length);
  const fwdMany = await as(userJar, () => call("POST", `/api/chat/messages/${m1.data.id}/forward`, { body: { conversation_ids: [1, 2, 3, 4, 5, 6] } }));
  check("forwarding to more than 5 chats -> 400", fwdMany.status === 400);
  const fwdNone = await as(userJar, () => call("POST", `/api/chat/messages/${m1.data.id}/forward`, { body: { conversation_ids: [] } }));
  check("forwarding to no chat -> 400", fwdNone.status === 400);

  // voice messages: a WebM container with a duration, byte-range playback, validation
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), Buffer.alloc(200, 7)]);
  const fdVoice = new FormData();
  fdVoice.append("duration", "4200");
  fdVoice.append("voice", new Blob([webm], { type: "audio/webm" }), "voice-1.webm");
  const voiceMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdVoice }));
  const va = voiceMsg.data?.attachments?.[0];
  check("multipart voice note -> 201 with kind audio and duration", voiceMsg.status === 201 && voiceMsg.data.body === "" && va && va.kind === "audio" && va.mime === "audio/webm" && va.duration === 4200, JSON.stringify(voiceMsg.raw));
  const full = await as(adminJar, () => call("GET", `/api/chat/photos/${va.id}`));
  check("the other member streams it with Accept-Ranges", full.status === 200 && full.headers.get("content-type") === "audio/webm" && full.headers.get("accept-ranges") === "bytes" && full.raw.byteLength === webm.length);
  const partial = await fetch(`${BASE}/api/chat/photos/${va.id}`, { headers: { cookie: Object.entries(adminJar).map(([k, v]) => `${k}=${v}`).join("; "), range: "bytes=0-9" } });
  check("byte ranges -> 206 with Content-Range", partial.status === 206 && partial.headers.get("content-range") === `bytes 0-9/${webm.length}` && (await partial.arrayBuffer()).byteLength === 10);
  const badRange = await fetch(`${BASE}/api/chat/photos/${va.id}`, { headers: { cookie: Object.entries(adminJar).map(([k, v]) => `${k}=${v}`).join("; "), range: "bytes=9999-" } });
  check("an unsatisfiable range -> 416", badRange.status === 416);
  await badRange.body?.cancel();
  const listVoice = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("conversation preview carries the voice duration", listVoice.data.find((c) => c.id === convoId)?.last_voice === 4200 && listVoice.data.find((c) => c.id === convoId)?.last_photos === 0);
  const nVoice = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("a voice message notifies with its length", nVoice.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && /🎤 Voice message \(0:04\)/.test(n.title)));
  const fdLong = new FormData();
  fdLong.append("duration", String(6 * 60 * 1000));
  fdLong.append("voice", new Blob([webm], { type: "audio/webm" }), "long.webm");
  const tooLong = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdLong }));
  check("a voice note over 5 minutes -> 400", tooLong.status === 400);
  const fdMix = new FormData();
  fdMix.append("files", new Blob([png], { type: "image/png" }), "a.png");
  fdMix.append("voice", new Blob([webm], { type: "audio/webm" }), "b.webm");
  const mixed = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdMix }));
  check("photos and a voice note in one message -> 400", mixed.status === 400);
  const fdTwo = new FormData();
  fdTwo.append("voice", new Blob([webm], { type: "audio/webm" }), "a.webm");
  fdTwo.append("voice", new Blob([webm], { type: "audio/webm" }), "b.webm");
  const two = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdTwo }));
  check("two voice notes in one message -> 400", two.status === 400);
  const fdFakeAudio = new FormData();
  fdFakeAudio.append("voice", new Blob(["not audio at all"], { type: "audio/webm" }), "fake.webm");
  const fakeAudio = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdFakeAudio }));
  check("a text file disguised as a voice note -> 400", fakeAudio.status === 400);

  // files: any type, safe serving policy, mixing with photos, limits
  const fdFiles = new FormData();
  fdFiles.append("body", "Minutes and the agenda");
  fdFiles.append("files", new Blob(["hello from the smoke test"], { type: "text/plain" }), "notes.txt");
  fdFiles.append("files", new Blob(["%PDF-1.4\n%fake"], { type: "application/pdf" }), "agenda.pdf");
  const fileMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdFiles }));
  const fa = fileMsg.data?.attachments ?? [];
  check("multipart files -> 201 with kind file, names, sizes and MIME", fileMsg.status === 201 && fa.length === 2 && fa.every((a) => a.kind === "file") && fa[0].name === "notes.txt" && fa[0].mime === "text/plain" && fa[0].size === 25 && fa[1].mime === "application/pdf", JSON.stringify(fileMsg.raw));
  const txt = await as(adminJar, () => call("GET", `/api/chat/photos/${fa[0].id}`));
  check("plain text opens inline with nosniff", txt.status === 200 && /^inline/.test(txt.headers.get("content-disposition") || "") && txt.headers.get("x-content-type-options") === "nosniff" && Buffer.from(txt.raw).toString() === "hello from the smoke test");
  const fdHtml = new FormData();
  fdHtml.append("files", new Blob(["<script>alert(1)</script>"], { type: "text/html" }), "page.html");
  const htmlMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdHtml }));
  const html = await as(adminJar, () => call("GET", `/api/chat/photos/${htmlMsg.data.attachments[0].id}`));
  check("an HTML upload is always served as a download", htmlMsg.status === 201 && html.status === 200 && /^attachment/.test(html.headers.get("content-disposition") || "") && html.headers.get("content-type") === "text/html");
  const fdBadMime = new FormData();
  fdBadMime.append("files", new Blob(["x"], { type: "weird stuff here" }), "odd.bin");
  const badMime = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdBadMime }));
  check("an invalid MIME becomes application/octet-stream", badMime.status === 201 && badMime.data.attachments[0].mime === "application/octet-stream");
  const fdMixed = new FormData();
  fdMixed.append("files", new Blob([png], { type: "image/png" }), "pic.png");
  fdMixed.append("files", new Blob(["a,b\n1,2"], { type: "text/csv" }), "data.csv");
  const mixedMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdMixed }));
  check("a photo and a file travel together", mixedMsg.status === 201 && mixedMsg.data.attachments.map((a) => a.kind).join() === "image,file");
  const fdAudioFile = new FormData();
  fdAudioFile.append("files", new Blob([webm], { type: "audio/webm" }), "song.webm");
  const audioFile = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdAudioFile }));
  check("an audio file sent as a file is a file, not a voice note", audioFile.status === 201 && audioFile.data.attachments[0].kind === "file");
  const fdNine = new FormData();
  for (let i = 0; i < 9; i++) fdNine.append("files", new Blob(["x"], { type: "text/plain" }), `f${i}.txt`);
  const nine = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdNine }));
  check("nine attachments -> 400", nine.status === 400);
  const fdMid = new FormData();
  fdMid.append("files", new Blob([new Uint8Array(15 * 1024 * 1024)], { type: "application/octet-stream" }), "mid.bin");
  const mid = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdMid }));
  check("a 15 MB file uploads whole (the proxy body limit is raised)", mid.status === 201 && mid.data.attachments[0].size === 15 * 1024 * 1024, JSON.stringify(mid.raw).slice(0, 200));
  const fdBig = new FormData();
  fdBig.append("files", new Blob([new Uint8Array(27 * 1024 * 1024)], { type: "application/octet-stream" }), "big.bin");
  const big = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdBig }));
  check("27 MB in one message -> 413 before buffering", big.status === 413);
  const listFiles = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  const rowF = listFiles.data.find((c) => c.id === convoId);
  check("conversation preview carries the file count and name", rowF?.last_files === 1 && rowF?.last_file_name === "mid.bin");
  const nFiles = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("a file message notifies with a paperclip and the name", nFiles.data.items.some((n) => n.type === "chat_message" && n.entity_id === convoId && /📎 mid\.bin/.test(n.title)));

  // editing and deleting
  const editOther = await as(adminJar, () => call("PUT", `/api/chat/messages/${m1.data.id}`, { body: { body: "hijack" } }));
  check("editing someone else's message -> 403", editOther.status === 403);
  const editEmpty = await as(userJar, () => call("PUT", `/api/chat/messages/${m1.data.id}`, { body: { body: "  " } }));
  check("editing a text message to nothing -> 400", editEmpty.status === 400);
  const edited = await as(userJar, () => call("PUT", `/api/chat/messages/${m1.data.id}`, { body: { body: "Hello from the smoke test (edited)" } }));
  check("PUT /api/chat/messages/:id edits your own text and stamps edited_at", edited.status === 200 && edited.data.body === "Hello from the smoke test (edited)" && edited.data.edited_at && !edited.data.deleted_at, JSON.stringify(edited.raw));
  const editedSeen = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("the other member reads the edited text", editedSeen.data.find((m) => m.id === m1.data.id)?.body === "Hello from the smoke test (edited)");
  const captionEdit = await as(userJar, () => call("PUT", `/api/chat/messages/${photoOnly.data.id}`, { body: { body: "now with a caption" } }));
  check("a photo message can gain a caption", captionEdit.status === 200 && captionEdit.data.body === "now with a caption" && captionEdit.data.attachments.length === 1);
  const delOther = await as(adminJar, () => call("DELETE", `/api/chat/messages/${photoMsg.data.id}`));
  check("deleting someone else's message in a direct chat -> 403", delOther.status === 403);
  const delPhoto = await as(userJar, () => call("DELETE", `/api/chat/messages/${photoMsg.data.id}`));
  check("DELETE /api/chat/messages/:id soft-deletes: placeholder stays, content and files go", delPhoto.status === 200 && delPhoto.data.deleted_at && delPhoto.data.body === "" && delPhoto.data.attachments.length === 0, JSON.stringify(delPhoto.raw));
  const gonePhoto = await as(adminJar, () => call("GET", `/api/chat/photos/${chatPhotoId}`));
  check("its photo file is gone -> 404", gonePhoto.status === 404);
  const quoteGone = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("a quote of a deleted message says so and drops the content", quoteGone.data.find((m) => m.id === replyToPhotoMsg.data.id)?.reply_to?.deleted === true && quoteGone.data.find((m) => m.id === replyToPhotoMsg.data.id)?.reply_to?.body === "");
  const replyDeleted = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "?", reply_to: photoMsg.data.id } }));
  check("replying to a deleted message -> 400", replyDeleted.status === 400);
  const editDeleted = await as(userJar, () => call("PUT", `/api/chat/messages/${photoMsg.data.id}`, { body: { body: "back?" } }));
  check("a deleted message cannot be edited -> 400", editDeleted.status === 400);
  const reactDeleted = await as(adminJar, () => call("POST", `/api/chat/messages/${photoMsg.data.id}/reactions`, { body: { emoji: "👍" } }));
  check("a deleted message cannot be reacted to -> 400", reactDeleted.status === 400);
  const delTwice = await as(userJar, () => call("DELETE", `/api/chat/messages/${photoMsg.data.id}`));
  check("deleting again -> 400", delTwice.status === 400);
  const searchDeleted = await as(adminJar, () => call("GET", "/api/chat/search?q=Look%20at%20this"));
  check("deleted messages are not search hits", searchDeleted.status === 200 && searchDeleted.data.length === 0);
  const previewDeleted = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("conversation rows carry last_deleted", previewDeleted.data.find((c) => c.id === convoId)?.last_deleted !== undefined);

  // reactions: toggle, validation, visibility to the other member, one notification per reaction
  const badEmoji = await as(adminJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "🦄" } }));
  check("an emoji outside the quick set -> 400", badEmoji.status === 400);
  const react = await as(adminJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "👍" } }));
  check("POST /api/chat/messages/:id/reactions adds 👍", react.status === 200 && react.data.added === true && react.data.reactions.length === 1 && react.data.reactions[0].emoji === "👍" && react.data.reactions[0].count === 1 && react.data.reactions[0].user_ids[0] === adminId && react.data.reactions[0].names[0] === "Admin User", JSON.stringify(react.raw));
  const react2 = await as(userJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "👍" } }));
  check("a second person on the same emoji makes count 2", react2.data.reactions[0].count === 2 && react2.data.reactions[0].user_ids.includes(userId));
  const heart = await as(userJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "❤️" } }));
  check("a different emoji becomes a second chip", heart.data.reactions.length === 2 && heart.data.reactions[1].emoji === "❤️");
  const withReactions = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("messages carry reactions[]", withReactions.data.find((m) => m.id === m1.data.id)?.reactions?.length === 2 && withReactions.data.find((m) => m.id === m2.data.id)?.reactions?.length === 0);
  const nReact = await as(userJar, () => call("GET", "/api/notifications?limit=30"));
  check("the author was told about the admin's 👍 (not about their own reactions)", nReact.data.items.filter((n) => n.type === "chat_reaction" && n.entity_id === convoId).length === 1 && /Admin User reacted 👍/.test(nReact.data.items.find((n) => n.type === "chat_reaction").title));
  const untoggle = await as(adminJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "👍" } }));
  check("toggling again removes it", untoggle.data.added === false && untoggle.data.reactions.find((r) => r.emoji === "👍")?.count === 1);
  const retoggle = await as(adminJar, () => call("POST", `/api/chat/messages/${m1.data.id}/reactions`, { body: { emoji: "👍" } }));
  const nReact2 = await as(userJar, () => call("GET", "/api/notifications?limit=30"));
  check("re-adding the same reaction does not notify twice", retoggle.data.added === true && nReact2.data.items.filter((n) => n.type === "chat_reaction" && n.entity_id === convoId).length === 1);
  const noMsg = await as(adminJar, () => call("POST", "/api/chat/messages/999999/reactions", { body: { emoji: "👍" } }));
  check("reacting to an unknown message -> 404", noMsg.status === 404);

  // profile pictures: default badge, presets, initials, upload, serving, clearing
  const meDefault = await as(userJar, () => call("GET", "/api/auth/me"));
  check("accounts carry avatar = preset:pro by default", meDefault.data.avatar === "preset:pro");
  const badPreset = await as(userJar, () => call("PUT", "/api/auth/avatar", { body: { avatar: "preset:unicorn" } }));
  check("an unknown preset -> 400", badPreset.status === 400);
  const fox = await as(userJar, () => call("PUT", "/api/auth/avatar", { body: { avatar: "preset:cat" } }));
  check("PUT /api/auth/avatar picks a preset", fox.status === 200 && fox.data.avatar === "preset:cat");
  const initialsPick = await as(userJar, () => call("PUT", "/api/auth/avatar", { body: { avatar: "initials" } }));
  check("initials can be chosen", initialsPick.status === 200 && initialsPick.data.avatar === "initials");
  const noPic = await as(adminJar, () => call("GET", `/api/avatars/user/${userId}`));
  check("no uploaded picture -> 404", noPic.status === 404);
  const fdAvatar = new FormData();
  fdAvatar.append("file", new Blob([png], { type: "image/png" }), "me.png");
  const uploaded = await as(userJar, () => call("POST", "/api/auth/avatar", { form: fdAvatar }));
  check("POST /api/auth/avatar uploads a photo", uploaded.status === 201 && uploaded.data.avatar.startsWith(`upload:user:${userId}:`), JSON.stringify(uploaded.raw));
  const served = await as(adminJar, () => call("GET", `/api/avatars/user/${userId}`));
  check("others can load the picture, cached and nosniff", served.status === 200 && served.headers.get("content-type") === "image/png" && /private/.test(served.headers.get("cache-control") || "") && served.headers.get("x-content-type-options") === "nosniff" && served.raw.byteLength === png.length);
  const fdFakeAvatar = new FormData();
  fdFakeAvatar.append("file", new Blob(["nope"], { type: "image/png" }), "fake.png");
  const fakeAvatar = await as(userJar, () => call("POST", "/api/auth/avatar", { form: fdFakeAvatar }));
  check("a non-image upload -> 400", fakeAvatar.status === 400);
  const peers = await as(adminJar, () => call("GET", "/api/chat/friends"));
  check("friends carry their avatar value", peers.data.friends.find((u) => u.id === userId)?.avatar === uploaded.data.avatar);
  const convoAvatar = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("direct conversation rows carry the peer's avatar", convoAvatar.data.find((c) => c.id === convoId)?.avatar === uploaded.data.avatar);
  const msgAvatar = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages?limit=5`));
  check("messages carry sender_avatar", msgAvatar.data.every((m) => typeof m.sender_avatar === "string"));
  const cleared = await as(userJar, () => call("DELETE", "/api/auth/avatar"));
  check("DELETE /api/auth/avatar returns to the default badge", cleared.status === 200 && cleared.data.avatar === "preset:pro");
  const goneAvatar = await as(adminJar, () => call("GET", `/api/avatars/user/${userId}`));
  check("the uploaded picture is gone after clearing", goneAvatar.status === 404);
  const wrongKind = await as(adminJar, () => call("GET", `/api/avatars/thing/${userId}`));
  check("unknown picture kind -> 404", wrongKind.status === 404);

  // group chat: created by the user with the admin, owner-only actions, system lines, seen-by, leaving
  const noName = await as(userJar, () => call("POST", "/api/chat/groups", { body: { title: "  ", member_ids: [adminId] } }));
  check("group without a name -> 400", noName.status === 400);
  const noMembers = await as(userJar, () => call("POST", "/api/chat/groups", { body: { title: "Solo", member_ids: [] } }));
  check("group without members -> 400", noMembers.status === 400);
  const ghost = await as(userJar, () => call("POST", "/api/chat/groups", { body: { title: "Ghosts", member_ids: [999999] } }));
  check("group with an unknown member -> 404", ghost.status === 404);
  const grp = await as(userJar, () => call("POST", "/api/chat/groups", { body: { title: "Smoke crew", member_ids: [adminId] } }));
  check("POST /api/chat/groups -> 201 with members and my_role owner", grp.status === 201 && grp.data.kind === "group" && grp.data.name === "Smoke crew" && grp.data.member_count === 2 && grp.data.my_role === "owner" && grp.data.members.some((m) => m.id === adminId && m.role === "member"), JSON.stringify(grp.raw));
  const gid = grp.data.id;
  const adminView = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}`));
  check("the added member sees the group with role member", adminView.status === 200 && adminView.data.my_role === "member" && adminView.data.avatar_color);
  const sysLines = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}/messages`));
  check("creation wrote system lines (created + added) with the sender's name", sysLines.data.filter((m) => m.kind === "system").length === 2 && sysLines.data[0].sender_name === "Smoke User 2" && JSON.parse(sysLines.data[1].body).names.includes("Admin User"));
  const sysReact = await as(adminJar, () => call("POST", `/api/chat/messages/${sysLines.data[0].id}/reactions`, { body: { emoji: "👍" } }));
  check("system lines cannot be reacted to -> 400", sysReact.status === 400);
  const nGroup = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("the added member got a chat_group notification", nGroup.data.items.some((n) => n.type === "chat_group" && n.entity_id === gid && /Smoke crew/.test(n.title)));
  const memberPic = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/avatar`, { body: { avatar: "preset:star" } }));
  check("any member can change the group picture", memberPic.status === 200 && memberPic.data.avatar === "preset:star" && JSON.parse(memberPic.data.last_body).event === "image");
  const outsiderPic = await as(userJar, () => call("PUT", "/api/chat/conversations/999999/avatar", { body: { avatar: "preset:star" } }));
  check("changing the picture of a group you are not in -> 404", outsiderPic.status === 404);
  const groupPreset = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/avatar`, { body: { avatar: "preset:rocket" } }));
  check("the owner picks a group icon", groupPreset.status === 200 && groupPreset.data.avatar === "preset:rocket");
  const fdGroupPic = new FormData();
  fdGroupPic.append("file", new Blob([png], { type: "image/png" }), "crew.png");
  const groupUpload = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/avatar`, { form: fdGroupPic }));
  check("the owner uploads a group picture", groupUpload.status === 201 && groupUpload.data.avatar.startsWith(`upload:group:${gid}:`));
  const memberSees = await as(adminJar, () => call("GET", `/api/avatars/group/${gid}`));
  check("members can load the group picture", memberSees.status === 200 && memberSees.headers.get("content-type") === "image/png");
  const strangerSees = await as(adminJar, () => call("GET", "/api/avatars/group/999999"));
  check("a group you are not in -> 404", strangerSees.status === 404);
  const directPic = await as(userJar, () => call("PUT", `/api/chat/conversations/${convoId}/avatar`, { body: { avatar: "preset:rocket" } }));
  check("direct chats have no picture -> 400", directPic.status === 400);
  const groupClear = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}/avatar`));
  check("the owner removes the group picture", groupClear.status === 200 && groupClear.data.avatar === null);
  const notOwner = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}`, { body: { title: "Hijacked" } }));
  check("a member cannot rename the group -> 403", notOwner.status === 403);
  const renamed = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}`, { body: { title: "Smoke crew 2" } }));
  check("the owner renames the group", renamed.status === 200 && renamed.data.title === "Smoke crew 2");
  const dupMember = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/members`, { body: { user_ids: [adminId] } }));
  check("adding someone already in the group -> 409", dupMember.status === 409);
  const unknownMember = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/members`, { body: { user_ids: [999999] } }));
  check("adding an unknown user -> 404", unknownMember.status === 404);
  const gm = await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "Hello group" } }));
  check("a member posts in the group -> 201 with sender_name", gm.status === 201 && gm.data.sender_name === "Admin User" && gm.data.kind === "text");
  const gList = await as(userJar, () => call("GET", "/api/chat/conversations"));
  const gRow = gList.data.find((c) => c.id === gid);
  check("the group lists with 1 unread (system lines do not count) and the sender's name", gRow && gRow.unread === 1 && gRow.last_sender_name === "Admin User" && gRow.kind === "group" && gRow.member_count === 2, JSON.stringify(gRow));
  const nG = await as(userJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("group messages notify with the group name", nG.data.items.some((n) => n.type === "chat_message" && n.entity_id === gid && /Admin User · Smoke crew 2: Hello group/.test(n.title)));
  // search across conversations, scoped to one, and a window around a hit
  const shortQ = await as(userJar, () => call("GET", "/api/chat/search?q=h"));
  check("search needs at least 2 characters -> 400", shortQ.status === 400);
  const hits = await as(userJar, () => call("GET", "/api/chat/search?q=hello"));
  check("search finds the direct and the group message, newest first, with conversation names", hits.status === 200 && hits.data.length === 2 && hits.data[0].id === gm.data.id && hits.data[0].conversation_kind === "group" && hits.data[0].conversation_name === "Smoke crew 2" && hits.data[1].id === m1.data.id && hits.data[1].conversation_name === "Admin User" && hits.data[1].sender_name === "Smoke User 2", JSON.stringify(hits.raw).slice(0, 300));
  const scoped = await as(userJar, () => call("GET", `/api/chat/search?q=hello&c=${convoId}`));
  check("search scoped to one chat", scoped.data.length === 1 && scoped.data[0].id === m1.data.id);
  const paged = await as(userJar, () => call("GET", `/api/chat/search?q=hello&before=${gm.data.id}`));
  check("?before pages past a hit", paged.data.length === 1 && paged.data[0].id === m1.data.id);
  const sys = await as(userJar, () => call("GET", "/api/chat/search?q=added"));
  check("system lines are never search hits", sys.data.length === 0);
  const wild = await as(userJar, () => call("GET", "/api/chat/search?q=%25%25"));
  check("LIKE wildcards are literal", wild.status === 200 && wild.data.length === 0);
  const around = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages?around=${m1.data.id}`));
  check("?around returns a window holding the message, oldest first", around.status === 200 && around.data.some((m) => m.id === m1.data.id) && around.data.every((m, i) => i === 0 || m.id > around.data[i - 1].id));
  const outsideSearch = await as(userJar, () => call("GET", "/api/chat/search?q=hello&c=999999"));
  check("search in a chat you are not in finds nothing", outsideSearch.data.length === 0);
  await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/read`, { body: { message_id: gm.data.id } }));
  const seenBy = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}`));
  check("members carry read positions (seen by)", Number(seenBy.data.members.find((m) => m.id === userId)?.last_read_message_id) === gm.data.id);
  const later = await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "and one more" } }));
  const receipts = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}`));
  const pointer = Number(receipts.data.members.find((m) => m.id === userId)?.last_read_message_id);
  check("per-message receipts derive from the pointer: earlier message read, newer one not yet", pointer >= gm.data.id && pointer < later.data.id);
  const ownerMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "owner speaking" } }));
  const memberDeletesOwner = await as(adminJar, () => call("DELETE", `/api/chat/messages/${ownerMsg.data.id}`));
  check("a member cannot delete the owner's message -> 403", memberDeletesOwner.status === 403);
  const ownerDeletesMember = await as(userJar, () => call("DELETE", `/api/chat/messages/${gm.data.id}`));
  check("the group owner can delete a member's message", ownerDeletesMember.status === 200 && ownerDeletesMember.data.deleted_at && ownerDeletesMember.data.sender_id === adminId);
  const fwdGroup = await as(userJar, () => call("POST", `/api/chat/messages/${m1.data.id}/forward`, { body: { conversation_ids: [gid] } }));
  check("forwarding a text message into a group", fwdGroup.status === 201 && fwdGroup.data[0].conversation_id === gid && /Hello from the smoke test/.test(fwdGroup.data[0].body) && fwdGroup.data[0].forwarded === true);
  const fwdOutside = await as(adminJar, () => call("POST", `/api/chat/messages/${later.data.id}/forward`, { body: { conversation_ids: [999999] } }));
  check("forwarding into a chat you are not in -> 404", fwdOutside.status === 404, `${fwdOutside.status} ${JSON.stringify(fwdOutside.raw).slice(0, 160)}`);
  const fwdSys = await as(adminJar, () => call("POST", `/api/chat/messages/${sysLines.data[0].id}/forward`, { body: { conversation_ids: [gid] } }));
  check("system lines cannot be forwarded -> 400", fwdSys.status === 400);
  const fwdDeleted = await as(adminJar, () => call("POST", `/api/chat/messages/${gm.data.id}/forward`, { body: { conversation_ids: [gid] } }));
  check("deleted messages cannot be forwarded -> 400", fwdDeleted.status === 400);
  const replySys = await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "?", reply_to: sysLines.data[0].id } }));
  check("system lines cannot be replied to -> 400", replySys.status === 400);
  // mentions
  const mentionOutside = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "@Nobody hi", mentions: [999999] } }));
  check("mentioning a non-member -> 400", mentionOutside.status === 400);
  const mentionMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "@Admin User can you check the deploy?", mentions: [adminId] } }));
  check("a group message can mention a member", mentionMsg.status === 201 && mentionMsg.data.mentions?.length === 1 && mentionMsg.data.mentions[0] === adminId, JSON.stringify(mentionMsg.raw).slice(0, 200));
  const rowM = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === gid);
  check("the mentioned member's conversation row carries mention_unread", rowM?.mention_unread === 1 && rowM.unread >= 1, JSON.stringify({ mu: rowM?.mention_unread, u: rowM?.unread }));
  const nM = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
  check("a mention raises a chat_mention notification naming the group", nM.data.items.some((n) => n.type === "chat_mention" && n.entity_id === gid && /mentioned you in Smoke crew 2/.test(n.title)));
  const allMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "@everyone standup in 5", mention_all: true } }));
  check("@everyone mentions every other member, not the sender", allMsg.status === 201 && allMsg.data.mentions.includes(adminId) && !allMsg.data.mentions.includes(userId));
  const rowM2 = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === gid);
  check("mention_unread counts both mentions", rowM2?.mention_unread === 2);
  await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/read`, { body: { message_id: allMsg.data.id } }));
  const rowM3 = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === gid);
  check("reading the chat clears mention_unread", rowM3?.mention_unread === 0);
  const editMention = await as(userJar, () => call("PUT", `/api/chat/messages/${allMsg.data.id}`, { body: { body: "standup in 5, @Admin User only", mentions: [adminId], mention_all: false } }));
  check("editing rewrites the mention list", editMention.status === 200 && editMention.data.mentions.length === 1 && editMention.data.mentions[0] === adminId);
  const directMention = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "@Admin User in a direct chat", mentions: [adminId] } }));
  check("mentions are ignored in direct chats", directMention.status === 201 && directMention.data.mentions.length === 0);
  // co-admins, invite links, deliberate ownership transfer, retention, export, reports and moderation
  {
    const guestEmail = `smoke.guest.${suffix.toLowerCase()}@example.com`;
    const guest = await as(adminJar, () => call("POST", "/api/users", { body: { name: "Smoke Guest", email: guestEmail, password: "smoke789", role: "user" } }));
    check("a third account for invite links", guest.status === 201, JSON.stringify(guest.raw));
    const guestId = guest.data.id;
    const keepJar = jar;
    jar = {};
    await call("POST", "/api/auth/login", { body: { email: guestEmail, password: "smoke789" }, noAuth: true });
    const guestJar = { ...jar };
    jar = keepJar;
    const memberRole = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${userId}`, { body: { role: "admin" } }));
    check("a member cannot change roles -> 403", memberRole.status === 403);
    const badRole = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "boss" } }));
    check("unknown role -> 400", badRole.status === 400);
    const promote = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "admin" } }));
    check("the owner makes a member an admin", promote.status === 200 && promote.data.members.find((m) => m.id === adminId)?.role === "admin", JSON.stringify(promote.raw).slice(0, 200));
    const nAdmin = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("the new admin is told", nAdmin.data.items.some((n) => n.type === "chat_group" && n.entity_id === gid && /made you an admin/.test(n.title)));
    const adminRename = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}`, { body: { title: "Smoke crew 3" } }));
    check("an admin can rename the group", adminRename.status === 200 && adminRename.data.title === "Smoke crew 3");
    const adminPic = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/avatar`, { body: { avatar: "preset:rocket" } }));
    check("an admin can change the picture", adminPic.status === 200 && adminPic.data.avatar === "preset:rocket");
    const adminKicksOwner = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${userId}`));
    check("an admin cannot remove the owner -> 403", adminKicksOwner.status === 403);
    const adminRoles = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${userId}`, { body: { role: "member" } }));
    check("an admin cannot change roles -> 403", adminRoles.status === 403);
    const ownerMsg2 = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "admins may delete this" } }));
    const adminDeletes = await as(adminJar, () => call("DELETE", `/api/chat/messages/${ownerMsg2.data.id}`));
    check("a group admin can delete anyone's message", adminDeletes.status === 200 && Boolean(adminDeletes.data.deleted_at));
    // invite link
    const noLink = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/invite`));
    check("GET invite: none yet", noLink.status === 200 && noLink.data.code === null);
    const revokeNone = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}/invite`));
    check("revoking a missing link -> 404", revokeNone.status === 404);
    const link = await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/invite`));
    check("an admin creates the invite link (code, link, QR)", link.status === 201 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(link.data.code) && link.data.link.endsWith(`/chat?join=${link.data.code}`) && link.data.qr.startsWith("data:image/png"), JSON.stringify(link.raw).slice(0, 200));
    const rowLink = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}`));
    check("managers see invite_code on the conversation", rowLink.data.invite_code === link.data.code);
    const preview = await as(guestJar, () => call("GET", `/api/chat/invites/${link.data.code.toLowerCase()}`));
    check("a stranger previews the group behind the link", preview.status === 200 && preview.data.relation === "none" && preview.data.group.title === "Smoke crew 3" && preview.data.group.member_count === 2 && preview.data.group.avatar === "preset:rocket", JSON.stringify(preview.raw));
    const badJoin = await as(guestJar, () => call("POST", "/api/chat/invites/ZZZZ-ZZZZ-ZZZZ"));
    check("an unknown invite code -> 404", badJoin.status === 404);
    const join = await as(guestJar, () => call("POST", `/api/chat/invites/${link.data.code}`));
    check("joining via the link needs no friendship; plain members do not see the code", join.status === 201 && join.data.my_role === "member" && join.data.member_count === 3 && join.data.invite_code === null, JSON.stringify(join.raw).slice(0, 200));
    const joinAgain = await as(guestJar, () => call("POST", `/api/chat/invites/${link.data.code}`));
    check("joining twice just returns the chat", joinAgain.status === 200 && joinAgain.data.member_count === 3);
    const memberPreview = await as(guestJar, () => call("GET", `/api/chat/invites/${link.data.code}`));
    check("the preview says member afterwards", memberPreview.data.relation === "member");
    const memberLink = await as(guestJar, () => call("GET", `/api/chat/conversations/${gid}/invite`));
    check("a plain member cannot see the link -> 403", memberLink.status === 403);
    const reset = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/invite`));
    check("resetting gives a new code", reset.status === 201 && reset.data.code !== link.data.code);
    const oldCode = await as(guestJar, () => call("GET", `/api/chat/invites/${link.data.code}`));
    check("the old invite code stops working", oldCode.status === 404);
    const revoke = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}/invite`));
    check("revoking the link", revoke.status === 200 && revoke.data.code === null);
    const revokedJoin = await as(guestJar, () => call("GET", `/api/chat/invites/${reset.data.code}`));
    check("a revoked link -> 404", revokedJoin.status === 404);
    const adminKicksGuest = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${guestId}`));
    check("an admin removes a plain member", adminKicksGuest.status === 200 && adminKicksGuest.data.member_count === 2);
    // deliberate ownership transfer
    const noConfirm = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "owner" } }));
    check("transfer without typing the name -> 400 (tells which name)", noConfirm.status === 400 && noConfirm.raw.details?.confirm === "Admin User", JSON.stringify(noConfirm.raw));
    const wrongName = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "owner", confirm: "Someone Else" } }));
    check("transfer with the wrong name -> 400", wrongName.status === 400);
    const handover = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "owner", confirm: "admin user" } }));
    check("typing the name (case-insensitive) transfers ownership; the old owner becomes an admin", handover.status === 200 && handover.data.my_role === "admin" && handover.data.members.find((m) => m.id === adminId)?.role === "owner", JSON.stringify(handover.data?.members));
    const nOwner = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("the new owner is told", nOwner.data.items.some((n) => n.type === "chat_group" && n.entity_id === gid && /made you the owner/.test(n.title)));
    const exOwnerRoles = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "member" } }));
    check("the previous owner can no longer change roles -> 403", exOwnerRoles.status === 403);
    const back = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${userId}`, { body: { role: "owner", confirm: "Smoke User 2" } }));
    check("the new owner hands it back", back.status === 200 && back.data.my_role === "admin");
    const demote = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/members/${adminId}`, { body: { role: "member" } }));
    check("the owner demotes an admin", demote.status === 200 && demote.data.members.find((m) => m.id === adminId)?.role === "member");
    const trailRoles = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}/messages`));
    const roleEvents = trailRoles.data.filter((m) => m.kind === "system").map((m) => JSON.parse(m.body).event);
    check("system lines record admin, invite, joined and transfer events", ["admin", "invite_on", "joined", "invite_reset", "invite_off", "transferred", "unadmin"].every((e) => roleEvents.includes(e)), JSON.stringify(roleEvents));
    // disappearing messages
    const memberRetention = await as(adminJar, () => call("PUT", `/api/chat/conversations/${gid}/retention`, { body: { days: 7 } }));
    check("a plain member cannot set retention in a group -> 403", memberRetention.status === 403);
    const badDays = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/retention`, { body: { days: 3 } }));
    check("retention outside the choices -> 400", badDays.status === 400);
    const setRet = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/retention`, { body: { days: 7 } }));
    check("the owner sets disappearing messages (system line, nothing purged yet)", setRet.status === 200 && setRet.data.retention_days === 7 && JSON.parse(setRet.data.last_body).event === "retention");
    const retOff = await as(userJar, () => call("PUT", `/api/chat/conversations/${gid}/retention`, { body: { days: null } }));
    check("and turns them off again", retOff.status === 200 && retOff.data.retention_days === null);
    const directRet = await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/retention`, { body: { days: 365 } }));
    check("either person can set retention on a direct chat", directRet.status === 200 && directRet.data.retention_days === 365);
    await as(userJar, () => call("PUT", `/api/chat/conversations/${convoId}/retention`, { body: { days: null } }));
    const capUser = await as(userJar, () => call("PUT", "/api/chat/admin/settings", { body: { max_retention_days: 365 } }));
    check("a user cannot set the instance cap -> 403", capUser.status === 403);
    const badCap = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { max_retention_days: 2 } }));
    check("cap outside the choices -> 400", badCap.status === 400);
    const cap = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { max_retention_days: 365 } }));
    check("admin sets the instance cap", cap.status === 200 && cap.data.max_retention_days === 365 && typeof cap.data.purged === "number");
    const rowCap = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}`));
    check("conversations carry retention_cap", rowCap.data.retention_cap === 365);
    const capOff = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { max_retention_days: null } }));
    check("admin clears the cap", capOff.status === 200 && capOff.data.max_retention_days === null);
    const cronSweep = await call("GET", `/api/cron/reminders?key=${process.env.CRON_SECRET || "local-dev-secret"}`, { noAuth: true });
    check("the cron run also sweeps chat retention", cronSweep.status === 200 && typeof cronSweep.data.chat_purged === "number");
    // export
    const txt = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/export?format=txt`));
    const txtBody = Buffer.from(txt.raw).toString("utf8");
    check("export: transcript (.txt) as a download with messages and system lines", txt.status === 200 && /^text\/plain/.test(txt.headers.get("content-type")) && /attachment; filename="chat-smoke-crew-3-/.test(txt.headers.get("content-disposition")) && /standup in 5/.test(txtBody) && /joined using the invite link/.test(txtBody) && /\(message deleted\)/.test(txtBody), txtBody.slice(0, 300));
    const js = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/export?format=json`));
    const jsBody = js.raw; // application/json, so call() already parsed it
    check("export: JSON with conversation, members and messages", js.status === 200 && jsBody.conversation.id === gid && jsBody.members.length === 2 && jsBody.messages.some((m) => /standup in 5/.test(m.body)), JSON.stringify(jsBody).slice(0, 200));
    const zip = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/export?format=zip`));
    const zipBuf = Buffer.from(zip.raw);
    check("export: ZIP with transcript.txt and messages.json (valid local header and end record)", zip.status === 200 && zip.headers.get("content-type") === "application/zip" && zipBuf.readUInt32LE(0) === 0x04034b50 && zipBuf.readUInt32LE(zipBuf.length - 22) === 0x06054b50 && zipBuf.includes(Buffer.from("transcript.txt")) && zipBuf.includes(Buffer.from("messages.json")), `${zipBuf.length} bytes`);
    const strangerExport = await as(guestJar, () => call("GET", `/api/chat/conversations/${gid}/export?format=txt`));
    check("export of a chat you are not in -> 404", strangerExport.status === 404);
    // reports and moderation
    const reportable = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "something reportable" } }));
    const selfReport = await as(userJar, () => call("POST", `/api/chat/messages/${reportable.data.id}/report`, { body: { reason: "meh" } }));
    check("you cannot report your own message -> 400", selfReport.status === 400);
    const noReason = await as(adminJar, () => call("POST", `/api/chat/messages/${reportable.data.id}/report`, { body: { reason: " " } }));
    check("a report needs a reason -> 400", noReason.status === 400);
    const report = await as(adminJar, () => call("POST", `/api/chat/messages/${reportable.data.id}/report`, { body: { reason: "Spam" } }));
    check("POST /api/chat/messages/:id/report -> 201", report.status === 201 && report.data.status === "open", JSON.stringify(report.raw));
    const dupReport = await as(adminJar, () => call("POST", `/api/chat/messages/${reportable.data.id}/report`, { body: { reason: "Spam again" } }));
    check("reporting twice -> 409", dupReport.status === 409);
    const strangerReport = await as(guestJar, () => call("POST", `/api/chat/messages/${reportable.data.id}/report`, { body: { reason: "x" } }));
    check("reporting a message in a chat you are not in -> 404", strangerReport.status === 404);
    const userMod = await as(userJar, () => call("GET", "/api/chat/admin/overview"));
    check("moderation is admin-only -> 403", userMod.status === 403);
    const overview = await as(adminJar, () => call("GET", "/api/chat/admin/overview"));
    const ovRow = overview.data?.conversations.find((c) => c.id === gid);
    check("GET /api/chat/admin/overview: sizes and members, never message text", overview.status === 200 && overview.data.totals.open_reports >= 1 && ovRow && ovRow.kind === "group" && ovRow.member_count === 2 && ovRow.open_reports === 1 && ovRow.message_count > 0 && /Smoke User 2/.test(ovRow.members) && !JSON.stringify(overview.data).includes("something reportable"), JSON.stringify(ovRow));
    const statsMod = await as(adminJar, () => call("GET", "/api/stats"));
    check("stats.counts.moderation counts open reports for admins", Number(statsMod.data.counts.moderation) >= 1);
    const statsUser = await as(userJar, () => call("GET", "/api/stats"));
    check("users do not get the moderation count", statsUser.data.counts.moderation === undefined);
    const reports = await as(adminJar, () => call("GET", "/api/chat/admin/reports"));
    const rep = reports.data?.find((r) => r.id === report.data.id);
    check("GET /api/chat/admin/reports shows the snapshot", reports.status === 200 && rep && rep.snapshot.body === "something reportable" && rep.snapshot.sender_name === "Smoke User 2" && rep.snapshot.reporter_name === "Admin User" && rep.reason === "Spam" && rep.conversation_title === "Smoke crew 3", JSON.stringify(rep));
    const badAction = await as(adminJar, () => call("PUT", `/api/chat/admin/reports/${rep.id}`, { body: { action: "ban" } }));
    check("unknown report action -> 400", badAction.status === 400);
    const acted = await as(adminJar, () => call("PUT", `/api/chat/admin/reports/${rep.id}`, { body: { action: "delete_message" } }));
    check("delete_message resolves the report", acted.status === 200 && acted.data.status === "actioned");
    const goneMsg = (await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/messages`))).data.find((m) => m.id === reportable.data.id);
    check("the reported message is deleted for everyone", Boolean(goneMsg?.deleted_at) && goneMsg.body === "");
    const nMod = await as(userJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("the sender gets a chat_moderation notification", nMod.data.items.some((n) => n.type === "chat_moderation" && n.entity_id === gid));
    const again = await as(adminJar, () => call("PUT", `/api/chat/admin/reports/${rep.id}`, { body: { action: "dismiss" } }));
    check("acting on a resolved report -> 400", again.status === 400);
    const resolvedList = await as(adminJar, () => call("GET", "/api/chat/admin/reports?status=resolved"));
    check("resolved reports list who resolved them", resolvedList.data.some((r) => r.id === rep.id && r.status === "actioned" && r.resolved_by_name === "Admin User"));
    const fine = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "fine really" } }));
    const rep2 = await as(adminJar, () => call("POST", `/api/chat/messages/${fine.data.id}/report`, { body: { reason: "Not sure" } }));
    const dismissed = await as(adminJar, () => call("PUT", `/api/chat/admin/reports/${rep2.data.id}`, { body: { action: "dismiss" } }));
    const fineRow = (await as(userJar, () => call("GET", `/api/chat/conversations/${gid}/messages`))).data.find((m) => m.id === fine.data.id);
    check("dismiss keeps the message", dismissed.status === 200 && dismissed.data.status === "dismissed" && fineRow && !fineRow.deleted_at);
    const admExport = await as(adminJar, () => call("GET", `/api/chat/admin/conversations/${gid}/export?format=json`));
    const admJson = admExport.raw;
    check("admin export of any conversation", admExport.status === 200 && admJson.conversation.id === gid && admJson.messages.length > 0 && admJson.members.length === 2);
    const admRet = await as(adminJar, () => call("PUT", `/api/chat/admin/conversations/${gid}/retention`, { body: { days: 90 } }));
    const rowAdmRet = await as(userJar, () => call("GET", `/api/chat/conversations/${gid}`));
    check("admin sets a conversation's retention from outside it", admRet.status === 200 && admRet.data.retention_days === 90 && rowAdmRet.data.retention_days === 90 && JSON.parse(rowAdmRet.data.last_body).by_admin === true);
    await as(adminJar, () => call("PUT", `/api/chat/admin/conversations/${gid}/retention`, { body: { days: null } }));
    const doomed = await as(userJar, () => call("POST", "/api/chat/groups", { body: { title: "Doomed", member_ids: [adminId] } }));
    const admDelete = await as(adminJar, () => call("DELETE", `/api/chat/admin/conversations/${doomed.data.id}`));
    const doomedGone = await as(userJar, () => call("GET", `/api/chat/conversations/${doomed.data.id}`));
    check("admin deletes a whole conversation", admDelete.status === 200 && admDelete.data.deleted === true && doomedGone.status === 404);
    const admDeleteMissing = await as(adminJar, () => call("DELETE", `/api/chat/admin/conversations/${doomed.data.id}`));
    check("deleting it again -> 404", admDeleteMissing.status === 404);
  // voice / video calls: ring, accept / decline, signal relay, call lines, missed-call notifications, ICE settings
  {
    const cookieOf = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
    const openStream = async (j) => {
      const ctrl = new AbortController();
      const res = await fetch(`${BASE}/api/chat/stream`, { headers: { cookie: cookieOf(j) }, signal: ctrl.signal });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let pending = null;
      const read = () => (pending ??= reader.read().then((r) => { pending = null; return r; }));
      const next = async (name, timeoutMs = 8000) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          const re = new RegExp(`event: ${name}\\ndata: (.*)\\n`);
          const m = buf.match(re);
          if (m) { buf = buf.slice(0, m.index) + buf.slice(m.index + m[0].length); return JSON.parse(m[1]); } // take just this event; others stay for later waits
          const left = until - Date.now();
          if (left <= 0) return null;
          const r = await Promise.race([read(), new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), left))]);
          if (r.timeout) return null;
          if (r.done) return null;
          buf += dec.decode(r.value, { stream: true });
        }
      };
      return { next, close: () => ctrl.abort() };
    };
    const adminStream = await openStream(adminJar);
    const userStream = await openStream(userJar);
    await adminStream.next("hello", 5000);
    await userStream.next("hello", 5000);
    const noConvo = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: 999999 } }));
    check("call in an unknown chat -> 404", noConvo.status === 404);
    const c1 = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: convoId, kind: "audio" } }));
    check("POST /api/chat/calls -> 201 ringing voice call with the peer", c1.status === 201 && c1.data.status === "ringing" && c1.data.kind === "audio" && c1.data.callee_id === adminId && c1.data.peer?.id === adminId, JSON.stringify(c1.raw).slice(0, 200));
    const ring = await adminStream.next("call");
    check("the other person's live stream rings (call event with the caller)", ring?.action === "ring" && ring.call?.id === c1.data.id && ring.from?.name === "Smoke User 2", JSON.stringify(ring));
    const nRing = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("a chat_call bell entry says who is calling", nRing.data.items.some((n) => n.type === "chat_call" && n.entity_id === convoId && /is calling you/.test(n.title)));
    check("…and links to the call, for the banner to open", nRing.data.items.some((n) => n.type === "chat_call" && n.href === `/chat?c=${convoId}&call=${c1.data.id}`));
    const incoming = await as(adminJar, () => call("GET", "/api/chat/calls/incoming"));
    check("GET /api/chat/calls/incoming: an app opened after the ring still finds the call", incoming.status === 200 && incoming.data.call?.id === c1.data.id && incoming.data.from?.name === "Smoke User 2" && incoming.data.ms_left > 0 && incoming.data.ms_left <= 45000, JSON.stringify(incoming.raw).slice(0, 200));
    check("the caller is not rung by their own call", (await as(userJar, () => call("GET", "/api/chat/calls/incoming"))).data.call === null);
    const busy = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: convoId, kind: "video" } }));
    check("a second call while one rings -> 409", busy.status === 409);
    const busyOther = await as(adminJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: convoId } }));
    check("the person being called cannot start another call -> 409", busyOther.status === 409);
    const earlySignal = await as(userJar, () => call("POST", `/api/chat/calls/${c1.data.id}/signal`, { body: { signal: { type: "offer", sdp: "v=0" } } }));
    check("signals before the call is accepted -> 409", earlySignal.status === 409);
    const wrongAccept = await as(userJar, () => call("POST", `/api/chat/calls/${c1.data.id}/accept`));
    check("the caller cannot accept their own call -> 403", wrongAccept.status === 403);
    const declined = await as(adminJar, () => call("POST", `/api/chat/calls/${c1.data.id}/decline`));
    check("the callee declines -> status declined", declined.status === 200 && declined.data.status === "declined");
    const endedEv = await userStream.next("call");
    check("the caller's stream gets the end event", endedEv?.action === "ended" && endedEv.status === "declined" && endedEv.call_id === c1.data.id, JSON.stringify(endedEv));
    const lineDeclined = await userStream.next("message");
    check("a 'call' line lands in the chat for both sides", lineDeclined?.message?.kind === "call" && JSON.parse(lineDeclined.message.body).status === "declined" && lineDeclined.message.sender_id === userId, String(JSON.stringify(lineDeclined?.message)).slice(0, 200));
    await adminStream.next("call"); await adminStream.next("message");
    const nAfterDecline = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("declining removes the 'is calling you' entry", !nAfterDecline.data.items.some((n) => n.type === "chat_call" && n.entity_id === convoId && /is calling you/.test(n.title)));
    // a full video call: accept, offer / answer / candidate relay, hang up
    const c2 = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: convoId, kind: "video" } }));
    check("a video call rings", c2.status === 201 && c2.data.kind === "video");
    await adminStream.next("call");
    const accepted = await as(adminJar, () => call("POST", `/api/chat/calls/${c2.data.id}/accept`));
    check("the callee accepts -> active with answered_at", accepted.status === 200 && accepted.data.status === "active" && Boolean(accepted.data.answered_at));
    const accEv = await userStream.next("call");
    check("the caller's stream gets 'accepted'", accEv?.action === "accepted" && accEv.by === adminId, JSON.stringify(accEv));
    await adminStream.next("call");
    const offer = await as(userJar, () => call("POST", `/api/chat/calls/${c2.data.id}/signal`, { body: { signal: { type: "offer", sdp: "v=0 offer" } } }));
    const offerEv = await adminStream.next("call");
    check("an offer is relayed to the callee untouched", offer.status === 200 && offerEv?.action === "signal" && offerEv.signal.type === "offer" && offerEv.signal.sdp === "v=0 offer" && offerEv.from === userId, JSON.stringify(offerEv));
    await as(adminJar, () => call("POST", `/api/chat/calls/${c2.data.id}/signal`, { body: { signal: { type: "answer", sdp: "v=0 answer" } } }));
    const answerEv = await userStream.next("call");
    check("an answer is relayed to the caller", answerEv?.signal?.type === "answer" && answerEv.signal.sdp === "v=0 answer");
    await as(adminJar, () => call("POST", `/api/chat/calls/${c2.data.id}/signal`, { body: { signal: { type: "candidate", candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 5000 typ host", sdpMid: "0" } } } }));
    const candEv = await userStream.next("call");
    check("ICE candidates are relayed", candEv?.signal?.type === "candidate" && candEv.signal.candidate.sdpMid === "0");
    const badSignal = await as(adminJar, () => call("POST", `/api/chat/calls/${c2.data.id}/signal`, { body: { signal: { type: "bye" } } }));
    check("unknown signal type -> 400", badSignal.status === 400);
    const stranger = await as(guestJar, () => call("POST", `/api/chat/calls/${c2.data.id}/signal`, { body: { signal: { type: "answer", sdp: "x" } } }));
    check("someone outside the call cannot signal -> 404", stranger.status === 404);
    const hung = await as(userJar, () => call("POST", `/api/chat/calls/${c2.data.id}/end`, { body: {} }));
    check("hanging up an active call -> ended with ended_at", hung.status === 200 && hung.data.status === "ended" && Boolean(hung.data.ended_at));
    const endEv2 = await adminStream.next("call");
    check("the callee's stream gets 'ended' with the duration", endEv2?.action === "ended" && endEv2.status === "ended" && typeof endEv2.duration === "number");
    await adminStream.next("message"); await userStream.next("call"); await userStream.next("message");
    const again = await as(userJar, () => call("POST", `/api/chat/calls/${c2.data.id}/end`, { body: {} }));
    check("ending it twice is harmless", again.status === 200 && again.data.status === "ended");
    const callRow = (await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`))).data.filter((m) => m.kind === "call").pop();
    check("the chat holds a call line { kind: video, status: ended, duration }", callRow && JSON.parse(callRow.body).kind === "video" && JSON.parse(callRow.body).status === "ended" && typeof JSON.parse(callRow.body).duration === "number");
    const replyCall = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "?", reply_to: callRow.id } }));
    check("call lines cannot be replied to -> 400", replyCall.status === 400);
    const fwdCall = await as(adminJar, () => call("POST", `/api/chat/messages/${callRow.id}/forward`, { body: { conversation_ids: [gid] } }));
    check("call lines cannot be forwarded -> 400", fwdCall.status === 400);
    // no answer: the caller gives up while it rings -> missed for the other person, with a bell entry and an unread mark
    const unreadBeforeMissed = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId)?.unread ?? 0;
    const c3 = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: convoId, kind: "audio" } }));
    await adminStream.next("call");
    const gaveUp = await as(userJar, () => call("POST", `/api/chat/calls/${c3.data.id}/end`, { body: { reason: "timeout" } }));
    check("the caller giving up while ringing -> missed", gaveUp.status === 200 && gaveUp.data.status === "missed");
    await adminStream.next("call"); await adminStream.next("message"); await userStream.next("call"); await userStream.next("message");
    const nMissed = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("a missed call raises 'Missed voice call from …'", nMissed.data.items.some((n) => n.type === "chat_call" && n.entity_id === convoId && /Missed voice call from Smoke User 2/.test(n.title)));
    check("…and after that nothing rings", (await as(adminJar, () => call("GET", "/api/chat/calls/incoming"))).data.call === null);
    const rowMissed = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
    check("a missed call counts as unread for the person who missed it, ended calls do not", rowMissed.unread === unreadBeforeMissed + 1 && rowMissed.last_kind === "call", JSON.stringify({ unread: rowMissed.unread, before: unreadBeforeMissed }));
    const ice = await as(userJar, () => call("GET", "/api/chat/calls/ice"));
    check("GET /api/chat/calls/ice lists public STUN servers", ice.status === 200 && Array.isArray(ice.data.iceServers) && JSON.stringify(ice.data.iceServers).includes("stun:"));
    const badTurn = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { turn_url: "https://not-a-turn" } }));
    check("a TURN URL must start with turn: -> 400", badTurn.status === 400);
    const turnOn = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { turn_url: "turn:turn.example.com:3478", turn_username: "smoke", turn_credential: "secret-cred" } }));
    check("admin adds a TURN server (credential never echoed)", turnOn.status === 200 && turnOn.data.turn_url === "turn:turn.example.com:3478" && turnOn.data.turn_credential_set === true && !JSON.stringify(turnOn.raw).includes("secret-cred"));
    const iceTurn = await as(userJar, () => call("GET", "/api/chat/calls/ice"));
    check("callers then get the TURN server with its credential", iceTurn.data.iceServers.some((s) => s.urls === "turn:turn.example.com:3478" && s.username === "smoke" && s.credential === "secret-cred"));
    const turnOff = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { turn_url: "" } }));
    check("admin removes the TURN server", turnOff.status === 200 && turnOff.data.turn_url === null && turnOff.data.turn_credential_set === false);

    // Cloudflare TURN: the portal asks for short-lived credentials per account. A local stand-in plays Cloudflare (accepted outside production only).
    {
      const asked = [];
      const http = await import("node:http");
      const fake = http.createServer((req, res) => {
        let raw = ""; req.on("data", (c) => (raw += c));
        req.on("end", () => {
          asked.push({ url: req.url, auth: req.headers.authorization, body: raw });
          if (req.headers.authorization !== "Bearer smoke-cf-token") { res.statusCode = 401; return res.end("{}"); }
          res.statusCode = 201; res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: `u-${asked.length}`, credential: "short-lived" }] }));
        });
      });
      await new Promise((r) => fake.listen(0, "127.0.0.1", r));
      const fakeBase = `http://127.0.0.1:${fake.address().port}`;
      const badKey = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { cf_turn_key_id: "no spaces allowed" } }));
      check("a Cloudflare TURN key ID that cannot be one -> 400", badKey.status === 400);
      const testEarly = await as(adminJar, () => call("POST", "/api/chat/admin/settings/turn-test"));
      check("testing without a saved key -> 400", testEarly.status === 400);
      const cfOn = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { cf_turn_key_id: "smokekey0123456789abcdef", cf_turn_token: "smoke-cf-token", cf_turn_api: fakeBase } }));
      check("admin saves a Cloudflare TURN key (the token is never echoed)", cfOn.status === 200 && cfOn.data.turn_mode === "cloudflare" && cfOn.data.cf_turn_key_id === "smokekey0123456789abcdef" && cfOn.data.cf_turn_token_set === true && !JSON.stringify(cfOn.data).includes("smoke-cf-token"), JSON.stringify(cfOn.data).slice(0, 200));
      const userTest = await as(userJar, () => call("POST", "/api/chat/admin/settings/turn-test"));
      check("only an administrator may test the key -> 403", userTest.status === 403);
      const cfTest = await as(adminJar, () => call("POST", "/api/chat/admin/settings/turn-test"));
      check("the test asks Cloudflare for one-minute credentials and reports the relay addresses, not the credentials", cfTest.status === 200 && cfTest.data.ok === true && cfTest.data.urls.some((u) => u.startsWith("turn:")) && !JSON.stringify(cfTest.data).includes("short-lived") && JSON.parse(asked.at(-1).body).ttl === 60 && asked.at(-1).url === "/v1/turn/keys/smokekey0123456789abcdef/credentials/generate-ice-servers", JSON.stringify(cfTest.raw).slice(0, 200));
      const before = asked.length;
      const cfIce = await as(userJar, () => call("GET", "/api/chat/calls/ice"));
      const relay = cfIce.data.iceServers?.find((x) => x.username);
      check("a call gets STUN plus Cloudflare's relay with credentials of its own", cfIce.status === 200 && cfIce.data.relay === "cloudflare" && relay?.credential === "short-lived" && relay.urls.includes("turns:turn.cloudflare.com:443?transport=tcp") && JSON.stringify(cfIce.data.iceServers).includes("stun.l.google.com"), JSON.stringify(cfIce.data).slice(0, 240));
      check("…without the port 53 addresses browsers block", !JSON.stringify(cfIce.data.iceServers).includes(":53"));
      check("…asked for with a lifetime of hours, not days", asked.length === before + 1 && JSON.parse(asked.at(-1).body).ttl >= 3600 && JSON.parse(asked.at(-1).body).ttl <= 86400);
      const cfIceAgain = await as(userJar, () => call("GET", "/api/chat/calls/ice"));
      check("asking again within minutes reuses them (no second request to Cloudflare)", cfIceAgain.data.iceServers?.find((x) => x.username)?.username === relay?.username && asked.length === before + 1);
      const cfIceAdmin = await as(adminJar, () => call("GET", "/api/chat/calls/ice"));
      check("another account gets credentials of its own", cfIceAdmin.data.iceServers?.find((x) => x.username)?.username !== relay?.username && asked.length === before + 2);
      const wrongToken = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { cf_turn_token: "wrong" } }));
      const cfTestBad = await as(adminJar, () => call("POST", "/api/chat/admin/settings/turn-test"));
      check("a refused token: the test says so -> 502", wrongToken.status === 200 && cfTestBad.status === 502 && /refused/i.test(cfTestBad.raw?.error ?? ""), JSON.stringify(cfTestBad.raw));
      const cfIceBad = await as(userJar, () => call("GET", "/api/chat/calls/ice"));
      check("…and calls fall back to STUN instead of failing", cfIceBad.status === 200 && cfIceBad.data.iceServers.length === 1 && !cfIceBad.data.iceServers[0].username);
      const cfOff = await as(adminJar, () => call("PUT", "/api/chat/admin/settings", { body: { cf_turn_key_id: "", cf_turn_api: "" } }));
      check("removing the key ID removes the token with it", cfOff.status === 200 && cfOff.data.turn_mode === null && cfOff.data.cf_turn_token_set === false);
      fake.close();
    }
    // group calls: everyone is rung, people join and leave, the last one out ends it
    const gStart = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: gid, kind: "video" } }));
    check("a group call starts active with the starter in it", gStart.status === 201 && gStart.data.group === true && gStart.data.status === "active" && gStart.data.participants.length === 1 && gStart.data.participants[0].id === userId && gStart.data.title === "Smoke crew 3", JSON.stringify(gStart.raw).slice(0, 220));
    const gRing = await adminStream.next("call");
    check("members are rung with the group's name", gRing?.action === "ring" && gRing.call?.group === true && gRing.conversation_title === "Smoke crew 3", JSON.stringify(gRing));
    const gStarted = await adminStream.next("call");
    check("…and get a 'started' event", gStarted?.action === "started" && gStarted.call_id === gStart.data.id, JSON.stringify(gStarted));
    await userStream.next("call");
    const rowCall = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === gid);
    check("the group row carries active_call { kind, group, count }", rowCall?.active_call?.id === gStart.data.id && rowCall.active_call.kind === "video" && rowCall.active_call.group === true && rowCall.active_call.count === 1, JSON.stringify(rowCall?.active_call));
    const gAgain = await as(adminJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: gid } }));
    check("starting a second call in the group -> 409 with the running call id", gAgain.status === 409 && gAgain.raw.details?.call_id === gStart.data.id, JSON.stringify(gAgain.raw));
    const nGroupCall = await as(adminJar, () => call("GET", "/api/notifications?unread=1&limit=30"));
    check("a 'started a video call in' bell entry", nGroupCall.data.items.some((n) => n.type === "chat_call" && n.entity_id === gid && /started a video call in/.test(n.title)));
    const gIncoming = await as(adminJar, () => call("GET", "/api/chat/calls/incoming"));
    check("a group call is found by members who open the app late, with the group's name", gIncoming.data.call?.id === gStart.data.id && gIncoming.data.call.group === true && typeof gIncoming.data.conversation_title === "string");
    const acceptGroup = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/accept`));
    check("/accept is for direct calls -> 400", acceptGroup.status === 400);
    const gJoin = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/join`));
    check("joining lists who is already in the call", gJoin.status === 200 && gJoin.data.participants.length === 2 && gJoin.data.participants.some((p) => p.id === userId), JSON.stringify(gJoin.raw).slice(0, 200));
    const gJoined = await userStream.next("call");
    check("the starter's stream gets participant_joined", gJoined?.action === "participant_joined" && gJoined.user?.id === adminId && gJoined.count === 2, JSON.stringify(gJoined));
    await adminStream.next("call");
    const noTo = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/signal`, { body: { signal: { type: "offer", sdp: "v=0" } } }));
    check("group signals need a target -> 400", noTo.status === 400);
    const toStranger = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/signal`, { body: { to: 999999, signal: { type: "offer", sdp: "v=0" } } }));
    check("signalling someone outside the call -> 404", toStranger.status === 404);
    const gOffer = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/signal`, { body: { to: userId, signal: { type: "offer", sdp: "v=0 group" } } }));
    const gOfferEv = await userStream.next("call");
    check("a targeted offer reaches that person", gOffer.status === 200 && gOffer.data.to === userId && gOfferEv?.action === "signal" && gOfferEv.from === adminId && gOfferEv.signal.sdp === "v=0 group", JSON.stringify(gOfferEv));
    const gLeave = await as(adminJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/leave`));
    check("leaving keeps the call on for the others", gLeave.status === 200 && gLeave.data.status === "active" && gLeave.data.participants.length === 1, JSON.stringify(gLeave.raw).slice(0, 160));
    const gLeft = await userStream.next("call");
    check("the others get participant_left", gLeft?.action === "participant_left" && gLeft.user_id === adminId && gLeft.count === 1, JSON.stringify(gLeft));
    await adminStream.next("call");
    const gEnd = await as(userJar, () => call("POST", `/api/chat/calls/${gStart.data.id}/leave`));
    check("the last one out ends the group call", gEnd.status === 200 && gEnd.data.status === "ended");
    const gEndEv = await adminStream.next("call");
    check("every member gets 'ended'", gEndEv?.action === "ended" && gEndEv.status === "ended", JSON.stringify(gEndEv));
    await userStream.next("call"); await userStream.next("message"); await adminStream.next("message");
    const gLine = (await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}/messages`))).data.filter((m) => m.kind === "call").pop();
    check("the group chat line says it was a group call with 2 joined", gLine && JSON.parse(gLine.body).group === true && JSON.parse(gLine.body).joined === 2 && JSON.parse(gLine.body).status === "ended", gLine?.body);
    const rowAfter = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === gid);
    check("active_call clears when the call ends", rowAfter?.active_call === null);
    const gSolo = await as(userJar, () => call("POST", "/api/chat/calls", { body: { conversation_id: gid, kind: "audio" } }));
    await adminStream.next("call"); await adminStream.next("call"); await userStream.next("call");
    const gIgnore = await as(adminJar, () => call("POST", `/api/chat/calls/${gSolo.data.id}/decline`));
    check("ignoring a group call does not end it", gIgnore.status === 200 && gIgnore.data.status === "active");
    const gSoloEnd = await as(userJar, () => call("POST", `/api/chat/calls/${gSolo.data.id}/end`, { body: {} }));
    check("a group call nobody joined ends as 'missed'", gSoloEnd.status === 200 && gSoloEnd.data.status === "missed");
    await adminStream.next("call"); await adminStream.next("message"); await userStream.next("call"); await userStream.next("message");
    adminStream.close();
    userStream.close();

    // the bell on the live stream (what the Android app turns into phone notifications), passive connections, the bell-only stream
    const openAt = async (j, path) => {
      const ctrl = new AbortController();
      const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookieOf(j) }, signal: ctrl.signal });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let pending = null;
      const read = () => (pending ??= reader.read().then((r) => { pending = null; return r; }));
      const next = async (name, timeoutMs = 8000) => {
        const until = Date.now() + timeoutMs;
        for (;;) {
          const m = buf.match(new RegExp(`event: ${name}\\ndata: (.*)\\n`));
          if (m) { buf = buf.slice(0, m.index) + buf.slice(m.index + m[0].length); return JSON.parse(m[1]); }
          const left = until - Date.now();
          if (left <= 0) return null;
          const r = await Promise.race([read(), new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), left))]);
          if (r.timeout || r.done) return null;
          buf += dec.decode(r.value, { stream: true });
        }
      };
      return { status: res.status, type: res.headers.get("content-type") ?? "", next, close: () => ctrl.abort() };
    };
    // presence is checked on the run's own account: the demo admin may really be online somewhere (a phone signed in to this server)
    const peerOnline = async () => (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId)?.online;
    const passiveUser = await openAt(userJar, "/api/chat/stream?passive=1");
    await passiveUser.next("hello", 5000);
    check("a passive stream (an app in the background) does not show its account as online", (await peerOnline()) === false);
    const passive = await openAt(adminJar, "/api/chat/stream?passive=1");
    await passive.next("hello", 5000);
    const bellOnly = await openAt(adminJar, "/api/notifications/stream");
    check("GET /api/notifications/stream is an event stream that says hello", bellOnly.status === 200 && bellOnly.type.includes("text/event-stream") && (await bellOnly.next("hello", 5000))?.ok === true);
    // a reaction is a notification that leaves no message behind (the history counts further down stay what they were)
    const mineMsg = (await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages?limit=100`))).data.filter((m) => m.sender_id === adminId && m.kind === "text" && !m.deleted_at).at(-1);
    const spoken = await as(userJar, () => call("POST", `/api/chat/messages/${mineMsg.id}/reactions`, { body: { emoji: "🙏" } }));
    const bellEv = await passive.next("notification");
    check("a new notification arrives on the live stream as a 'notification' event", spoken.status === 200 && bellEv?.notification?.type === "chat_reaction" && bellEv.notification.category === "chat" && bellEv.notification.id > 0 && /reacted/.test(bellEv.notification.title) && bellEv.notification.href === `/chat?c=${convoId}`, JSON.stringify(bellEv));
    const bellEv2 = await bellOnly.next("notification");
    check("…and on the bell-only stream, which carries nothing else", bellEv2?.notification?.id === bellEv?.notification?.id && (await bellOnly.next("message", 600)) === null, JSON.stringify(bellEv2));
    check("the passive stream still gets the chat events", (await passive.next("reaction", 3000))?.message_id === mineMsg.id);
    const visible = await openAt(userJar, "/api/chat/stream");
    await visible.next("hello", 5000);
    check("an ordinary stream next to it does show the account as online", (await peerOnline()) === true);
    visible.close(); passive.close(); passiveUser.close(); bellOnly.close();
    const anonBell = await fetch(`${BASE}/api/notifications/stream`);
    check("the bell-only stream needs a session -> 401", anonBell.status === 401);
    await as(userJar, () => call("POST", `/api/chat/messages/${mineMsg.id}/reactions`, { body: { emoji: "🙏" } })); // toggled off again
    if (bellEv?.notification?.id) await as(adminJar, () => call("DELETE", `/api/notifications/${bellEv.notification.id}`));
  }
    const bellMod = await as(adminJar, () => call("GET", "/api/notifications?limit=50"));
    for (const n of bellMod.data.items.filter((x) => x.type === "chat_group" && x.entity_id === gid)) await as(adminJar, () => call("DELETE", `/api/notifications/${n.id}`));
    const rmGuest = await as(adminJar, () => call("DELETE", `/api/users/${guestId}`));
    check("the guest account is removed again", rmGuest.status === 200);
  }
  const cannotRemove = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${userId}`));
  check("a plain member cannot remove people -> 403", cannotRemove.status === 403);
  const selfRemove = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${userId}`));
  check("the owner cannot remove themselves (leave instead) -> 400", selfRemove.status === 400);
  const removed = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${adminId}`));
  check("the owner removes a member", removed.status === 200 && removed.data.member_count === 1);
  const outside = await as(adminJar, () => call("POST", `/api/chat/conversations/${gid}/messages`, { body: { body: "still here?" } }));
  check("a removed member cannot post -> 404", outside.status === 404);
  const readd = await as(userJar, () => call("POST", `/api/chat/conversations/${gid}/members`, { body: { user_ids: [adminId] } }));
  check("a member can be added back", readd.status === 201 && readd.data.member_count === 2);
  const ownerLeaves = await as(userJar, () => call("DELETE", `/api/chat/conversations/${gid}`));
  check("the owner leaves", ownerLeaves.status === 200 && ownerLeaves.data.left === true);
  const heir = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}`));
  check("the group passes to the remaining member", heir.status === 200 && heir.data.my_role === "owner" && heir.data.member_count === 1);
  const trail = await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}/messages`));
  const events = trail.data.filter((m) => m.kind === "system").map((m) => JSON.parse(m.body).event);
  check("system lines record the story", ["created", "added", "renamed", "removed", "added", "left", "owner"].every((e) => events.includes(e)), JSON.stringify(events));
  const lastLeaves = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${gid}`));
  check("the last member leaving deletes the group", lastLeaves.status === 200 && lastLeaves.data.deleted === true && (await as(adminJar, () => call("GET", `/api/chat/conversations/${gid}`))).status === 404);
  const leaveUnknown = await as(userJar, () => call("DELETE", "/api/chat/conversations/999999"));
  check("leaving or deleting a chat you are not in -> 404", leaveUnknown.status === 404);

  // live stream says hello
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/api/chat/stream`, { headers: { cookie: Object.entries(userJar).map(([k, v]) => `${k}=${v}`).join("; ") }, signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const { value } = await reader.read();
    let buf = dec.decode(value);
    check("GET /api/chat/stream is an event stream that says hello", res.headers.get("content-type")?.includes("text/event-stream") && buf.includes("event: hello"));
    // typing pings from the other side arrive on this stream
    const typed = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/typing`, { body: { typing: true } }));
    check("POST /api/chat/conversations/:id/typing -> 200", typed.status === 200 && typed.data.typing === true);
    const deadline = Date.now() + 4000;
    while (!/event: typing/.test(buf) && Date.now() < deadline) {
      const r = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true }), Math.max(0, deadline - Date.now())))]);
      if (r.done) break;
      buf += dec.decode(r.value);
    }
    const typingLine = buf.split("\n").find((l) => l.startsWith("data:") && /"type":"typing"/.test(l));
    const typingEv = typingLine ? JSON.parse(typingLine.slice(5)) : null;
    check("typing events reach the other member's stream with the typer's name", typingEv?.typing === true && typingEv?.user_id === adminId && typingEv?.name === "Admin User" && typingEv?.conversation_id === convoId, buf.slice(0, 300));
    await as(adminJar, () => call("POST", `/api/chat/messages/${m2.data.id}/reactions`, { body: { emoji: "🎉" } }));
    const deadline2 = Date.now() + 4000;
    while (!/"type":"reaction"/.test(buf) && Date.now() < deadline2) {
      const r = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true }), Math.max(0, deadline2 - Date.now())))]);
      if (r.done) break;
      buf += dec.decode(r.value);
    }
    const reactionLine = buf.split("\n").find((l) => l.startsWith("data:") && /"type":"reaction"/.test(l));
    const reactionEv = reactionLine ? JSON.parse(reactionLine.slice(5)) : null;
    check("reaction events reach the other member's stream", reactionEv?.message_id === m2.data.id && reactionEv?.reactions?.[0]?.emoji === "🎉");
    await as(adminJar, () => call("PUT", `/api/chat/messages/${m2.data.id}`, { body: { body: "Hi back (edited)" } }));
    const deadline3 = Date.now() + 4000;
    while (!/"type":"message_updated"/.test(buf) && Date.now() < deadline3) {
      const r = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve({ done: true }), Math.max(0, deadline3 - Date.now())))]);
      if (r.done) break;
      buf += dec.decode(r.value);
    }
    const updLine = buf.split("\n").find((l) => l.startsWith("data:") && /"type":"message_updated"/.test(l));
    const updEv = updLine ? JSON.parse(updLine.slice(5)) : null;
    check("edits reach the other member's stream as message_updated", updEv?.message?.id === m2.data.id && updEv?.message?.body === "Hi back (edited)" && Boolean(updEv?.message?.edited_at));
    ctrl.abort();
  } catch (e) {
    check("GET /api/chat/stream is an event stream that says hello", false, e.message);
  } finally {
    clearTimeout(timer);
  }
  const typingElsewhere = await as(userJar, () => call("POST", "/api/chat/conversations/999999/typing", { body: { typing: true } }));
  check("typing in a conversation you are not in -> 404", typingElsewhere.status === 404);
  const anonStream = await fetch(`${BASE}/api/chat/stream`);
  check("stream requires a session", anonStream.status === 401);
  await anonStream.body?.cancel();

  // block / unblock
  const block = await as(adminJar, () => call("POST", `/api/chat/friends/${userId}/block`));
  check("admin blocks the user", block.status === 200 && block.data.blocked.some((u) => u.id === userId) && block.data.friends.every((u) => u.id !== userId));
  const blockedMsg = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "still there?" } }));
  check("blocked user cannot message -> 403", blockedMsg.status === 403);
  const blockedReq = await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  check("blocked user cannot send a request -> 403", blockedReq.status === 403);
  const hidden = await as(userJar, () => call("GET", `/api/chat/friends/lookup?code=${adminCode}`));
  check("lookup says unavailable to the blocked side", hidden.data.relation === "unavailable");
  const stillListed = await as(userJar, () => call("GET", "/api/chat/conversations"));
  check("history stays visible, friend_status = blocked", stillListed.data.find((c) => c.id === convoId)?.friend_status === "blocked");
  const unblock = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}/block`));
  check("admin unblocks", unblock.status === 200 && unblock.data.blocked.length === 0);
  const notBlocked = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}/block`));
  check("unblocking again -> 404", notBlocked.status === 404);

  // reconnect: the user asks, the admin answers with the user's code (mutual = accepted right away)
  await as(userJar, () => call("POST", "/api/chat/friends", { body: { code: adminCode } }));
  const userCode = (await as(userJar, () => call("GET", "/api/chat/friends"))).data.code;
  const mutual = await as(adminJar, () => call("POST", "/api/chat/friends", { body: { code: userCode } }));
  check("answering a pending request with their code makes friends", mutual.status === 200 && mutual.data.status === "friends", JSON.stringify(mutual.raw));
  const m3 = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "back again" } }));
  check("messages flow again after reconnecting", m3.status === 201);
  const rotate = await as(userJar, () => call("POST", "/api/chat/friends/code"));
  check("rotating the code gives a new one", rotate.status === 200 && rotate.data.code !== userCode && rotate.data.qr.startsWith("data:image/png"));
  const stale = await as(adminJar, () => call("GET", `/api/chat/friends/lookup?code=${userCode}`));
  check("the old code stops working", stale.status === 404);
  // per-chat settings: pin, mute, archive (+ auto-unarchive), delivered, presence, delete on my side
  const pinnedRes = await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/settings`, { body: { pinned: true } }));
  check("PUT settings pins a chat", pinnedRes.status === 200 && Boolean(pinnedRes.data.pinned_at));
  const listPinned = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("pinned chats sort first", listPinned.data[0]?.id === convoId);
  const mutedRes = await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/settings`, { body: { muted: true, pinned: false } }));
  check("mute and unpin in one call", mutedRes.status === 200 && mutedRes.data.muted === true && mutedRes.data.pinned_at === null);
  const bellBefore = (await as(adminJar, () => call("GET", "/api/notifications?limit=50"))).data.items.filter((n) => n.type === "chat_message" && n.entity_id === convoId).length;
  const quiet = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "quiet please" } }));
  const bellAfter = (await as(adminJar, () => call("GET", "/api/notifications?limit=50"))).data.items.filter((n) => n.type === "chat_message" && n.entity_id === convoId).length;
  check("a muted chat raises no notification", quiet.status === 201 && bellAfter === bellBefore);
  const statsMuted = await as(adminJar, () => call("GET", "/api/stats"));
  const rowsNow = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data;
  const expectBadge = rowsNow.filter((c) => !c.muted).reduce((sum, c) => sum + c.unread, 0);
  check("the sidebar badge leaves muted chats out", Number(statsMuted.data.counts.chat) === expectBadge, `${statsMuted.data.counts.chat} vs ${expectBadge}`);
  await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/settings`, { body: { muted: false } }));
  const archivedRes = await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/settings`, { body: { archived: true } }));
  check("archive a chat", archivedRes.status === 200 && Boolean(archivedRes.data.archived_at));
  const wake = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "are you there?" } }));
  const rowWoken = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  check("a new message from the other side un-archives", wake.status === 201 && rowWoken?.archived_at === null);
  const badSettings = await as(adminJar, () => call("PUT", `/api/chat/conversations/${convoId}/settings`, { body: {} }));
  check("settings with nothing to change -> 400", badSettings.status === 400);
  const deliveredRes = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/delivered`, { body: { message_id: wake.data.id } }));
  check("POST delivered records the pointer", deliveredRes.status === 200 && deliveredRes.data.delivered_message_id === wake.data.id);
  const peerDel = (await as(userJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  check("the sender sees peer_delivered", Number(peerDel?.peer_delivered) === wake.data.id);
  const delOutside = await as(adminJar, () => call("POST", `/api/chat/conversations/${convoId}/delivered`, { body: { message_id: 999999 } }));
  check("delivered with a foreign message id -> 404", delOutside.status === 404);
  {
    const ctrl2 = new AbortController();
    const res2 = await fetch(`${BASE}/api/chat/stream`, { headers: { cookie: Object.entries(userJar).map(([k, v]) => `${k}=${v}`).join("; ") }, signal: ctrl2.signal });
    await res2.body.getReader().read();
    const rowOn = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
    check("a member with an open live stream shows as online", rowOn?.online === true && rowOn?.members.find((m) => m.id === userId)?.online === true, JSON.stringify({ online: rowOn?.online }));
    ctrl2.abort();
  }
  const delChat = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${convoId}`));
  check("DELETE a direct chat hides it on your side", delChat.status === 200 && delChat.data.hidden === true);
  const listGone = await as(adminJar, () => call("GET", "/api/chat/conversations"));
  check("the chat leaves your list", !listGone.data.some((c) => c.id === convoId));
  const stillThere = await as(userJar, () => call("GET", "/api/chat/conversations"));
  check("the other side keeps it", stillThere.data.some((c) => c.id === convoId));
  const searchHidden = await as(adminJar, () => call("GET", "/api/chat/search?q=quiet"));
  check("hidden messages are not search hits", searchHidden.data.length === 0);
  const revived = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "back again 2" } }));
  const rowBack = (await as(adminJar, () => call("GET", "/api/chat/conversations"))).data.find((c) => c.id === convoId);
  const backHistory = await as(adminJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("a new message brings it back with only the new history", revived.status === 201 && rowBack?.unread === 1 && backHistory.data.length === 1 && backHistory.data[0].id === revived.data.id, JSON.stringify({ unread: rowBack?.unread, n: backHistory.data?.length }));
  const unfriend = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}`));
  check("unfriend", unfriend.status === 200 && unfriend.data.friends.every((u) => u.id !== userId));
  const afterUnfriend = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "?" } }));
  check("no messages after unfriending -> 403", afterUnfriend.status === 403);
  const keepsHistory = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("history is still readable (retention lines, stickers, a location, a clip, a forwarded sticker and three call lines included)", keepsHistory.status === 200 && keepsHistory.data.length === 32, String(keepsHistory.data?.length));
  const notFriends = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}`));
  check("unfriending again -> 404", notFriends.status === 404);

  await as(adminJar, () => call("DELETE", "/api/trash")); // everything this run deleted
  // tidy the admin's bell (the smoke user's rows go with the account)
  const bell = await as(adminJar, () => call("GET", "/api/notifications?limit=50"));
  for (const n of bell.data.items.filter((x) => ["friend_request", "friend_accepted", "chat_message", "chat_call"].includes(x.type) && (x.actor_id === userId || x.entity_id === convoId))) await as(adminJar, () => call("DELETE", `/api/notifications/${n.id}`));
  jar = { ...adminJar };
}

console.log("what each account can use (modules and features per user)");
{
  const as = async (j, fn) => { const keep = jar; jar = j; try { return await fn(); } finally { jar = keep; } };
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  jar = { ...adminJar };
  const st = async (m, p, body) => (await as(userJar, () => call(m, p, body ? { body } : {}))).status;
  const own = await as(userJar, () => call("POST", "/api/tasks", { body: { title: `Access task ${suffix}` } }));
  const tok = await as(userJar, () => call("POST", "/api/tokens", { body: { name: `Access token ${suffix}`, scope: "read" } }));
  const bearer = (path) => fetch(BASE + path, { headers: { Authorization: `Bearer ${tok.data.token}` } }).then((r) => r.status);
  check("only administrators set access", (await st("GET", `/api/users/${userId}/access`)) === 403 && (await st("PUT", `/api/users/${userId}/access`, { modules_off: [] })) === 403);
  const shape = await call("GET", `/api/users/${userId}/access`);
  check("GET /api/users/:id/access lists the switches", shape.status === 200 && shape.data.modules.includes("tasks") && Boolean(shape.data.features.import) && shape.data.needs.board === "tasks" && shape.data.access.modules_off.length === 0);
  const put = await call("PUT", `/api/users/${userId}/access`, { body: { modules_off: ["tasks", "projects", "chat", "dashboard", "bogus"], features_off: ["import", "api_tokens", "sharing", "bogus"] } });
  check("PUT keeps known keys, reports what goes with them", put.status === 200 && put.data.access.modules_off.length === 3 && put.data.access.features_off.length === 3 && ["board", "timeline", "mytasks", "time"].every((k) => put.data.effective.modules_off.includes(k)) && ["calls", "bulk_edit"].every((k) => put.data.effective.features_off.includes(k)), JSON.stringify(put.raw).slice(0, 240));
  check("the session carries it at once", (await as(userJar, () => call("GET", "/api/auth/me"))).data.module_access.modules_off.includes("tasks"));
  check("Tasks off -> 403 on tasks, my tasks, bulk edit and the time report", (await st("GET", "/api/tasks")) === 403 && (await st("GET", `/api/tasks/${own.data.id}`)) === 403 && (await st("GET", "/api/tasks/mine")) === 403 && (await st("POST", "/api/tasks/bulk", { ids: [own.data.id], patch: { status: "done" } })) === 403 && (await st("GET", "/api/time/report")) === 403);
  check("Projects off -> the list stays for pickers, the rest is closed", (await st("GET", "/api/projects")) === 200 && (await st("POST", "/api/projects", { name: "n", code: `N${suffix.slice(-4)}` })) === 403);
  check("Chat off -> 403, calls included", (await st("GET", "/api/chat/conversations")) === 403 && (await st("GET", "/api/chat/calls/incoming")) === 403);
  check("features off -> import and tokens closed, the old token stops", (await st("POST", "/api/import", { kind: "tasks", columns: ["title"], rows: [["x"]], options: { dry: true } })) === 403 && (await st("GET", "/api/tokens")) === 403 && (await bearer("/api/employees")) === 401);
  check("what is on still works", (await st("GET", "/api/employees")) === 200 && (await st("GET", "/api/events")) === 200 && (await st("GET", "/api/notifications")) === 200);
  const stats = await as(userJar, () => call("GET", "/api/stats"));
  check("dashboard and search leave the closed modules out", stats.data.counts.tasks === 0 && stats.data.recentTasks.length === 0 && (await as(userJar, () => call("GET", `/api/search?q=Access`))).data.tasks.length === 0);
  check("administrators are never limited", (await call("GET", "/api/tasks")).status === 200);
  // the set new accounts start with
  check("the defaults are for administrators", (await st("GET", "/api/users/access-defaults")) === 403);
  const defs = await call("PUT", "/api/users/access-defaults", { body: { modules_off: ["chat", "bogus"], features_off: ["webhooks"] } });
  check("PUT /api/users/access-defaults keeps known keys", defs.status === 200 && defs.data.access.modules_off.length === 1 && defs.data.effective.features_off.includes("calls") && defs.data.user === null);
  const fresh = await call("POST", "/api/users", { body: { name: "Default Dora", email: `dora.${suffix.toLowerCase()}@example.com`, password: "dora1234", role: "user" } });
  const freshAccess = await call("GET", `/api/users/${fresh.data.id}/access`);
  check("a new account starts with the defaults", fresh.status === 201 && freshAccess.data.access.modules_off.includes("chat") && freshAccess.data.access.features_off.includes("webhooks"));
  const skipped = await call("POST", "/api/users", { body: { name: "Free Fred", email: `fred.${suffix.toLowerCase()}@example.com`, password: "fred1234", role: "user", apply_defaults: false } });
  check("apply_defaults: false skips them", skipped.status === 201 && (await call("GET", `/api/users/${skipped.data.id}/access`)).data.access.modules_off.length === 0);
  await call("PUT", "/api/users/access-defaults", { body: { modules_off: [], features_off: [] } });
  check("clearing the defaults leaves existing accounts as they are", (await call("GET", "/api/users/access-defaults")).data.access.modules_off.length === 0 && (await call("GET", `/api/users/${fresh.data.id}/access`)).data.access.modules_off.includes("chat"));
  for (const u of [fresh, skipped]) await call("DELETE", `/api/users/${u.data.id}`);
  const reset = await call("PUT", `/api/users/${userId}/access`, { body: { modules_off: [], features_off: [] } });
  check("everything on again", reset.status === 200 && reset.data.effective.modules_off.length === 0 && (await st("GET", "/api/tasks")) === 200 && (await bearer("/api/tasks")) === 200);
  await as(userJar, () => call("DELETE", `/api/tokens/${tok.data.row.id}`));
  await as(userJar, () => call("DELETE", `/api/tasks/${own.data.id}`));
  await as(userJar, () => call("DELETE", "/api/trash"));
}

console.log("bulk edit of tasks");
{
  const mk = async (title, extra = {}) => (await call("POST", "/api/tasks", { body: { title: `${title} ${suffix}`, ...extra } })).data;
  const b1 = await mk("Bulk one", { project_id: projectId, due_date: "2031-07-10", start_date: "2031-07-01", tags: "keep, old", employee_id: employeeId });
  const b2 = await mk("Bulk two", { due_date: "2031-07-20" });
  const b3 = await mk("Bulk three", { start_date: "2031-08-01" });
  const bulkIds = [b1.id, b2.id, b3.id];
  check("POST /api/tasks/bulk: empty patch, no ids, bad values -> 400", (await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: {} } })).status === 400 && (await call("POST", "/api/tasks/bulk", { body: { ids: [], patch: { status: "done" } } })).status === 400 && (await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { priority: "huge" } } })).status === 400 && (await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { due_date: "2031-01-01", shift_days: 1 } } })).status === 400);
  const r1 = await call("POST", "/api/tasks/bulk", { body: { ids: [...bulkIds, 99999999], patch: { status: "in_progress", priority: "urgent", add_tags: "Bulk tag", remove_tags: "old" } } });
  check("status, priority and tags change on all, an unknown id is reported", r1.status === 200 && r1.data.updated === 3 && r1.data.failed.length === 1 && r1.data.undo.length === 3, JSON.stringify(r1.raw).slice(0, 200));
  const g1 = (await call("GET", `/api/tasks/${b1.id}`)).data;
  check("…only what was set changed", g1.status === "in_progress" && g1.priority === "urgent" && g1.tags === "keep,bulk-tag" && g1.due_date === "2031-07-10" && g1.assignees.length === 1);
  await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { shift_days: -3 } } });
  const g2 = await Promise.all(bulkIds.map(async (id) => (await call("GET", `/api/tasks/${id}`)).data));
  check("move by days shifts the dates a task has", g2[0].due_date === "2031-07-07" && g2[0].start_date === "2031-06-28" && g2[1].due_date === "2031-07-17" && g2[2].start_date === "2031-07-29" && g2[2].due_date === null);
  const r3 = await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { start_date: "2031-07-10" } } });
  check("a task that cannot take the change is reported, the rest go through", r3.data.updated === 2 && r3.data.failed.length === 1 && r3.data.failed[0].id === b1.id);
  const r4 = await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { assignee_mode: "replace", assignee_ids: [] } } });
  check("replace assignees with nobody", r4.data.updated === 3 && (await call("GET", `/api/tasks/${b1.id}`)).data.assignees.length === 0);
  const undone = await call("POST", "/api/tasks/bulk", { body: { items: r4.data.undo } });
  check("the undo list puts the people back", undone.data.updated >= 1 && (await call("GET", `/api/tasks/${b1.id}`)).data.assignees[0]?.id === employeeId);
  const done = await call("POST", "/api/tasks/bulk", { body: { ids: bulkIds, patch: { status: "done" } } });
  check("completing in bulk is counted", done.data.completed === 3);
  for (const id of bulkIds) await call("DELETE", `/api/tasks/${id}`);
  await call("DELETE", "/api/trash");
  for (const n of (await call("GET", "/api/notifications?limit=50")).data.items.filter((x) => /at once|Bulk (one|two|three)/.test(x.title + (x.body ?? "")))) await call("DELETE", `/api/notifications/${n.id}`);
}

console.log("API tokens + webhooks");
{
  const http = await import("node:http");
  const crypto = await import("node:crypto");
  const asToken = (tok) => (method, path, body) => fetch(BASE + path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.data }));
  const t1 = await call("POST", "/api/tokens", { body: { name: `Smoke read ${suffix}`, scope: "read" } });
  check("POST /api/tokens: read token, shown once", t1.status === 201 && /^tp_/.test(t1.data.token) && t1.data.row.scope === "read" && !("token" in t1.data.tokens[0]));
  const t2 = await call("POST", "/api/tokens", { body: { name: `Smoke write ${suffix}`, scope: "write", days: 7 } });
  check("…write token with an expiry", t2.status === 201 && t2.data.row.expires_at);
  check("a name is required", (await call("POST", "/api/tokens", { body: { name: "" } })).status === 400);
  const rd = asToken(t1.data.token), wr = asToken(t2.data.token);
  check("read token reads", (await rd("GET", "/api/tasks")).status === 200 && (await rd("GET", `/api/projects/${projectId}`)).status === 200);
  check("read token cannot write", (await rd("POST", "/api/tasks", { title: "x" })).status === 403 && (await rd("PUT", `/api/projects/${projectId}`, { name: "x" })).status === 403);
  check("no token can touch account or admin routes", (await wr("GET", "/api/auth/me")).status === 403 && (await wr("GET", "/api/users")).status === 403 && (await wr("GET", "/api/tokens")).status === 403 && (await wr("GET", "/api/mail")).status === 403);
  check("unknown token -> 401", (await asToken("tp_" + "a".repeat(40))("GET", "/api/tasks")).status === 401);
  const made = await wr("POST", "/api/tasks", { title: `Token task ${suffix}`, project_id: projectId });
  check("write token creates a task", made.status === 201 && made.data.project_id === projectId);
  check("the list shows the last use", (await call("GET", "/api/tokens")).data.find((r) => r.id === t1.data.row.id).last_used_at != null);
  check("DELETE /api/tokens/:id revokes", (await call("DELETE", `/api/tokens/${t1.data.row.id}`)).status === 200 && (await rd("GET", "/api/tasks")).status === 401);
  // rate limits: 60 a minute per token, answered with headers; wrong tokens lock an address out
  const raw = (tok, headers = {}) => fetch(BASE + "/api/tasks", { headers: { Authorization: `Bearer ${tok}`, ...headers } });
  const t3 = await call("POST", "/api/tokens", { body: { name: `Smoke rate ${suffix}`, scope: "read" } });
  const r1 = await raw(t3.data.token);
  check("token answers carry X-RateLimit-* headers", r1.status === 200 && r1.headers.get("x-ratelimit-limit") === "60" && r1.headers.get("x-ratelimit-remaining") === "59" && r1.headers.get("x-ratelimit-reset"));
  let rl;
  for (let i = 0; i < 60; i++) rl = await raw(t3.data.token);
  check("the 61st request in a minute -> 429 with Retry-After", rl.status === 429 && Number(rl.headers.get("retry-after")) >= 1 && Number(rl.headers.get("retry-after")) <= 60 && /this minute/.test((await rl.json()).error));
  check("usage is shown on the token", (await call("GET", "/api/tokens")).data.find((r) => r.id === t3.data.row.id).requests_today === 61);
  const spoof = { "X-Forwarded-For": `203.0.113.${(Date.now() % 200) + 1}` };
  let bad;
  for (let i = 0; i < 31; i++) bad = await raw("tp_" + "z".repeat(40), spoof);
  check("31 wrong tokens from one address -> 429, other addresses unaffected", bad.status === 429 && (await raw("tp_" + "z".repeat(40))).status === 401);
  await call("DELETE", `/api/tokens/${t3.data.row.id}`);

  // webhooks: a receiver inside the test
  const got = [];
  let answer = 200;
  const server = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got.push({ headers: req.headers, body: b }); res.statusCode = answer; res.end(); }); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  const pid = (await call("GET", "/api/profiles")).data.items.find((p) => p.is_default).id;
  check("a webhook needs an http(s) address", (await call("POST", `/api/profiles/${pid}/webhooks`, { body: { url: "ftp://x" } })).status === 400);
  const hk = await call("POST", `/api/profiles/${pid}/webhooks`, { body: { url, events: ["task.created", "task.completed", "task.deleted"] } });
  check("POST /api/profiles/:id/webhooks: secret shown once, events kept", hk.status === 201 && /^whs_/.test(hk.data.webhook.secret) && hk.data.webhooks[0].secret === undefined && hk.data.webhooks[0].events.length === 3, JSON.stringify(hk.raw));
  const hid = hk.data.webhook.id, secret = hk.data.webhook.secret;
  const waitFor = async (n, ms = 8000) => { const t0 = Date.now(); while (got.length < n && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100)); return got.length >= n; };
  const task = await call("POST", "/api/tasks", { body: { title: `Hooked ${suffix}` } });
  check("task.created is delivered", await waitFor(1) && JSON.parse(got[0].body).event === "task.created" && JSON.parse(got[0].body).data.id === task.data.id);
  check("…signed with the secret", got[0].headers["x-taskportal-signature"] === `sha256=${crypto.createHmac("sha256", secret).update(got[0].body).digest("hex")}` && got[0].headers["x-taskportal-event"] === "task.created");
  await call("PUT", `/api/tasks/${task.data.id}`, { body: { priority: "low" } });
  await new Promise((r) => setTimeout(r, 500));
  check("events not subscribed to are not sent", got.length === 1);
  await call("PUT", `/api/tasks/${task.data.id}`, { body: { status: "done" } });
  check("task.completed is delivered", await waitFor(2) && JSON.parse(got[1].body).event === "task.completed");
  const ping = await call("POST", `/api/profiles/${pid}/webhooks/${hid}/test`);
  check("POST …/test pings the receiver", ping.status === 200 && ping.data.status === "sent" && ping.data.response_status === 200);
  answer = 503;
  const failed = await call("POST", `/api/profiles/${pid}/webhooks/${hid}/test`);
  check("a refused test says so", failed.data.status === "failed" && failed.data.error === "HTTP 503");
  await call("DELETE", `/api/tasks/${task.data.id}`);
  await waitFor(5);
  await new Promise((r) => setTimeout(r, 500));
  const list = await call("GET", `/api/profiles/${pid}/webhooks/${hid}/deliveries`);
  const dead = list.data.find((d) => d.event === "task.deleted");
  check("a failed event waits for a retry", dead && dead.status === "pending" && dead.attempts === 1 && dead.next_attempt_at);
  const hooks = await call("GET", `/api/profiles/${pid}/webhooks`);
  check("the hook shows failures and the last status", hooks.data.webhooks[0].failures >= 2 && hooks.data.webhooks[0].last_status === 503 && Object.keys(hooks.data.events).length === 11);
  check("PUT active=false pauses, active=true clears failures", (await call("PUT", `/api/profiles/${pid}/webhooks/${hid}`, { body: { active: false } })).data.webhook.active === false && (await call("PUT", `/api/profiles/${pid}/webhooks/${hid}`, { body: { active: true } })).data.webhook.failures === 0);
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  jar = { ...adminJar };
  check("somebody outside the profile cannot see its webhooks", (await (async () => { const keep = jar; jar = userJar; try { return await call("GET", `/api/profiles/${pid}/webhooks`); } finally { jar = keep; } })()).status === 404);
  check("DELETE …/webhooks/:hid", (await call("DELETE", `/api/profiles/${pid}/webhooks/${hid}`)).status === 200);
  server.close();
  await call("DELETE", `/api/tokens/${t2.data.row.id}`);
  await call("DELETE", `/api/tasks/${made.data.id}`);
  await call("DELETE", "/api/trash");
  for (const n of (await call("GET", "/api/notifications?limit=50")).data.items.filter((x) => /API token|webhook/i.test(x.title))) await call("DELETE", `/api/notifications/${n.id}`);
}

console.log("time report");
{
  const t1 = (await call("POST", "/api/tasks", { body: { title: `Report A ${suffix}`, estimate_hours: 3, project_id: projectId } })).data;
  const t2 = (await call("POST", "/api/tasks", { body: { title: `Report B ${suffix}` } })).data;
  await call("POST", `/api/tasks/${t1.id}/time`, { body: { minutes: 90, spent_on: "2031-03-02", note: "r1" } });
  await call("POST", `/api/tasks/${t1.id}/time`, { body: { minutes: 30, spent_on: "2031-03-03" } });
  await call("POST", `/api/tasks/${t2.id}/time`, { body: { minutes: 60, spent_on: "2031-03-03" } });
  await call("POST", `/api/tasks/${t2.id}/time`, { body: { minutes: 15, spent_on: "2031-04-01" } }); // outside the period
  const started = await call("POST", `/api/tasks/${t2.id}/time`, { body: { start: true, spent_on: "2031-03-03" } }); // running: not counted
  const rep = await call("GET", "/api/time/report?from=2031-03-01&to=2031-03-31&group=task");
  check("GET /api/time/report totals the period, running timers and other months left out", rep.status === 200 && rep.data.total_minutes === 180 && rep.data.entry_count === 3 && rep.data.days.length === 2, JSON.stringify(rep.raw).slice(0, 300));
  const gA = rep.data.groups.find((g) => g.id === t1.id);
  const gB = rep.data.groups.find((g) => g.id === t2.id);
  check("groups by task carry minutes, share and the estimate", gA && gA.minutes === 120 && Math.round(gA.share * 100) === 67 && gA.estimate_minutes === 180 && gB.minutes === 60 && gB.estimate_minutes === null && gA.project_name);
  const byPerson = await call("GET", "/api/time/report?from=2031-03-01&to=2031-03-31&group=person");
  check("by person: one row, everything mine", byPerson.data.groups.length === 1 && byPerson.data.groups[0].minutes === 180 && byPerson.data.groups[0].tasks === 2 && byPerson.data.people.some((p) => p.name));
  const byDay = await call("GET", "/api/time/report?from=2031-03-01&to=2031-03-31&group=day");
  check("by day, newest first", byDay.data.groups[0].key === "2031-03-03" && byDay.data.groups[0].minutes === 90);
  const byProject = await call("GET", `/api/time/report?from=2031-03-01&to=2031-03-31&group=project&project_id=${projectId}`);
  check("project filter + project estimate", byProject.data.total_minutes === 120 && byProject.data.groups.length === 1 && byProject.data.groups[0].estimate_minutes >= 180);
  check("the default period is this month", (await call("GET", "/api/time/report")).data.from.endsWith("-01"));
  check("bad dates -> 400", (await call("GET", "/api/time/report?from=nope&to=2031-03-31")).status === 400 && (await call("GET", "/api/time/report?from=2031-03-31&to=2031-03-01")).status === 400);
  await call("POST", "/api/time/stop");
  for (const t of [t1, t2]) await call("DELETE", `/api/tasks/${t.id}`);
  await call("DELETE", "/api/trash");
  check("cleanup: nothing left in that month", (await call("GET", "/api/time/report?from=2031-03-01&to=2031-04-30")).data.entry_count === 0);
}

console.log("handing a profile over");
{
  const as = async (j, fn) => { const keep = jar; jar = j; try { return await fn(); } finally { jar = keep; } };
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  jar = { ...adminJar };
  const adminId = (await call("GET", "/api/auth/me")).data.id;
  const space = await call("POST", "/api/profiles", { body: { name: `Handover ${suffix}`, color: "#f59e0b" } });
  const pid = space.data.id;
  await call("POST", `/api/profiles/${pid}/activate`);
  const proj = await call("POST", "/api/projects", { body: { name: `Handover project ${suffix}`, code: `HO${suffix.slice(-4)}` } });
  const task = await call("POST", "/api/tasks", { body: { title: `Handover task ${suffix}` } });
  const secret = await call("POST", "/api/info", { body: { title: `Handover secret ${suffix}`, category: "credential", content: "keep me" } });
  await call("DELETE", `/api/tasks/${(await call("POST", "/api/tasks", { body: { title: `Handover binned ${suffix}` } })).data.id}`);
  check("not a member -> 400", (await call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: userId } })).status === 400);
  await call("POST", `/api/profiles/${pid}/members`, { body: { user_id: userId, role: "editor" } });
  await as(userJar, () => call("PUT", `/api/profiles/${pid}/membership`, { body: { accept: true } }));
  check("a member cannot hand the profile over", (await as(userJar, () => call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: userId } }))).status === 403);
  check("bad role -> 400", (await call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: userId, keep_role: "boss" } })).status === 400);
  const handed = await call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: userId, keep_role: "manager" } });
  check("POST /api/profiles/:id/transfer", handed.status === 200 && handed.data.owner.id === userId && handed.data.kept_role === "manager", JSON.stringify(handed.raw));
  const me = await call("GET", "/api/auth/me");
  check("the old owner is a manager inside it now", me.data.profile_id === pid && me.data.access === "manager" && !me.data.profiles.some((p) => p.id === pid) && me.data.shared_profiles.some((p) => p.id === pid));
  const mine = await as(userJar, () => call("GET", "/api/profiles"));
  check("the new owner lists it among their own profiles", mine.data.items.some((p) => p.id === pid && p.member_count === 1));
  await as(userJar, () => call("POST", `/api/profiles/${pid}/activate`));
  const theirTask = await as(userJar, () => call("GET", `/api/tasks/${task.data.id}`));
  const theirProject = await as(userJar, () => call("GET", `/api/projects/${proj.data.id}`));
  check("records inside re-own", theirTask.data.user_id === userId && theirProject.data.user_id === userId);
  check("the Info vault did not go with it", (await as(userJar, () => call("GET", "/api/info"))).data.every((i) => i.id !== secret.data.id) && (await as(userJar, () => call("GET", `/api/info/${secret.data.id}`))).status === 404);
  const bin = await as(userJar, () => call("GET", "/api/trash"));
  check("the bin went along, without Info entries", bin.data.items.some((i) => i.title === `Handover binned ${suffix}`) && !bin.data.items.some((i) => i.entity === "info"));
  const restored = await as(userJar, () => call("POST", `/api/trash/${bin.data.items.find((i) => i.title === `Handover binned ${suffix}`).id}/restore`));
  check("a restored record belongs to the new owner", restored.status === 200 && (await as(userJar, () => call("GET", `/api/tasks/${restored.data.id}`))).data.user_id === userId);
  await call("POST", "/api/profiles/1/activate").catch(() => {});
  const home = (await call("GET", "/api/profiles")).data.items.find((p) => p.is_default);
  await call("POST", `/api/profiles/${home.id}/activate`);
  check("the secret sits in the old owner's own profile", (await call("GET", `/api/info/${secret.data.id}`)).status === 200);
  check("the new owner got a bell entry", (await as(userJar, () => call("GET", "/api/notifications?limit=20"))).data.items.some((n) => n.type === "profile_role" && /made you the owner/.test(n.title)));
  check("the old owner cannot hand it again", (await call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: adminId } })).status === 403);
  // the new owner hands it back, leaving the admin out; cleanup
  const back = await as(userJar, () => call("POST", `/api/profiles/${pid}/transfer`, { body: { user_id: adminId, keep_role: null } }));
  check("…the new owner can hand it back and leave", back.status === 200 && back.data.owner.id === adminId && !(await as(userJar, () => call("GET", "/api/auth/me"))).data.shared_profiles.some((p) => p.id === pid));
  await call("POST", `/api/profiles/${pid}/activate`);
  await call("DELETE", `/api/info/${secret.data.id}`).catch(() => {});
  await call("POST", `/api/profiles/${home.id}/activate`);
  await call("DELETE", `/api/info/${secret.data.id}`).catch(() => {});
  await call("DELETE", "/api/trash");
  check("cleanup: the handover profile is deleted", (await call("DELETE", `/api/profiles/${pid}`)).status === 200);
  for (const n of (await call("GET", "/api/notifications?limit=50")).data.items.filter((x) => /Handover|handed over|owner of/i.test(x.title))) await call("DELETE", `/api/notifications/${n.id}`);
  for (const n of (await as(userJar, () => call("GET", "/api/notifications?limit=50"))).data.items.filter((x) => /Handover|owner of|owned by/i.test(x.title))) await as(userJar, () => call("DELETE", `/api/notifications/${n.id}`));
}

console.log("saved views");
{
  // the member's jar is used as is (no copy), so the profile cookie from `activate` stays with them
  const as = async (j, fn) => { const keep = jar; jar = j; try { return await fn(); } finally { jar = keep; } };
  const state = { filters: { status: "in_progress", priority: "", project_id: String(projectId) }, query: "smoke", sort: { key: "due_date", dir: "desc" }, date: { field: "due_date", from: "2026-01-01", to: "" } };
  const made = await call("POST", "/api/views", { body: { module: "tasks", name: `Smoke view ${suffix}`, state } });
  check("POST /api/views saves a personal view", made.status === 201 && made.data.id > 0 && made.data.views.some((v) => v.id === made.data.id && v.mine && !v.shared));
  const mine = made.data.views.find((v) => v.id === made.data.id);
  check("empty filters are dropped, the rest kept", !("priority" in mine.state.filters) && mine.state.filters.status === "in_progress" && mine.state.query === "smoke" && mine.state.sort.dir === "desc" && mine.state.date.from === "2026-01-01", JSON.stringify(mine.state));
  check("a name is required", (await call("POST", "/api/views", { body: { module: "tasks", name: " ", state } })).status === 400);
  check("unknown module -> 400", (await call("POST", "/api/views", { body: { module: "nope", name: "x", state } })).status === 400 && (await call("GET", "/api/views?module=nope")).status === 400);
  const def = await call("PUT", `/api/views/${made.data.id}`, { body: { is_default: true } });
  check("PUT is_default marks it as my default", def.status === 200 && def.data.view.is_default === true);
  const other = await call("POST", "/api/views", { body: { module: "tasks", name: `Smoke other ${suffix}`, state: {}, is_default: true } });
  check("only one default per person and page", other.data.views.filter((v) => v.is_default).length === 1 && other.data.views.find((v) => v.id === made.data.id).is_default === false);
  const shared = await call("PUT", `/api/views/${made.data.id}`, { body: { shared: true, name: `Smoke shared ${suffix}` } });
  check("PUT shares and renames", shared.data.view.shared === true && shared.data.view.name === `Smoke shared ${suffix}`);
  // a member sees shared views, not private ones; cannot change them
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  const pid = (await call("GET", "/api/profiles")).data.items.find((p) => p.is_default).id;
  await call("POST", `/api/profiles/${pid}/members`, { body: { email: smokeEmail, role: "viewer" } });
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  jar = { ...adminJar };
  await as(userJar, () => call("PUT", `/api/profiles/${pid}/membership`, { body: { accept: true } }));
  await as(userJar, () => call("POST", `/api/profiles/${pid}/activate`));
  const seen = await as(userJar, () => call("GET", "/api/views?module=tasks"));
  check("a member sees the shared view and not the private one", seen.data.some((v) => v.id === made.data.id && !v.mine) && !seen.data.some((v) => v.id === other.data.id));
  check("a member cannot change or delete somebody else's view", (await as(userJar, () => call("PUT", `/api/views/${made.data.id}`, { body: { name: "hijack" } }))).status === 403 && (await as(userJar, () => call("DELETE", `/api/views/${made.data.id}`))).status === 403);
  check("a viewer cannot share a view", (await as(userJar, () => call("POST", "/api/views", { body: { module: "tasks", name: "v", state: {}, shared: true } }))).status === 403);
  const own = await as(userJar, () => call("POST", "/api/views", { body: { module: "tasks", name: `Member view ${suffix}`, state: { filters: { status: "done" } } } }));
  check("…but keeps private ones", own.status === 201);
  check("the admin does not see the member's private view", !(await call("GET", "/api/views?module=tasks")).data.some((v) => v.id === own.data.id));
  check("a default must be my own view", (await as(userJar, () => call("PUT", `/api/views/${made.data.id}`, { body: { is_default: true } }))).status === 400);
  await as(userJar, () => call("DELETE", `/api/views/${own.data.id}`));
  await as(userJar, () => call("DELETE", `/api/profiles/${pid}/membership`));
  const gone = await call("DELETE", `/api/views/${made.data.id}`);
  check("DELETE /api/views/:id", gone.status === 200 && !gone.data.views.some((v) => v.id === made.data.id));
  await call("DELETE", `/api/views/${other.data.id}`);
  check("nothing left of this run's views", !(await call("GET", "/api/views?module=tasks")).data.some((v) => v.name.includes(suffix)));
}

console.log("spreadsheet import");
{
  const as = async (j, fn) => { const keep = jar; jar = { ...j }; try { return await fn(); } finally { jar = keep; } };
  const rows = [["Import kickoff " + suffix, "Import space " + suffix, "Ivy Importer; Ian Importer", "Doing", "P0", "18/9/2026", "launch, docs"], ["", "Import space " + suffix, "", "", "", "", ""], ["Import venue " + suffix, "Import space " + suffix, "Ivy Importer", "done", "", "3/4/2026", ""]];
  const columns = ["title", "project", "assignees", "status", "priority", "due_date", "tags"];
  const dry = await call("POST", "/api/import", { body: { kind: "tasks", columns, rows, options: { dry: true } } });
  check("POST /api/import dry run: preview with counts, nothing written", dry.status === 200 && dry.data.counts.ready === 2 && dry.data.counts.skipped === 1 && dry.data.counts.new_projects === 1 && dry.data.counts.new_employees === 2 && dry.data.needs_date_order === true);
  const r1 = dry.data.rows[0];
  check("synonyms, day-first dates and tags are read", r1.values.status === "in_progress" && r1.values.priority === "urgent" && r1.values.due_date === "2026-09-18" && r1.values.tags === "launch,docs" && r1.values.assignee_new.length === 2, JSON.stringify(r1.values));
  check("the empty title is an error", dry.data.rows[1].skip && dry.data.rows[1].problems[0].level === "error");
  check("month-first when asked", (await call("POST", "/api/import", { body: { kind: "tasks", columns, rows, options: { dry: true, date_order: "mdy" } } })).data.rows[2].values.due_date === "2026-03-04");
  check("no project created by the dry run", !(await call("GET", `/api/projects?q=Import%20space%20${suffix}`)).data.length);
  check("more than 2000 rows -> 400", (await call("POST", "/api/import", { body: { kind: "tasks", columns: ["title"], rows: Array.from({ length: 2001 }, () => ["x"]), options: { dry: true } } })).status === 400);
  const done = await call("POST", "/api/import", { body: { kind: "tasks", columns, rows, options: {} } });
  check("POST /api/import creates the tasks and the helpers it announced", done.status === 201 && done.data.created.tasks === 2 && done.data.created.projects === 1 && done.data.created.employees === 2 && done.data.batch_id > 0, JSON.stringify(done.raw));
  const made = (await call("GET", `/api/tasks?q=Import%20kickoff%20${suffix}`)).data[0];
  check("the task carries project, both assignees, status, date and tags", made && made.project_name === `Import space ${suffix}` && made.assignees.length === 2 && made.status === "in_progress" && made.due_date === "2026-09-18" && made.tags === "launch,docs", JSON.stringify(made));
  const again = await call("POST", "/api/import", { body: { kind: "tasks", columns, rows, options: { dry: true } } });
  check("importing the same sheet again skips the open task (a done one may come back)", again.data.rows[0].skip && again.data.counts.ready === 1);
  const emp = await call("POST", "/api/import", { body: { kind: "employees", columns: ["name", "email", "hired_at", "status"], rows: [["Importer, Iris " + suffix, `iris.${suffix.toLowerCase()}@example.test`, "1.2.2024", "on leave"], ["Ivy Importer", "", "", ""]], options: {} } });
  check("employees: 'Last, First', dates, status words, duplicates by name", emp.status === 201 && emp.data.created.employees === 1 && emp.data.skipped === 1, JSON.stringify(emp.raw));
  const iris = (await call("GET", `/api/employees?q=Iris`)).data.find((e) => e.last_name === "Importer");
  check("…with the values in place", iris && iris.first_name === `Iris ${suffix}` && iris.hired_at === "2024-02-01" && iris.status === "on_leave");
  const noMail = await call("POST", "/api/employees", { body: { first_name: "No", last_name: "Mail " + suffix } });
  check("an employee may have no email now", noMail.status === 201 && noMail.data.email === null);
  await call("DELETE", `/api/employees/${noMail.data.id}`);
  const req = await call("POST", "/api/import", { body: { kind: "requirements", columns: ["project", "title", "code", "priority", "employee"], rows: [[`Import space ${suffix}`, "SSO login " + suffix, "", "must", "Ivy Importer"], [`Import space ${suffix}`, "Audit log " + suffix, "AUD-1", "w", ""], ["", "Orphan", "", "", ""]], options: {} } });
  check("requirements: project by name, auto and custom codes, stakeholder, project required", req.status === 201 && req.data.created.requirements === 2 && req.data.skipped === 1, JSON.stringify(req.raw));
  const project = (await call("GET", `/api/projects?q=Import%20space%20${suffix}`)).data[0];
  const reqs = (await call("GET", `/api/requirements?project_id=${project.id}`)).data;
  check("…REQ-001 must + AUD-1 wont", reqs.some((r) => r.code === "REQ-001" && r.priority === "must" && r.employee_id) && reqs.some((r) => r.code === "AUD-1" && r.priority === "wont"));
  const prj = await call("POST", "/api/import", { body: { kind: "projects", columns: ["name", "status", "budget"], rows: [[`Import space ${suffix}`, "active", "1"], [`Import second ${suffix}`, "paused", "RM 12,500.50"]], options: {} } });
  check("projects: duplicate skipped, money and status words read", prj.status === 201 && prj.data.created.projects === 1 && prj.data.skipped === 1);
  const second = (await call("GET", `/api/projects?q=Import%20second%20${suffix}`)).data[0];
  check("…with a generated code", second && second.code.startsWith("IMPORT-SECO") && second.status === "on_hold" && Number(second.budget) === 12500.5, JSON.stringify(second));
  // access + undo
  const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
  jar = {};
  await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
  const userJar = { ...jar };
  jar = { ...adminJar };
  check("somebody else cannot undo my import", (await as(userJar, () => call("POST", `/api/import/${done.data.batch_id}/undo`))).status === 404);
  const undo = await call("POST", `/api/import/${done.data.batch_id}/undo`);
  check("POST /api/import/:id/undo moves everything the batch made to the bin", undo.status === 200 && undo.data.moved === 5, JSON.stringify(undo.raw));
  check("undo twice -> 409", (await call("POST", `/api/import/${done.data.batch_id}/undo`)).status === 409);
  check("the imported task is gone", (await call("GET", `/api/tasks/${made.id}`)).status === 404);
  for (const b of [emp, req, prj]) await call("POST", `/api/import/${b.data.batch_id}/undo`);
  const bin = (await call("GET", "/api/trash")).data.items;
  check("the bin holds the run's records", bin.filter((i) => i.title.includes(suffix) || /Importer/.test(i.title)).length >= 6, String(bin.length));
  await call("DELETE", "/api/trash");
}

console.log("email (password reset, invitations, notification emails)");
{
  const net = await import("node:net");
  // a throwaway SMTP server inside the test: accepts everything and keeps the messages in memory
  const inbox = [];
  const server = net.createServer((sock) => {
    let buf = "", data = null, to = [];
    const say = (l) => sock.write(l + "\r\n");
    say("220 sink ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (data != null) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          inbox.push({ to: to.join(" "), raw: data + buf.slice(0, end), body: (data + buf.slice(0, end)).replace(/=\r\n/g, "").replace(/=3D/g, "=") });
          buf = buf.slice(end + 5); data = null; to = [];
          say("250 OK queued");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250-sink\r\n250 8BITMIME\r\n");
        else if (cmd.startsWith("RCPT TO")) { to.push(line.slice(8)); say("250 OK"); }
        else if (cmd === "DATA") { data = ""; say("354 go ahead"); }
        else if (cmd === "QUIT") { say("221 bye"); sock.end(); }
        else say("250 OK");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const mailTo = async (addr, from = 0, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = inbox.slice(from).find((x) => x.to.includes(addr)); if (m) return m; await new Promise((r) => setTimeout(r, 150)); } return null; };
  const as = async (j, fn) => { const keep = jar; jar = { ...j }; try { return await fn(); } finally { jar = keep; } };
  const anon = (fn) => as({}, fn);

  const before = await call("GET", "/api/mail");
  check("GET /api/mail as admin never carries the password", before.status === 200 && !("password" in before.data.settings) && !("password_enc" in before.data.settings));
  const prev = before.data.settings;
  if (prev.password_set || (prev.enabled && prev.host && prev.host !== "127.0.0.1")) {
    console.log("  - a real mail account is configured here: the email checks leave it alone and are skipped");
  } else {
    const smokeEmail = `smoke.user.${suffix.toLowerCase()}@example.com`;
    jar = {};
    await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true });
    const userJar = { ...jar };
    jar = { ...adminJar };
    check("the Email page is for administrators", (await as(userJar, () => call("GET", "/api/mail"))).status === 403 && (await as(userJar, () => call("POST", "/api/mail/test", { body: {} }))).status === 403);
    check("turning email on without a server -> 400", (await call("PUT", "/api/mail", { body: { enabled: true, host: "", from_email: "" } })).status === 400);
    const off = await call("PUT", "/api/mail", { body: { enabled: false, host: "127.0.0.1", port, secure: "none", username: "", from_email: "portal@example.test", allow_reset: true, allow_notifications: true, allow_invites: true } });
    check("PUT /api/mail saves the account", off.status === 200 && off.data.settings.host === "127.0.0.1" && off.data.settings.configured);
    const offFlags = await anon(() => call("GET", "/api/auth/methods"));
    check("while email is off nothing is offered", offFlags.data.reset === false && offFlags.data.mail.invites === false);
    check("…and asking for a reset link -> 503", (await anon(() => call("POST", "/api/auth/forgot", { body: { email: smokeEmail } }))).status === 503);
    const test = await call("POST", "/api/mail/test", { body: { to: "probe@example.test" } });
    check("the test message goes out even before email is switched on", test.status === 200 && Boolean(await mailTo("probe@example.test")));
    check("a server that does not answer -> 502 with the reason", (await call("POST", "/api/mail/test", { body: { to: "probe@example.test", port: 1 } })).status === 502);
    await call("PUT", "/api/mail", { body: { enabled: true } });
    const onFlags = await anon(() => call("GET", "/api/auth/methods"));
    check("switched on: the sign-in page may offer the reset link", onFlags.data.reset === true && onFlags.data.mail.invites === true && onFlags.data.mail.notifications === true);

    // password reset
    let from = inbox.length;
    const ghost = await anon(() => call("POST", "/api/auth/forgot", { body: { email: `nobody.${suffix.toLowerCase()}@example.test` } }));
    const real = await anon(() => call("POST", "/api/auth/forgot", { body: { email: smokeEmail } }));
    check("forgot answers the same for unknown and known addresses", ghost.status === 200 && real.status === 200 && JSON.stringify(ghost.data) === JSON.stringify(real.data));
    const resetMail = await mailTo(smokeEmail, from);
    const resetToken = resetMail?.body.match(/reset\?token=([A-Za-z0-9_-]+)/)?.[1];
    check("only the real account gets a link", Boolean(resetToken) && !inbox.slice(from).some((m) => m.to.includes("nobody.")));
    const look = await anon(() => call("GET", `/api/auth/reset?token=${resetToken}`));
    check("GET /api/auth/reset: valid, address only hinted", look.data.valid === true && look.data.email_hint.includes("•") && !look.data.email_hint.includes(smokeEmail.split("@")[0]));
    check("a made-up token is not valid", (await anon(() => call("GET", `/api/auth/reset?token=${"A".repeat(43)}`))).data.valid === false);
    check("short new password -> 400", (await anon(() => call("POST", "/api/auth/reset", { body: { token: resetToken, password: "123" } }))).status === 400);
    from = inbox.length;
    const done = await anon(() => call("POST", "/api/auth/reset", { body: { token: resetToken, password: "smoke789" } }));
    check("POST /api/auth/reset changes the password", done.status === 200);
    check("the link works once -> 410", (await anon(() => call("POST", "/api/auth/reset", { body: { token: resetToken, password: "smoke000" } }))).status === 410);
    check("every device was signed out", (await as(userJar, () => call("GET", "/api/auth/me"))).status === 401);
    check("the old password is dead, the new one signs in", (await anon(() => call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke456" }, noAuth: true }))).status === 401);
    jar = {};
    const relog = await call("POST", "/api/auth/login", { body: { email: smokeEmail, password: "smoke789" }, noAuth: true });
    const userJar2 = { ...jar };
    jar = { ...adminJar };
    check("…new password signs in", relog.status === 200);
    check("a confirmation is mailed", Boolean(await mailTo(smokeEmail, from)));

    // invitations: somebody without an account
    const space = await call("POST", "/api/profiles", { body: { name: `Mail space ${suffix}`, color: "#0ea5e9" } });
    const spaceId = space.data.id;
    const newbie = `joiner.${suffix.toLowerCase()}@example.test`;
    from = inbox.length;
    const inv = await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: newbie, role: "editor" } });
    check("an unknown address gets an invitation by email", inv.status === 201 && inv.data.invited_by_email === newbie && inv.data.pending.length === 1);
    const joinToken = (await mailTo(newbie, from))?.body.match(/join\?token=([A-Za-z0-9_-]+)/)?.[1];
    const peek = await anon(() => call("GET", `/api/auth/join?token=${joinToken}`));
    check("GET /api/auth/join names the workspace and the role", peek.data.valid && peek.data.email === newbie && peek.data.role === "editor" && peek.data.profile_name === `Mail space ${suffix}`);
    check("join: short password -> 400", (await anon(() => call("POST", "/api/auth/join", { body: { token: joinToken, name: "Joy", password: "1" } }))).status === 400);
    jar = {};
    const joined = await call("POST", "/api/auth/join", { body: { token: joinToken, name: "Joy Joiner", password: "joiner123" }, noAuth: true });
    const joinerJar = { ...jar };
    jar = { ...adminJar };
    check("POST /api/auth/join creates the account and signs in", joined.status === 201 && Object.keys(joinerJar).length > 0);
    const jme = await as(joinerJar, () => call("GET", "/api/auth/me"));
    check("…as a plain user, inside the shared workspace with the invited role", jme.data.role === "user" && jme.data.profile_id === spaceId && jme.data.access === "editor");
    check("the invitation works once -> 410", (await anon(() => call("POST", "/api/auth/join", { body: { token: joinToken, name: "Again", password: "joiner123" } }))).status === 410);
    const roster = await call("GET", `/api/profiles/${spaceId}/members`);
    check("the member list shows them active, nothing pending", roster.data.members.some((m) => m.email === newbie && m.status === "active") && roster.data.pending.length === 0);
    // withdraw
    from = inbox.length;
    const ghostAddr = `ghost.${suffix.toLowerCase()}@example.test`;
    const inv2 = await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: ghostAddr, role: "viewer" } });
    const ghostToken = (await mailTo(ghostAddr, from))?.body.match(/join\?token=([A-Za-z0-9_-]+)/)?.[1];
    check("members cannot withdraw invitations", (await as(joinerJar, () => call("DELETE", `/api/profiles/${spaceId}/invites/${inv2.data.pending[0].id}`))).status === 403);
    const wd = await call("DELETE", `/api/profiles/${spaceId}/invites/${inv2.data.pending[0].id}`);
    check("DELETE invitation kills its link", wd.status === 200 && wd.data.pending.length === 0 && (await anon(() => call("GET", `/api/auth/join?token=${ghostToken}`))).data.valid === false);
    await call("PUT", "/api/mail", { body: { enabled: true, allow_invites: false } });
    check("with invitations off an unknown address -> 404", (await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: `late.${suffix.toLowerCase()}@example.test`, role: "viewer" } })).status === 404);
    await call("PUT", "/api/mail", { body: { enabled: true, allow_invites: true } });

    // notification emails
    from = inbox.length;
    const invited = await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: smokeEmail, role: "viewer" } });
    const noteMail = await mailTo(smokeEmail, from);
    const noteId = noteMail?.body.match(/\/n\/(\d+)/)?.[1];
    check("an invitation to an existing account is also mailed, linking through /n/:id", invited.status === 201 && Boolean(noteId));
    check("that entry opens for its owner only", (await as(userJar2, () => call("PUT", `/api/notifications/${noteId}`, { body: { read: true } }))).status === 200 && (await as(joinerJar, () => call("PUT", `/api/notifications/${noteId}`, { body: { read: true } }))).status === 404);
    const optOut = await as(userJar2, () => call("PUT", "/api/auth/profile", { body: { notification_prefs: { email: false } } }));
    check("PUT /api/auth/profile keeps the email switch", JSON.stringify(optOut.data.notification_prefs).includes('"email":false'));
    await call("DELETE", `/api/profiles/${spaceId}/members/${userId}`);
    from = inbox.length;
    await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: smokeEmail, role: "viewer" } });
    check("no email once the person opted out", (await mailTo(smokeEmail, from, 1500)) === null);
    const log = await call("GET", "/api/mail");
    check("the log lists what went out, without bodies", log.data.log.some((m) => m.kind === "join" && m.to_email === newbie && m.status === "sent") && log.data.log.some((m) => m.kind === "reset") && !("body" in log.data.log[0]));

    // daily summary instead of one email per event
    const hourNow = new Date().getUTCHours();
    const dg = await as(userJar2, () => call("PUT", "/api/auth/profile", { body: { notification_prefs: { email_mode: "digest", digest_hour: hourNow, tz: "UTC" } } }));
    check("PUT /api/auth/profile: once a day, with hour and zone", dg.status === 200 && dg.data.notification_prefs.email_mode === "digest" && dg.data.notification_prefs.digest_hour === hourNow && dg.data.notification_prefs.tz === "UTC");
    await call("DELETE", `/api/profiles/${spaceId}/members/${userId}`);
    from = inbox.length;
    await call("POST", `/api/profiles/${spaceId}/members`, { body: { email: smokeEmail, role: "viewer" } });
    check("in digest mode nothing is mailed right away", (await mailTo(smokeEmail, from, 1500)) === null);
    const peekDigest = await as(userJar2, () => call("GET", "/api/auth/digest"));
    check("GET /api/auth/digest previews what waits", peekDigest.status === 200 && peekDigest.data.notifications >= 1 && peekDigest.data.empty === false);
    from = inbox.length;
    const cronDigest = await call("GET", `/api/cron/reminders?key=${process.env.CRON_SECRET || "local-dev-secret"}`, { noAuth: true });
    const digestMail = await mailTo(smokeEmail, from);
    check("the scheduler mails one summary at the chosen hour", cronDigest.data.digests >= 1 && digestMail && /Sharing \(/.test(digestMail.body) && /\/n\/\d+/.test(digestMail.body), JSON.stringify(cronDigest.data));
    check("…and not twice a day", (await call("GET", `/api/cron/reminders?key=${process.env.CRON_SECRET || "local-dev-secret"}`, { noAuth: true })).data.digests === 0);
    from = inbox.length;
    const nowMail = await as(userJar2, () => call("POST", "/api/auth/digest"));
    check("POST /api/auth/digest sends it now", nowMail.status === 200 && nowMail.data.sent && Boolean(await mailTo(smokeEmail, from)));
    await as(userJar2, () => call("PUT", "/api/auth/profile", { body: { notification_prefs: { email_mode: "instant" } } }));
    // tidy up (the password goes back to what the rest of the suite expects)
    await call("PUT", `/api/users/${userId}`, { body: { password: "smoke456" } });
    check("DELETE the invited account", (await call("DELETE", `/api/users/${jme.data.id}`)).status === 200);
    check("DELETE the shared profile", (await call("DELETE", `/api/profiles/${spaceId}`)).status === 200);
    const bell = await call("GET", "/api/notifications?limit=50");
    for (const n of bell.data.items.filter((x) => /Joy Joiner/.test(x.title))) await call("DELETE", `/api/notifications/${n.id}`);
    const back = await call("PUT", "/api/mail", { body: { enabled: prev.enabled, host: prev.host, port: prev.port, secure: prev.secure, username: prev.username, from_name: prev.from_name, from_email: prev.from_email, app_url: prev.app_url, allow_reset: prev.allow_reset, allow_notifications: prev.allow_notifications, allow_invites: prev.allow_invites } });
    check("the mail settings are put back as they were", back.status === 200 && back.data.settings.enabled === prev.enabled && back.data.settings.host === prev.host);
  }
  server.close();
}

// app releases: the Android app's self-update — an administrator publishes an APK, phones ask for the newest one
{
  const zlib = await import("node:zlib");
  // a small but real APK: a ZIP holding Android's binary AndroidManifest.xml and a v2 signing block with one certificate
  const axml = ({ pkg, versionCode, versionName, target = 35 }) => {
    const strings = ["manifest", "uses-sdk", "package", "versionCode", "versionName", "targetSdkVersion", pkg, versionName];
    const enc = strings.map((t) => { const b = Buffer.from(t, "utf8"); return Buffer.concat([Buffer.from([b.length, b.length]), b, Buffer.from([0])]); });
    let strData = Buffer.concat(enc); if (strData.length % 4) strData = Buffer.concat([strData, Buffer.alloc(4 - (strData.length % 4))]);
    const offsets = Buffer.alloc(4 * strings.length); let o = 0; enc.forEach((b, i) => { offsets.writeUInt32LE(o, i * 4); o += b.length; });
    const pool = Buffer.alloc(28); pool.writeUInt16LE(1, 0); pool.writeUInt16LE(28, 2); pool.writeUInt32LE(28 + offsets.length + strData.length, 4); pool.writeUInt32LE(strings.length, 8); pool.writeUInt32LE(0, 12); pool.writeUInt32LE(0x100, 16); pool.writeUInt32LE(28 + offsets.length, 20); pool.writeUInt32LE(0, 24);
    const element = (nameIdx, attrs) => {
      const b = Buffer.alloc(36 + attrs.length * 20); b.writeUInt16LE(0x0102, 0); b.writeUInt16LE(16, 2); b.writeUInt32LE(b.length, 4); b.writeUInt32LE(1, 8); b.writeUInt32LE(0xffffffff, 12);
      b.writeUInt32LE(0xffffffff, 16); b.writeUInt32LE(nameIdx, 20); b.writeUInt16LE(20, 24); b.writeUInt16LE(20, 26); b.writeUInt16LE(attrs.length, 28);
      attrs.forEach(([name, raw, type, data], i) => { const a = 36 + i * 20; b.writeUInt32LE(0xffffffff, a); b.writeUInt32LE(name, a + 4); b.writeUInt32LE(raw, a + 8); b.writeUInt16LE(8, a + 12); b[a + 14] = 0; b[a + 15] = type; b.writeUInt32LE(data, a + 16); });
      return b;
    };
    const body = Buffer.concat([pool, offsets, strData, element(0, [[2, 6, 0x03, 6], [3, 0xffffffff, 0x10, versionCode], [4, 7, 0x03, 7]]), element(1, [[5, 0xffffffff, 0x10, target]])]);
    const head = Buffer.alloc(8); head.writeUInt16LE(3, 0); head.writeUInt16LE(8, 2); head.writeUInt32LE(8 + body.length, 4);
    return Buffer.concat([head, body]);
  };
  const apk = (opts, cert = "smoke-certificate-A") => {
    const name = Buffer.from("AndroidManifest.xml"), data = axml(opts), crc = zlib.crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const entry = Buffer.concat([local, name, data]);
    const certBytes = Buffer.from(cert);
    const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }; const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
    const value = Buffer.concat([u32(20 + certBytes.length), u32(16 + certBytes.length), u32(12 + certBytes.length), u32(0), u32(4 + certBytes.length), u32(certBytes.length), certBytes]);
    const pair = Buffer.concat([u64(4 + value.length), u32(0x7109871a), value]);
    const block = Buffer.concat([u64(pair.length + 8 + 16), pair, u64(pair.length + 8 + 16), Buffer.from("APK Sig Block 42")]);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
    const cd = Buffer.concat([central, name]);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(entry.length + block.length, 16);
    return Buffer.concat([entry, block, cd, eocd]);
  };
  const upload = (buf, notes, name = "TaskPortal.apk") => { const fd = new FormData(); fd.append("file", new Blob([buf], { type: "application/vnd.android.package-archive" }), name); if (notes) fd.append("notes", notes); return call("POST", "/api/app/releases", { form: fd }); };
  const PKG = "com.systemportal.task.smoke";
  const before = await call("GET", `/api/app/android/latest?package=${PKG}`, { noAuth: true });
  check("GET /api/app/android/latest is public and says null while nothing is published", before.status === 200 && before.data.release === null);
  check("the release list needs an administrator's session", (await call("GET", "/api/app/releases", { noAuth: true })).status === 401);
  const text = await upload(Buffer.from("just some text, not an app"), null, "notes.txt");
  check("a file that is not an APK -> 400 with a plain reason", text.status === 400 && /not a ZIP|not an Android app/.test(text.raw?.error ?? ""), JSON.stringify(text.raw));
  const foreign = await upload(apk({ pkg: "com.example.other", versionCode: 1, versionName: "1.0" }));
  check("another app's APK -> 400", foreign.status === 400 && /different app/.test(foreign.raw?.error ?? ""), JSON.stringify(foreign.raw));
  // connected apps hear about a new build at once: an "app_release" event on the live streams
  const announce = new AbortController();
  const annRes = await fetch(`${BASE}/api/notifications/stream`, { headers: { cookie: cookieHeader() }, signal: announce.signal });
  const annReader = annRes.body.getReader(); const annDec = new TextDecoder(); let annBuf = "";
  const waitRelease = async (ms = 8000) => { const until = Date.now() + ms; for (;;) { const m = annBuf.match(/event: app_release\ndata: (.*)\n/); if (m) return JSON.parse(m[1]); const left = until - Date.now(); if (left <= 0) return null; const r = await Promise.race([annReader.read(), new Promise((res) => setTimeout(() => res({ timeout: true }), left))]); if (r.timeout || r.done) return null; annBuf += annDec.decode(r.value, { stream: true }); } };
  const v1 = await upload(apk({ pkg: PKG, versionCode: 1, versionName: "0.9.0" }), "First smoke build\nSecond line");
  const ann = await waitRelease();
  check("publishing announces the build on the live streams (app_release with package and version code)", ann?.package_name === PKG && ann.version_code === 1 && ann.version_name === "0.9.0", JSON.stringify(ann));
  announce.abort();
  check("an administrator publishes a build: the file says which version it is (notes keep plain line breaks, not the form's CRLF)", v1.status === 201 && v1.data.version_code === 1 && v1.data.version_name === "0.9.0" && v1.data.package_name === PKG && v1.data.notes === "First smoke build\nSecond line" && v1.data.sha256?.length === 64 && v1.data.cert_sha256?.length === 64 && v1.data.url === `/api/app/android/download/${v1.data.id}`, JSON.stringify(v1.raw).slice(0, 300));
  const same = await upload(apk({ pkg: PKG, versionCode: 1, versionName: "0.9.0-again" }));
  check("the same version code again -> 409", same.status === 409 && /not newer/.test(same.raw?.error ?? ""), JSON.stringify(same.raw));
  const otherKey = await upload(apk({ pkg: PKG, versionCode: 2, versionName: "0.9.1" }), null, "TaskPortal.apk");
  const otherKey2 = otherKey.status === 201 ? null : otherKey; // (same key: accepted below)
  const wrongKey = await upload(apk({ pkg: PKG, versionCode: 3, versionName: "0.9.2" }, "smoke-certificate-B"));
  check("a build signed with another key -> 409 (phones would refuse it)", wrongKey.status === 409 && /different key/.test(wrongKey.raw?.error ?? ""), JSON.stringify(wrongKey.raw));
  check("a newer build with the same key is accepted", otherKey.status === 201 && otherKey.data.version_code === 2 && otherKey2 === null, JSON.stringify(otherKey.raw).slice(0, 200));
  const latest = await call("GET", `/api/app/android/latest?package=${PKG}`, { noAuth: true });
  check("latest now names the newest build with size, checksum and URL", latest.status === 200 && latest.data.release?.version_code === 2 && latest.data.release.version_name === "0.9.1" && latest.data.release.size_bytes > 0 && latest.data.release.url === `/api/app/android/download/${otherKey.data.id}`);
  const dl = await fetch(`${BASE}${latest.data.release.url}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  const { createHash } = await import("node:crypto");
  check("the APK downloads publicly, byte for byte, with its checksum in a header", dl.status === 200 && dl.headers.get("content-type") === "application/vnd.android.package-archive" && bytes.length === latest.data.release.size_bytes && createHash("sha256").update(bytes).digest("hex") === latest.data.release.sha256 && dl.headers.get("x-checksum-sha256") === latest.data.release.sha256 && /TaskPortal-0\.9\.1\.apk/.test(dl.headers.get("content-disposition") ?? ""));
  check("the release app's package is untouched by the smoke builds", (await call("GET", "/api/app/android/latest", { noAuth: true })).data.release?.package_name !== PKG);
  const list = await call("GET", "/api/app/releases");
  check("the admin list shows both builds, newest first, with the uploader's name", list.status === 200 && list.data.filter((r) => r.package_name === PKG).map((r) => r.version_code).join(",") === "2,1" && list.data.find((r) => r.package_name === PKG)?.uploaded_by_name);
  const del2 = await call("DELETE", `/api/app/releases/${otherKey.data.id}`);
  check("removing the newest build offers the previous one again", del2.status === 200 && (await call("GET", `/api/app/android/latest?package=${PKG}`, { noAuth: true })).data.release?.version_code === 1);
  check("…and its file is gone", (await fetch(`${BASE}/api/app/android/download/${otherKey.data.id}`)).status === 404);
  await call("DELETE", `/api/app/releases/${v1.data.id}`);
  check("the smoke builds are cleaned up", (await call("GET", `/api/app/android/latest?package=${PKG}`, { noAuth: true })).data.release === null);
}

console.log("cleanup");
{
  const u = await call("DELETE", `/api/users/${userId}`);
  check("DELETE user (cascades their workspace)", u.status === 200);
  const gonePhoto = await call("GET", `/api/chat/photos/${chatPhotoId}`);
  check("their chat photos are gone with the account", gonePhoto.status === 404);
}
{
  const t = await call("DELETE", `/api/tasks/${taskId}`);
  check("DELETE task", t.status === 200);
  const rq = await call("DELETE", `/api/requirements/${reqIds[0]}`);
  check("DELETE requirement (cleanup)", rq.status === 200);
  const gone = await call("GET", `/api/tasks/${taskId}`);
  check("task 404 after delete", gone.status === 404);
  const e = await call("DELETE", `/api/employees/${employeeId}`);
  check("DELETE employee", e.status === 200);
  const p = await call("DELETE", `/api/projects/${projectId}`);
  check("DELETE project", p.status === 200);
  const nf = await call("GET", `/api/projects/${projectId}`);
  check("project 404 after delete", nf.status === 404);
  const bin = await call("DELETE", "/api/trash");
  check("the run empties its recycle bin at the end", bin.status === 200 && (await call("GET", "/api/trash")).data.items.length === 0);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
