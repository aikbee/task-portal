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
  const notUser = await call("PUT", "/api/auth/workspace", { body: { user_id: 1 } });
  const bgAsUser = await call("PUT", "/api/settings/backgrounds", { body: { enabled: ["none"], default: "none" } });
  check("role user cannot change background settings (403)", bgAsUser.status === 403);
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
  const fdFake = new FormData();
  fdFake.append("files", new Blob(["hello"], { type: "image/png" }), "fake.png");
  const fake = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { form: fdFake }));
  check("a text file disguised as a PNG is kept as a plain file, not a photo", fake.status === 201 && fake.data.attachments[0].kind === "file" && fake.data.attachments[0].mime === "image/png");

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
  const cannotRemove = await as(adminJar, () => call("DELETE", `/api/chat/conversations/${gid}/members/${userId}`));
  check("a member cannot remove people -> 403", cannotRemove.status === 403);
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
  const leaveDirect = await as(userJar, () => call("DELETE", `/api/chat/conversations/${convoId}`));
  check("direct chats cannot be left -> 400", leaveDirect.status === 400);

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
  const unfriend = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}`));
  check("unfriend", unfriend.status === 200 && unfriend.data.friends.every((u) => u.id !== userId));
  const afterUnfriend = await as(userJar, () => call("POST", `/api/chat/conversations/${convoId}/messages`, { body: { body: "?" } }));
  check("no messages after unfriending -> 403", afterUnfriend.status === 403);
  const keepsHistory = await as(userJar, () => call("GET", `/api/chat/conversations/${convoId}/messages`));
  check("history is still readable", keepsHistory.status === 200 && keepsHistory.data.length === 13);
  const notFriends = await as(adminJar, () => call("DELETE", `/api/chat/friends/${userId}`));
  check("unfriending again -> 404", notFriends.status === 404);

  // tidy the admin's bell (the smoke user's rows go with the account)
  const bell = await as(adminJar, () => call("GET", "/api/notifications?limit=50"));
  for (const n of bell.data.items.filter((x) => ["friend_request", "friend_accepted", "chat_message"].includes(x.type) && (x.actor_id === userId || x.entity_id === convoId))) await as(adminJar, () => call("DELETE", `/api/notifications/${n.id}`));
  jar = { ...adminJar };
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
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
