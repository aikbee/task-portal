import { headers } from "next/headers";
import Link from "next/link";
import { Download, KeyRound, ArrowUpRight } from "lucide-react";
import Logo from "@/components/ui/Logo";
import { CodeBlock, CodeTabs } from "@/components/dev/CodeBlock";
import { ENDPOINTS, API_BASE, WEBHOOK_EVENT_DOCS, STATUSES, PRIORITIES } from "@/lib/api-docs";
import { API_SCOPES, READ_SCOPES } from "@/lib/api-scopes";
import { RATE } from "@/lib/api-tokens";

export const metadata = { title: "API", description: "Create, assign, update and follow Task Portal tasks from other systems." };

/** The address readers reached the portal at, so every sample can be pasted as it is. */
async function originOf() {
  const env = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const METHOD_TONE = {
  GET: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  POST: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  PATCH: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  PUT: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  DELETE: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
};
const Method = ({ m, small = false }) => <span className={`inline-flex shrink-0 items-center justify-center rounded font-mono font-semibold ${small ? "w-11 px-1 text-[9.5px]" : "px-1.5 py-0.5 text-[11px]"} ${METHOD_TONE[m]}`}>{m}</span>;
const C = ({ children }) => <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.86em]">{children}</code>;
const SAMPLE_IDS = { id: 1287, fileId: 58 };
const IDEM_SAMPLE = "3f0c2a9e-5b7d-4c1e-9a8f-6d2b1e4c7a90";

function curlOf(e, base) {
  const path = e.path.replace(/\{(\w+)\}/g, (_, k) => SAMPLE_IDS[k] ?? 1);
  const lines = [`curl ${e.method === "GET" ? "" : `-X ${e.method} `}"${base}${path}${e.exampleQuery ? `?${e.exampleQuery}` : ""}"`, `  -H "Authorization: Bearer $TASK_PORTAL_TOKEN"`];
  if (e.idempotent) lines.push(`  -H "Idempotency-Key: ${IDEM_SAMPLE}"`);
  if (e.body) lines.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(e.body.example, null, 2).replace(/\n/g, "\n  ")}'`);
  if (e.multipart) lines.push(`  -F "files=@quote.pdf"`);
  if (e.binary) lines.push(`  -o quote.pdf`);
  return lines.join(" \\\n");
}

function FieldTable({ title, fields }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{title}</h4>
      <div className="overflow-x-auto rounded-app border border-line">
        <table className="w-full text-left text-[13px]">
          <tbody className="divide-y divide-line">
            {fields.map((f) => (
              <tr key={f.name} className="align-top">
                <td className="w-[38%] px-3 py-2">
                  <code className="font-mono text-[12.5px] font-medium">{f.name}</code>
                  {f.required ? <span className="ml-1.5 text-[10px] font-semibold uppercase text-rose-500">required</span> : null}
                  <div className="text-[11px] text-fg-faint">{f.type === "array" ? `list of ${f.items ?? "string"}s` : f.type}</div>
                </td>
                <td className="px-3 py-2 text-fg-muted">{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="dev-section scroll-mt-20">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[14.5px] leading-relaxed text-fg-muted [&_strong]:text-fg">{children}</div>
    </section>
  );
}

const GUIDE = [
  ["start", "Getting started"],
  ["auth", "Tokens and permissions"],
  ["format", "Requests and answers"],
  ["limits", "Limits"],
  ["paging", "Paging and keeping in step"],
  ["retries", "Safe retries"],
  ["external-id", "Your own ids"],
  ["webhooks", "Webhooks"],
];

/** The API guide: public, no data. The endpoints come from lib/api-docs.js, like /api/v1/openapi.json. */
export default async function DevelopersPage() {
  const origin = await originOf();
  const base = `${origin}${API_BASE}`;
  const firstTask = { title: "Call back Acme about the renewal", priority: "high", assignees: ["hannah@example.com"], due_date: "2026-10-20", external_id: "CRM-1042" };
  const nav = (
    <>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Guide</p>
      <ul className="space-y-0.5">
        {GUIDE.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">{label}</a></li>)}
      </ul>
      {ENDPOINTS.map((g) => (
        <div key={g.group} className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((e) => (
              <li key={e.id}>
                <a href={`#${e.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"><Method m={e.method} small /> <span className="truncate">{e.summary}</span></a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <div className="dev-docs min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={26} /> <span className="hidden sm:inline">Task Portal</span></Link>
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">API v1</span>
          <nav className="ml-auto flex items-center gap-2">
            <a href={`${API_BASE}/openapi.json`} download="task-portal-openapi.json" className="dev-openapi inline-flex h-8 items-center gap-1.5 rounded-app-sm border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2"><Download size={14} /> OpenAPI</a>
            <Link href="/integrations?tab=api" className="inline-flex h-8 items-center gap-1.5 rounded-app-sm bg-accent px-3 text-xs font-medium text-white hover:bg-accent-strong"><KeyRound size={14} /> <span className="hidden sm:inline">Make a token</span><span className="sm:hidden">Token</span></Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6 pr-1">{nav}</div>
        </aside>

        <main className="min-w-0 max-w-3xl space-y-14">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Task Portal API</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              Let another system (a CRM, a help desk, a web form, a script) create tasks in Task Portal, assign them to people, update them and check their status, and hear about changes through webhooks. JSON over HTTPS, with a personal token.
            </p>
            <details className="mt-5 rounded-app border border-line bg-surface p-3 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium">Contents</summary>
              <div className="mt-3">{nav}</div>
            </details>
          </div>

          <Section id="start" title="Getting started">
            <ol className="list-decimal space-y-2 pl-5">
              <li><strong>Make a token.</strong> In Task Portal open <Link href="/integrations?tab=api" className="text-accent hover:underline">Integrations → Task Portal API</Link> (the account menu, top right). Name it after the system that will use it, pick what it may do, and copy it: it is shown once.</li>
              <li><strong>Send it with every request</strong> in the <C>Authorization</C> header: <C>Authorization: Bearer tp_…</C>. Keep it on a server; anybody holding it can act as you.</li>
              <li><strong>Check that it works:</strong></li>
            </ol>
            <CodeBlock code={`curl "${base}/me" \\\n  -H "Authorization: Bearer $TASK_PORTAL_TOKEN"`} />
            <p>Every address below starts with <C>{base}</C>. Then create your first task:</p>
            <CodeTabs
              samples={[
                { label: "curl", code: curlOf({ method: "POST", path: "/tasks", idempotent: true, body: { example: firstTask } }, base) },
                {
                  label: "JavaScript",
                  code: `const res = await fetch("${base}/tasks", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.TASK_PORTAL_TOKEN}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify(${JSON.stringify(firstTask, null, 2).replace(/\n/g, "\n  ")}),
});
const { data: task, error } = await res.json();
if (!res.ok) throw new Error(error);
console.log(task.id, task.status, task.url);`,
                },
                {
                  label: "Python",
                  code: `import os, uuid, requests

res = requests.post(
    "${base}/tasks",
    headers={
        "Authorization": f"Bearer {os.environ['TASK_PORTAL_TOKEN']}",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json=${JSON.stringify(firstTask, null, 4).replace(/\n/g, "\n    ")},
    timeout=30,
)
body = res.json()
if not res.ok:
    raise RuntimeError(body["error"])
task = body["data"]
print(task["id"], task["status"], task["url"])`,
                },
              ]}
            />
            <p>
              The people on the task hear about it as if somebody had assigned them in the app. Prefer a ready-made client? Import <a href={`${API_BASE}/openapi.json`} className="text-accent hover:underline">openapi.json</a> into Postman, Insomnia or Swagger UI, or generate one from it.
            </p>
          </Section>

          <Section id="auth" title="Tokens and permissions">
            <p>
              A token belongs to the person who made it and works inside <strong>one profile</strong> (workspace), as that person: it sees and changes what they may see and change there. In a profile somebody shared with them, their role still applies (a viewer&apos;s token only reads). What a token changes is recorded under their name with the token&apos;s: a task&apos;s history says <em>via Acme CRM</em>.
            </p>
            <p>When you make a token you choose what it may do:</p>
            <div className="overflow-x-auto rounded-app border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-fg-faint">
                  <tr><th className="px-3 py-2 font-semibold">Permission</th><th className="px-3 py-2 font-semibold">Allows</th><th className="px-3 py-2 text-center font-semibold">Read</th><th className="px-3 py-2 text-center font-semibold">Read &amp; write</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(API_SCOPES).map(([k, s]) => (
                    <tr key={k} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2"><code className="font-mono text-[12.5px] font-medium text-fg">{k}</code></td>
                      <td className="px-3 py-2">{s.description}</td>
                      <td className="px-3 py-2 text-center">{READ_SCOPES.includes(k) ? "✓" : ""}</td>
                      <td className="px-3 py-2 text-center">✓</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Or pick permissions one by one. A token can also be limited to <strong>allowed addresses</strong> (IP addresses or CIDR ranges, IPv4 or IPv6): requests from anywhere else get <C>403</C>. Tokens never reach account and administration routes (signing in, other tokens, users, settings, chat). Revoke a token and it stops working at once; an administrator can also turn API tokens off for an account.
            </p>
            <p><C>GET /me</C> answers who the token acts as, in which profile, with which permissions and limits.</p>
          </Section>

          <Section id="format" title="Requests and answers">
            <p>
              Send JSON with <C>Content-Type: application/json</C> (files: <C>multipart/form-data</C>). Every answer is JSON, with what you asked for in <C>data</C>; when something is wrong, <C>error</C> says what in a sentence and <C>details</C> sometimes adds more. Fields the API does not know are refused rather than ignored, so a typo does not go unnoticed.
            </p>
            <CodeBlock label="An error" code={JSON.stringify({ error: "Nobody in this workspace matches: liam@example.com.", details: { unknown: ["liam@example.com"] } }, null, 2)} />
            <div className="overflow-x-auto rounded-app border border-line">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-line">
                  {[
                    ["200, 201", "Done (201: created)."],
                    ["400", "The request is not valid; error says why."],
                    ["401", "No token, or a wrong, revoked or expired one."],
                    ["403", "The token may not do this: a permission it lacks, an address it may not come from, a view-only role, or a feature turned off for the account."],
                    ["404", "Not found in the token's profile."],
                    ["409", "A conflict: the external_id is in use, or a request with the same Idempotency-Key is still running."],
                    ["422", "The Idempotency-Key was used for a different request."],
                    ["429", "Too many requests: wait as many seconds as Retry-After says."],
                    ["5xx", "Trouble on our side: try again a little later."],
                  ].map(([code, text]) => (
                    <tr key={code} className="align-top"><td className="whitespace-nowrap px-3 py-2 font-mono text-[12.5px] font-medium text-fg">{code}</td><td className="px-3 py-2">{text}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Dates are <C>YYYY-MM-DD</C>; times are ISO 8601 in UTC, like <C>2026-10-14T05:40:51.000Z</C>.</li>
              <li>Statuses: {STATUSES.map((s, i) => <span key={s}>{i ? ", " : ""}<C>{s}</C></span>)}. Priorities: {PRIORITIES.map((s, i) => <span key={s}>{i ? ", " : ""}<C>{s}</C></span>)}.</li>
              <li>People are named by <strong>email</strong> (the employee&apos;s own, or the email of the Task Portal account linked to them) or by employee id; <C>GET /people</C> lists them. Projects are named by <strong>code</strong> or id; <C>GET /projects</C> lists them.</li>
            </ul>
          </Section>

          <Section id="limits" title="Limits">
            <p>
              Each token may make <strong>{RATE.perMinute} requests a minute</strong> and <strong>{RATE.perDay} a day</strong>. Every answer says how many are left in <C>X-RateLimit-Limit</C>, <C>X-RateLimit-Remaining</C> and <C>X-RateLimit-Reset</C> (Unix time). Over the limit the API answers <C>429</C> with a <C>Retry-After</C> header in seconds. An address that keeps sending wrong tokens is made to wait as well. Files go up to 50 MB each.
            </p>
          </Section>

          <Section id="paging" title="Paging and keeping in step">
            <p>
              <C>GET /tasks</C> answers a page at a time: <C>limit</C> tasks (1 to 200, default 50) and a <C>next_cursor</C>. Send it back as <C>cursor</C> for the next page; on the last page it is <C>null</C>. Without other instructions the most recently changed task comes first.
            </p>
            <p>
              To keep another system in step, remember when you last asked and ask for what changed since with <C>updated_since</C>: the oldest change comes first, so you can walk forward page by page and pick up where you stopped. A task that changed again comes again; key your copy on its <C>id</C>.
            </p>
            <CodeBlock
              label="JavaScript"
              code={`let cursor = null;
do {
  const url = new URL("${base}/tasks");
  url.searchParams.set("updated_since", lastSync); // like "2026-10-14T00:00:00Z"
  url.searchParams.set("limit", "200");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { Authorization: \`Bearer \${token}\` } });
  const page = await res.json();
  for (const task of page.data) await saveCopy(task); // by task.id
  cursor = page.next_cursor;
} while (cursor);`}
            />
          </Section>

          <Section id="retries" title="Safe retries">
            <p>
              A timeout can leave you unsure whether a task was created. Send an <C>Idempotency-Key</C> header (any string up to 100 characters; a UUID will do) with <C>POST</C> requests. Repeat the same request with the same key within 24 hours and the API does not do it twice: it answers what it answered the first time, with <C>Idempotent-Replayed: true</C>.
            </p>
            <p>
              The same key on a different request answers <C>422</C>; while the first request is still running, <C>409</C> (try again in a moment). Creating tasks, comments, time entries and files all take a key.
            </p>
          </Section>

          <Section id="external-id" title="Your own ids">
            <p>
              Give a task the id your system knows it by in <C>external_id</C> (up to 120 characters, unique within the profile), and find it again with <C>GET /tasks?external_id=CRM-1042</C>. Creating another task with an <C>external_id</C> that is taken answers <C>409</C>, with the id of the task that has it in <C>details.id</C>.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <p>
              Instead of asking again and again, let Task Portal tell you. The owner or a manager of a profile adds webhooks under <strong>Profiles → Webhooks</strong>: an https address, the events to send, and a secret to sign them with.
            </p>
            <div className="overflow-x-auto rounded-app border border-line">
              <table className="w-full text-left text-[13px]">
                <tbody className="divide-y divide-line">
                  {Object.entries(WEBHOOK_EVENT_DOCS).map(([k, text]) => (
                    <tr key={k} className="align-top"><td className="whitespace-nowrap px-3 py-2"><code className="font-mono text-[12.5px] font-medium text-fg">{k}</code></td><td className="px-3 py-2">{text}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock
              label="What arrives (POST, JSON)"
              code={JSON.stringify({ event: "task.status_changed", at: "2026-10-14T06:02:11.000Z", profile: { id: 2, name: "Support" }, actor: { id: 2, name: "Hannah Weiss", via: "Acme CRM" }, data: { id: 1287, title: "Call back Acme about the renewal", status: "done", from: "review", to: "done", "…": "…" } }, null, 2)}
            />
            <p>
              <C>data</C> holds the record as Task Portal stores it; <C>actor.via</C> names the API token when the change came through one. For a task in the shape this guide describes, ask <C>GET /tasks/&#123;id&#125;</C>. Each delivery carries <C>X-TaskPortal-Event</C>, <C>X-TaskPortal-Delivery</C> and <C>X-TaskPortal-Signature: sha256=…</C>, the HMAC-SHA256 of the raw body with your secret. Check it before you trust the body:
            </p>
            <CodeBlock
              label="Node.js"
              code={`import crypto from "node:crypto";

function isFromTaskPortal(rawBody, signature, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature?.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`}
            />
            <p>
              Answer with a 2xx within 8 seconds. A delivery that fails is tried again 1, 5 and 25 minutes later; a webhook that fails 20 times in a row is paused and its owner is told.
            </p>
          </Section>

          {ENDPOINTS.map((g) => (
            <section key={g.group} id={`group-${g.group.toLowerCase()}`} className="dev-group scroll-mt-20 space-y-5">
              <h2 className="text-xl font-semibold tracking-tight">{g.group}</h2>
              {g.items.map((e) => (
                <article key={e.id} id={e.id} className="dev-endpoint scroll-mt-20 rounded-app-lg border border-line bg-surface p-5 shadow-app">
                  <div className="flex flex-wrap items-center gap-2">
                    <Method m={e.method} />
                    <code className="break-all font-mono text-[13.5px] font-medium">{API_BASE}{e.path}</code>
                    <a href={`#${e.id}`} className="ml-auto text-fg-faint hover:text-fg" aria-label="Link to this endpoint"><ArrowUpRight size={14} /></a>
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{e.summary}</h3>
                  {e.description ? <p className="mt-1 text-sm leading-relaxed text-fg-muted">{e.description}</p> : null}
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full border border-line px-2 py-0.5 text-fg-muted">{e.scope ? <>permission <code className="font-mono text-fg">{e.scope}</code></> : "any token"}</span>
                    {e.idempotent ? <span className="rounded-full border border-line px-2 py-0.5 text-fg-muted">takes <code className="font-mono text-fg">Idempotency-Key</code></span> : null}
                  </div>
                  {e.query?.length ? <FieldTable title="Query parameters" fields={e.query} /> : null}
                  {e.body ? <FieldTable title="Body (JSON)" fields={e.body.fields} /> : null}
                  {e.multipart ? <FieldTable title="Body (multipart/form-data)" fields={[{ name: "files", type: "array", items: "file", description: "One part per file, all named files. Up to 50 MB each.", required: true }]} /> : null}
                  <div className="mt-4 space-y-3">
                    <CodeBlock label="Request" code={curlOf(e, base)} />
                    {e.response?.example ? <CodeBlock label={`Answer · ${e.response.status ?? 200}`} code={JSON.stringify(e.response.example, null, 2)} /> : <p className="text-xs text-fg-faint">Answers the file itself, with its type and name.</p>}
                  </div>
                </article>
              ))}
            </section>
          ))}

          <footer className="border-t border-line pt-6 text-xs text-fg-faint">
            Task Portal API v1. Names and shapes under <C>{API_BASE}</C> stay as they are; additions come as new fields and new endpoints. The machine-readable description is at <a href={`${API_BASE}/openapi.json`} className="text-accent hover:underline">{API_BASE}/openapi.json</a>.
          </footer>
        </main>
      </div>
    </div>
  );
}
