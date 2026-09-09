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
  check("GET /api/auth/me", me.data?.email === "admin@example.com" && !("password_hash" in (me.data || {})));
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
  // sign in as the new user in a separate cookie jar
  jar = {};
  const login = await call("POST", "/api/auth/login", { body: { email: `smoke.user.${suffix.toLowerCase()}@example.com`, password: "smoke123" }, noAuth: true });
  check("new user can log in", login.status === 200 && Boolean(jar.ap_session));
  const forbidden = await call("GET", "/api/users");
  check("role user -> 403 on /api/users", forbidden.status === 403);
  const projectsOk = await call("GET", "/api/projects");
  check("role user can read projects", projectsOk.status === 200);

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

console.log("cleanup");
{
  const u = await call("DELETE", `/api/users/${userId}`);
  check("DELETE user (cascades their workspace)", u.status === 200);
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
