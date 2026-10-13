"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Send, Ticket, Search, RefreshCw, Unlink, ExternalLink, FileText, MessageSquare, Paperclip, ListChecks, Clock, CircleCheck, CircleAlert, ArrowLeft, ArrowRight, Plug, TriangleAlert, X, UserCheck, TicketCheck } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Input, Select, Checkbox, Segmented } from "@/components/ui/Controls";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useFeature, useAccess } from "@/lib/auth-context";
import { TASK_STATUS } from "@/lib/modules";
import { formatBytes, formatDate, relativeTime, cn } from "@/lib/utils";
import { formatMinutes } from "@/lib/duration";
import { useT, useLocale } from "@/lib/i18n";
import { PMS_CATEGORIES, PMS_CATEGORY_LABEL, PMS_WORK_KINDS, PMS_KIND_LABEL, PMS_LANGS, PMS_STATUS_TONE, pmsStatusText, PRIORITY_TO_PMS } from "@/lib/pms-shared";

/* ---------- small pieces ---------- */

const pad = (n) => String(n).padStart(2, "0");
/** "+08:00": this browser's offset on that local date and time. */
function offsetOf(date, time) {
  const m = -new Date(`${date}T${time}:00`).getTimezoneOffset();
  return `${m >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
}
const localParts = (iso) => {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const startedAt = (date, time) => `${date}T${time}:00${offsetOf(date, time)}`;
const KEY_RE = /^[A-Za-z][A-Za-z0-9]{1,9}-\d{1,9}$/;
const FIELD = { title: "title", description: "description", priority: "priority", dueAt: "due date" };
/** The slots of a PMS ticket: the owner answers for it overall, developer and tester for their stage. */
const ROLE_WORD = { owner: "ticket owner", dev: "developer", test: "tester" };

function ClaimSelect({ value, onChange, withNone = true, className }) {
  const tr = useT();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={cn("pms-claim h-8 w-40 text-xs", className)} aria-label={tr("Claim it")}>
      {withNone ? <option value="">{tr("Don't claim")}</option> : null}
      {Object.entries(ROLE_WORD).map(([k, w]) => <option key={k} value={k}>{tr("As {role}", { role: tr(w) })}</option>)}
    </Select>
  );
}

/** The linked ticket: its key and status. */
export function TicketChip({ link, className }) {
  const tr = useT();
  const locale = useLocale();
  if (!link) return null;
  if (!link.ticket_key) return <Badge tone="amber" className={className}>{tr("Ticket key unknown")}</Badge>;
  return (
    <span className={cn("pms-ticket inline-flex max-w-full items-center gap-1.5", className)}>
      <span className="font-mono text-[11px] font-semibold">{link.ticket_key}</span>
      {link.ticket_status ? <Badge tone={PMS_STATUS_TONE[link.ticket_status] ?? "slate"} dot>{pmsStatusText(link.ticket_status, locale)}</Badge> : null}
    </span>
  );
}
function StateBadge({ state }) {
  const tr = useT();
  if (state === "changed") return <Badge tone="amber">{tr("Changed")}</Badge>;
  if (state === "sent") return <Badge tone="emerald">{tr("Sent")}</Badge>;
  if (state === "new") return <Badge tone="sky">{tr("Not sent")}</Badge>;
  return null;
}
function ShowText({ text }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-medium text-accent hover:underline">{open ? tr("Hide the text") : tr("Show the text")}</button>
      {open ? <pre className="pms-text mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-app-sm border border-line bg-surface-2/60 p-2.5 font-sans text-xs leading-relaxed">{text}</pre> : null}
    </div>
  );
}

/** What a step does, in words. */
function opLabel(tr, o) {
  switch (o.op) {
    case "ticket.create": return tr("Raise a ticket in {project}", { project: o.project });
    case "ticket.link": return tr("Link to {key}", { key: o.key });
    case "ticket.update": return o.skip ? tr("{key} already shows the task as it is", { key: o.key }) : tr("Update {key}: {fields}", { key: o.key, fields: (o.changed ?? []).map((f) => tr(FIELD[f] ?? f)).join(", ") });
    case "ticket.close":
      if (o.skip) return tr("{key} is closed already", { key: o.key });
      return o.key ? tr("Close {key} in Bitara PMS", { key: o.key }) : tr("Close the new ticket in Bitara PMS");
    case "ticket.claim": {
      const role = tr(ROLE_WORD[o.role] ?? o.role);
      if (o.skip) return tr("{key} is claimed as {role} already", { key: o.key, role });
      return o.key ? tr("Claim {key} as {role}", { key: o.key, role }) : tr("Claim the new ticket as {role}", { role });
    }
    case "comment":
      if (o.what === "output") return tr("Comment: output “{name}”", { name: o.name || tr("Untitled") });
      if (o.what === "checklist") return tr("Comment: the checklist");
      return tr("Comment: {name}, {date}", { name: o.name, date: formatDate(o.date) });
    case "file": return tr("Attach “{name}” ({size})", { name: o.name, size: formatBytes(o.size) });
    case "worklogs": return tr(o.count === 1 ? "Log 1 time entry ({time}) as {kind}" : "Log {n} time entries ({time}) as {kind}", { n: o.count, time: formatMinutes(o.minutes), kind: tr(PMS_KIND_LABEL[o.kind] ?? o.kind) });
    case "worklog.update": return o.skip ? tr("The time entry of {date} is already in Bitara PMS", { date: formatDate(o.date) }) : tr("Correct the time entry of {date} in Bitara PMS", { date: formatDate(o.date) });
    default: return o.label;
  }
}
const OP_ICON = { "ticket.create": Ticket, "ticket.link": Ticket, "ticket.update": Ticket, "ticket.claim": UserCheck, "ticket.close": TicketCheck, comment: MessageSquare, file: Paperclip, worklogs: Clock, "worklog.update": Clock };

/* ---------- the choice per task ---------- */

function initialChoice(plan) {
  const time = {};
  for (const e of plan.time) {
    const from = e.began_at ? localParts(e.began_at) : e.sent_start ? { date: e.sent_start.slice(0, 10), time: e.sent_start.slice(11, 16) } : { date: e.spent_on, time: "" };
    time[e.id] = { on: false, ...from, timer: Boolean(e.began_at) };
  }
  return {
    mode: plan.link ? "keep" : plan.target ? "create" : "link",
    update: false,
    claim: plan.link ? "" : "owner", // a ticket raised from here is claimed as its owner unless the person says otherwise
    close: false,
    reason: "",
    key: "",
    category: "FEATURE",
    lang: plan.lang,
    includeChecklist: plan.checklist.total > 0 && (!plan.link || plan.ticket.checklist_in_description),
    checklist: false,
    outputs: [],
    comments: [],
    files: [],
    time,
  };
}
const pickedCount = (c) => (c.mode === "create" || c.mode === "link" ? 1 : 0) + (c.update ? 1 : 0) + (c.claim && c.mode === "keep" ? 1 : 0) + (c.close ? 1 : 0) + (c.checklist ? 1 : 0) + c.outputs.length + c.comments.length + c.files.length + Object.values(c.time).filter((t) => t.on).length;
function problemOf(tr, plan, c) {
  if (c.mode === "create" && !plan.target) return plan.target_error ? tr(plan.target_error) : tr("This task has nowhere to go yet.");
  if (c.mode === "link" && !KEY_RE.test(c.key.trim())) return tr("Enter the key of the ticket, like {example}.", { example: `${plan.target?.pms_project ?? "PROJECT"}-12` });
  if (Object.values(c.time).some((t) => t.on && !/^\d{2}:\d{2}$/.test(t.time))) return tr("Give each time entry you send a start time.");
  if (c.close && !c.reason.trim()) return tr("Give a reason for closing the ticket.");
  return null;
}
function bodyOf(c, { kind, internal }) {
  const body = {
    kind, internal, lang: c.lang, checklist: c.checklist, outputs: c.outputs, comments: c.comments, files: c.files, claim: c.claim || null, close: c.close ? { reason: c.reason.trim() } : null,
    time: Object.entries(c.time).filter(([, t]) => t.on).map(([id, t]) => ({ id: Number(id), started_at: startedAt(t.date, t.time) })),
  };
  if (c.mode === "create") body.ticket = { mode: "create", category: c.category, lang: c.lang, include_checklist: c.includeChecklist };
  else if (c.mode === "link") body.ticket = { mode: "link", key: c.key.trim().toUpperCase() };
  else if (c.update) body.ticket = { mode: "update", include_checklist: c.includeChecklist };
  return body;
}

function Section({ icon: Icon, title, onAll, allLabel, children }) {
  return (
    <div className="pms-section">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        <Icon size={12} /> <span className="flex-1">{title}</span>
        {onAll ? <button type="button" onClick={onAll} className="font-medium normal-case tracking-normal text-accent hover:underline">{allLabel}</button> : null}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ checked, onChange, children, state, disabled, className }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-app-sm px-1.5 py-1 text-sm hover:bg-surface-2", disabled && "cursor-default opacity-60", className)}>
      <Checkbox checked={checked} onChange={(v) => !disabled && onChange(v)} disabled={disabled} className="mt-0.5" />
      <span className="min-w-0 flex-1">{children}</span>
      <StateBadge state={state} />
    </label>
  );
}

function TaskChoice({ plan, choice, set, onDrop }) {
  const tr = useT();
  const toggle = (k, id) => (on) => set({ ...choice, [k]: on ? [...choice[k], id] : choice[k].filter((x) => x !== id) });
  const fresh = (list) => list.filter((x) => x.state !== "sent").map((x) => x.id);
  const t = plan.task;
  const linked = plan.link;
  const facts = [PRIORITY_TO_PMS[t.priority], t.due_date ? tr("due {date}", { date: formatDate(t.due_date) }) : null, t.estimate_hours != null ? tr("estimate {time}", { time: formatMinutes(Number(t.estimate_hours) * 60) }) : null].filter(Boolean).join(" · ");
  const problem = problemOf(tr, plan, choice);
  return (
    <Card className="pms-task space-y-3 !p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/tasks/${t.id}`} target="_blank" className="block truncate font-semibold hover:text-accent">{t.title}</Link>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            {t.project_name ? <span>{t.project_name}</span> : <span>{tr("No project")}</span>}
            <ArrowRight size={11} />
            {linked ? <TicketChip link={linked} /> : plan.target ? <span className="font-mono font-medium text-fg">{plan.target.pms_project}</span> : <span className="text-amber-600">{tr("nowhere yet")}</span>}
            {plan.target?.mode === "SUGGEST_ONLY" ? <span className="text-fg-faint">· {tr("status changes stay in Bitara PMS")}</span> : null}
          </p>
        </div>
        <Select value={choice.lang} onChange={(e) => set({ ...choice, lang: e.target.value })} className="pms-lang h-8 w-32 text-xs" aria-label={tr("Language")}>
          {Object.entries(PMS_LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {onDrop ? <Button size="iconSm" variant="ghost" icon={X} onClick={onDrop} aria-label={tr("Leave this task out")} data-tip={tr("Leave this task out")} /> : null}
      </div>

      <Section icon={Ticket} title={tr("Ticket")}>
        {linked?.ticket_key ? (
          linked.created_here ? (
            <Row checked={choice.update} onChange={(v) => set({ ...choice, update: v })} state={plan.ticket.state === "changed" ? "changed" : undefined}>
              {tr("Update the ticket's title, description, priority and due date")}
              <span className="block text-[11px] text-fg-muted">{plan.ticket.state === "changed" ? tr("The task changed since it was sent. A ticket somebody edited in Bitara PMS is never overwritten.") : tr("The ticket already shows the task as it is.")}</span>
            </Row>
          ) : <p className="px-1.5 text-xs text-fg-muted">{tr("Linked to an existing ticket: what you pick below goes to it.")}</p>
        ) : null}
        {linked?.ticket_key ? (
          linked.claimed_as ? (
            <p className="flex items-center gap-1.5 px-1.5 text-xs text-emerald-600 dark:text-emerald-400"><UserCheck size={13} /> {tr("You claimed it as {role}", { role: tr(ROLE_WORD[linked.claimed_as] ?? linked.claimed_as) })}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-app-sm px-1.5 py-0.5">
              <Checkbox checked={Boolean(choice.claim)} onChange={(v) => set({ ...choice, claim: v ? "owner" : "" })} label={tr("Claim this ticket")} className="pms-claim-on" />
              {choice.claim ? <ClaimSelect value={choice.claim} onChange={(r) => set({ ...choice, claim: r })} withNone={false} /> : null}
            </div>
          )
        ) : (
          <div className="space-y-2 px-1.5">
            <Segmented size="sm" value={choice.mode} onChange={(v) => set({ ...choice, mode: v })} className="pms-mode [&_.ui-seg-btn]:whitespace-nowrap [&_.ui-seg-btn]:px-3" options={[{ value: "create", label: tr("New ticket") }, { value: "link", label: tr("Existing ticket") }]} />
            {choice.mode === "create" ? (
              plan.target ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={choice.category} onChange={(e) => set({ ...choice, category: e.target.value })} className="pms-category h-8 w-44 text-xs" aria-label={tr("Category")}>
                      {PMS_CATEGORIES.map((k) => <option key={k} value={k}>{tr(PMS_CATEGORY_LABEL[k])}</option>)}
                    </Select>
                    <span className="text-xs text-fg-muted">{facts}</span>
                  </div>
                  <label className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">{tr("Claim it")} <ClaimSelect value={choice.claim} onChange={(r) => set({ ...choice, claim: r })} /></label>
                  {plan.checklist.total ? <Checkbox checked={choice.includeChecklist} onChange={(v) => set({ ...choice, includeChecklist: v })} label={tr("Put the checklist in the description ({done}/{total})", { done: plan.checklist.done, total: plan.checklist.total })} className="text-xs" /> : null}
                </div>
              ) : <p className="text-xs text-amber-600">{tr(plan.target_error ?? "This task has nowhere to go yet.")} <Link href="/integrations" className="text-accent hover:underline">{tr("Integrations")}</Link></p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input value={choice.key} onChange={(e) => set({ ...choice, key: e.target.value })} placeholder={`${plan.target?.pms_project ?? "PROJECT"}-12`} className="pms-key h-8 w-48 font-mono text-xs uppercase" aria-label={tr("Ticket key")} />
                <label className="flex items-center gap-2 text-xs text-fg-muted">{tr("Claim it")} <ClaimSelect value={choice.claim} onChange={(r) => set({ ...choice, claim: r })} /></label>
              </div>
            )}
          </div>
        )}
        {linked?.ticket_status === "CLOSED" ? (
          <p className="flex items-center gap-1.5 px-1.5 text-xs text-fg-muted"><TicketCheck size={13} /> {tr("Closed in Bitara PMS")}</p>
        ) : (
          <div className="space-y-1.5 px-1.5">
            <Checkbox checked={choice.close} onChange={(v) => set({ ...choice, close: v, reason: v && !choice.reason ? plan.close_reason || (choice.lang === "zh-CN" ? "已在 Task Portal 完成。" : "Done in Task Portal.") : choice.reason })} label={tr("Close the ticket in Bitara PMS")} className="pms-close-on" />
            {choice.close ? (
              <div className="space-y-1 pl-6">
                <Input value={choice.reason} onChange={(e) => set({ ...choice, reason: e.target.value })} maxLength={500} placeholder={tr("Why it is closed")} className="pms-close-reason h-8 text-xs" aria-label={tr("Why it is closed")} />
                {plan.target?.mode && plan.target.mode !== "FULL" ? <p className="flex items-start gap-1.5 text-[11px] text-amber-600"><TriangleAlert size={12} className="mt-0.5 shrink-0" />{tr("{project} lets tokens only suggest, so Bitara PMS will refuse this unless its owner sets the project to Full in Bitara PMS.", { project: plan.target.pms_project })}</p> : null}
                <p className="text-[11px] text-fg-faint">{tr("It closes after everything else you picked here has been sent.")}</p>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {plan.outputs.length ? (
        <Section icon={FileText} title={tr("Outputs, as comments")} onAll={fresh(plan.outputs).length ? () => set({ ...choice, outputs: fresh(plan.outputs) }) : null} allLabel={tr("Pick new and changed")}>
          {plan.outputs.map((o) => <Row key={o.id} checked={choice.outputs.includes(o.id)} onChange={toggle("outputs", o.id)} state={o.state}>{o.title || tr("Untitled")} <span className="text-xs text-fg-faint">· {tr("{n} characters", { n: o.chars })}</span></Row>)}
        </Section>
      ) : null}
      {plan.comments.length ? (
        <Section icon={MessageSquare} title={tr("Comments")} onAll={fresh(plan.comments).length ? () => set({ ...choice, comments: fresh(plan.comments) }) : null} allLabel={tr("Pick new and changed")}>
          {plan.comments.map((c) => (
            <Row key={c.id} checked={choice.comments.includes(c.id)} onChange={toggle("comments", c.id)} state={c.state}>
              <span className="text-xs font-medium">{c.author_name}</span> <span className="text-[11px] text-fg-faint">{formatDate(c.created_at)}</span>
              <span className="block truncate text-xs text-fg-muted">{c.snippet}</span>
            </Row>
          ))}
        </Section>
      ) : null}
      {linked?.ticket_key && plan.checklist.total ? (
        <Section icon={ListChecks} title={tr("Checklist")}>
          <Row checked={choice.checklist} onChange={(v) => set({ ...choice, checklist: v })} state={plan.checklist.state}>{tr("Post the checklist as a comment ({done}/{total})", { done: plan.checklist.done, total: plan.checklist.total })}</Row>
        </Section>
      ) : null}
      {plan.files.length ? (
        <Section icon={Paperclip} title={tr("Files")} onAll={fresh(plan.files).length ? () => set({ ...choice, files: fresh(plan.files) }) : null} allLabel={tr("Pick new")}>
          {plan.files.map((f) => <Row key={f.id} checked={choice.files.includes(f.id)} onChange={toggle("files", f.id)} state={f.state}>{f.name} <span className="text-xs text-fg-faint">· {formatBytes(f.size)}</span></Row>)}
        </Section>
      ) : null}
      {plan.time.length ? (
        <Section icon={Clock} title={tr("My time, as worklogs")} onAll={plan.time.some((e) => e.state !== "sent") ? () => set({ ...choice, time: Object.fromEntries(Object.entries(choice.time).map(([id, v]) => [id, { ...v, on: plan.time.find((e) => String(e.id) === id)?.state !== "sent" }])) }) : null} allLabel={tr("Pick new and changed")}>
          {plan.time.map((e) => {
            const v = choice.time[e.id];
            const setV = (patch) => set({ ...choice, time: { ...choice.time, [e.id]: { ...v, ...patch } } });
            return (
              <div key={e.id} className="pms-time flex flex-wrap items-center gap-x-2 gap-y-1 rounded-app-sm px-1.5 py-1 text-sm hover:bg-surface-2">
                <Checkbox checked={v.on} onChange={(on) => setV({ on })} aria-label={tr("Send this time entry")} />
                <span className="w-24 text-xs tabular-nums">{formatDate(v.date)}</span>
                <span className="w-16 text-xs font-medium tabular-nums">{formatMinutes(e.minutes)}</span>
                <label className="flex items-center gap-1 text-xs text-fg-muted">
                  {tr("from")}
                  <Input type="time" value={v.time} onChange={(ev) => setV({ time: ev.target.value, on: true })} className={cn("pms-start h-7 w-[6.5rem] px-2 text-xs", v.on && !v.time && "border-amber-500")} aria-label={tr("Start time")} />
                </label>
                {v.timer ? <span className="text-[11px] text-fg-faint" data-tip={tr("The timer recorded when this started.")}>{tr("timer")}</span> : null}
                <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{e.note}</span>
                <StateBadge state={e.state} />
              </div>
            );
          })}
          <p className="px-1.5 text-[11px] text-fg-faint">{tr("Bitara PMS wants the real start of the work. Entries typed in by hand need one; the timer's are filled in.")}</p>
        </Section>
      ) : null}
      {problem && pickedCount(choice) ? <p className="pms-problem flex items-center gap-1.5 text-xs text-amber-600"><TriangleAlert size={13} /> {problem}</p> : null}
    </Card>
  );
}

/* ---------- the dialog ---------- */

/** Pick tasks, choose what goes from each, see exactly what will be sent, send. `taskIds` starts with those picked. */
export function PmsSendDialog({ taskIds = [], onClose, onDone }) {
  const tr = useT();
  const toast = useToast();
  const [step, setStep] = useState(taskIds.length ? "choose" : "pick");
  const [selected, setSelected] = useState(taskIds);
  const [plans, setPlans] = useState({}); // id → plan | { error }
  const [choices, setChoices] = useState({});
  const [kind, setKind] = useState("DEV");
  const [internal, setInternal] = useState(true);
  const [previews, setPreviews] = useState({}); // id → { data } | { error }
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [q, setQ] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const list = useFetch("/api/pms/tasks", { enabled: step === "pick" });

  const loadPlans = async (ids) => {
    const missing = ids.filter((id) => !plans[id]);
    const got = {};
    await Promise.all(missing.map(async (id) => {
      try {
        got[id] = await api.get(`/api/pms/tasks/${id}`);
      } catch (e) {
        got[id] = { error: e.message };
      }
    }));
    setPlans((p) => ({ ...p, ...got }));
    setChoices((c) => ({ ...c, ...Object.fromEntries(Object.entries(got).filter(([, p]) => !p.error).map(([id, p]) => [id, initialChoice(p)])) }));
  };
  const [started, setStarted] = useState(false);
  if (!started && step === "choose" && selected.length) {
    setStarted(true);
    loadPlans(selected);
  }

  const toChoose = () => {
    setStep("choose");
    setStarted(true);
    loadPlans(selected);
  };
  const ready = selected.filter((id) => plans[id] && !plans[id].error && choices[id]);
  const withPicks = ready.filter((id) => pickedCount(choices[id]) > 0);
  const blocked = withPicks.filter((id) => problemOf(tr, plans[id], choices[id]));
  const anyTime = ready.some((id) => plans[id].time.length);
  const anyComment = ready.some((id) => plans[id].outputs.length || plans[id].comments.length || (plans[id].link && plans[id].checklist.total));

  const preview = async () => {
    setBusy(true);
    setPreviews({});
    const got = {};
    for (const id of withPicks) {
      try {
        got[id] = { data: await api.post(`/api/pms/tasks/${id}/send`, { ...bodyOf(choices[id], { kind, internal }), dry_run: true }) };
      } catch (e) {
        got[id] = { error: e.message };
      }
    }
    setPreviews(got);
    setBusy(false);
    setStep("preview");
  };
  const sendable = withPicks.filter((id) => previews[id]?.data && !previews[id].data.results.some((r) => r.error));
  const send = async () => {
    setBusy(true);
    const got = {};
    let n = 0;
    for (const id of sendable) {
      setProgress({ n: ++n, of: sendable.length });
      try {
        got[id] = { data: await api.post(`/api/pms/tasks/${id}/send`, bodyOf(choices[id], { kind, internal })) };
      } catch (e) {
        got[id] = { error: e.message };
      }
    }
    setResults(got);
    setProgress(null);
    setBusy(false);
    setStep("result");
    const failed = Object.values(got).filter((r) => r.error || r.data.results.some((x) => !x.ok)).length;
    if (failed) toast.error(tr("Some of it was not sent"), tr("See the list for what Bitara PMS said."));
    else toast.success(tr("Sent to Bitara PMS"));
    onDone?.();
  };

  const title = { pick: tr("Send to Bitara PMS: pick tasks"), choose: tr("Send to Bitara PMS: what goes"), preview: tr("Send to Bitara PMS: check before sending"), result: tr("Sent to Bitara PMS") }[step];
  const footer = {
    pick: (
      <>
        <span className="mr-auto text-xs text-fg-muted">{tr("{n} picked", { n: selected.length })}</span>
        <Button variant="ghost" onClick={onClose}>{tr("Cancel")}</Button>
        <Button iconRight={ArrowRight} onClick={toChoose} disabled={!selected.length} className="pms-next">{tr("Continue")}</Button>
      </>
    ),
    choose: (
      <>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("pick")} className="mr-auto">{tr("Tasks")}</Button>
        <Button onClick={preview} loading={busy} disabled={!withPicks.length || blocked.length > 0} className="pms-preview">{tr("Check what will be sent")}</Button>
      </>
    ),
    preview: (
      <>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("choose")} className="mr-auto" disabled={busy}>{tr("Back")}</Button>
        {progress ? <span className="text-xs text-fg-muted">{tr("Sending {n} of {of}…", progress)}</span> : null}
        <Button icon={Send} onClick={send} loading={busy} disabled={!sendable.length} className="pms-send">{tr("Send to Bitara PMS")}</Button>
      </>
    ),
    result: <Button onClick={onClose} className="pms-done">{tr("Close")}</Button>,
  }[step];

  return (
    <Modal open onClose={busy ? undefined : onClose} size="lg" className="pms-dialog" title={title} footer={footer}>
      {step === "pick" ? <PickStep list={list} selected={selected} setSelected={setSelected} q={q} setQ={setQ} projectFilter={projectFilter} setProjectFilter={setProjectFilter} onClose={onClose} /> : null}
      {step === "choose" ? (
        <div className="space-y-3">
          {anyTime || anyComment ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-app border border-line bg-surface-2/50 px-3 py-2 text-xs">
              {anyTime ? (
                <label className="flex items-center gap-2">
                  {tr("Time is logged as")}
                  <Select value={kind} onChange={(e) => setKind(e.target.value)} className="pms-kind h-8 w-40 text-xs">{PMS_WORK_KINDS.map((k) => <option key={k} value={k}>{tr(PMS_KIND_LABEL[k])}</option>)}</Select>
                </label>
              ) : null}
              {anyComment ? <Checkbox checked={internal} onChange={setInternal} label={tr("Comments are internal (hidden from the ticket's reporter)")} className="pms-internal text-xs" /> : null}
            </div>
          ) : null}
          {selected.map((id) => {
            const plan = plans[id];
            if (!plan) return <Card key={id} className="grid place-items-center !p-6"><Spinner /></Card>;
            if (plan.error) return <Card key={id} className="!p-4 text-sm text-rose-500">{tr("Could not load task #{id}", { id })}: {tr(plan.error)}</Card>;
            if (!plan.can_send) return <Card key={id} className="!p-4 text-sm text-fg-muted">{plan.task.title}: {tr("You have view-only access to this shared profile.")}</Card>;
            return <TaskChoice key={id} plan={plan} choice={choices[id]} set={(c) => setChoices((x) => ({ ...x, [id]: c }))} onDrop={selected.length > 1 ? () => setSelected((s) => s.filter((x) => x !== id)) : null} />;
          })}
          {!withPicks.length && ready.length ? <p className="text-center text-xs text-fg-muted">{tr("Pick what to send from each task.")}</p> : null}
        </div>
      ) : null}
      {step === "preview" ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-app border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            {tr("Bitara PMS keeps what you send: a token cannot delete tickets or comments. Check the text before you send.")}
          </p>
          {withPicks.map((id) => <Outcome key={id} plan={plans[id]} answer={previews[id]} dry />)}
        </div>
      ) : null}
      {step === "result" ? <div className="space-y-3">{sendable.map((id) => <Outcome key={id} plan={plans[id]} answer={results[id]} />)}</div> : null}
    </Modal>
  );
}

function PickStep({ list, selected, setSelected, q, setQ, projectFilter, setProjectFilter, onClose }) {
  const tr = useT();
  const data = list.data;
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const projects = useMemo(() => [...new Map(tasks.filter((t) => t.project_id).map((t) => [t.project_id, t.project_name])).entries()], [tasks]);
  if (list.error) return <EmptyState icon={CircleAlert} title="Could not load the tasks" description={list.error.message} compact />;
  if (!data) return <div className="grid place-items-center py-10"><Spinner /></div>;
  if (!data.connected) return <EmptyState icon={Plug} title="Connect Bitara PMS first" description="Add your Bitara PMS token on the Integrations page, and choose where your projects go." action={<Link href="/integrations" onClick={onClose}><Button icon={Plug}>{tr("Open Integrations")}</Button></Link>} compact />;
  if (!data.can_send) return <EmptyState icon={Send} title="You have view-only access to this shared profile." compact />;
  if (!tasks.length) return <EmptyState icon={Ticket} title="No tasks to send yet" description="Only tasks in projects that go to a Bitara PMS project are listed. Choose them on the Integrations page." action={<Link href="/integrations" onClick={onClose}><Button variant="secondary" icon={Plug}>{tr("Open Integrations")}</Button></Link>} compact />;
  const needle = q.trim().toLowerCase();
  const shown = tasks.filter((t) => (!projectFilter || String(t.project_id) === projectFilter) && (!needle || t.title.toLowerCase().includes(needle) || (t.ticket_key ?? "").toLowerCase().includes(needle)));
  const all = shown.length > 0 && shown.every((t) => selected.includes(t.id));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search tasks or ticket keys…")} className="pms-search pl-8" autoFocus />
        </div>
        {projects.length > 1 ? (
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-9 w-48">
            <option value="">{tr("All projects")}</option>
            {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-1 text-xs text-fg-muted">
        <Checkbox checked={all} indeterminate={!all && shown.some((t) => selected.includes(t.id))} onChange={(on) => setSelected((s) => (on ? [...new Set([...s, ...shown.map((t) => t.id)])] : s.filter((id) => !shown.some((t) => t.id === id))))} label={tr("{n} tasks", { n: shown.length })} />
      </div>
      <ul className="pms-pick divide-y divide-line rounded-app border border-line">
        {shown.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
              <Checkbox checked={selected.includes(t.id)} onChange={(on) => setSelected((s) => (on ? [...s, t.id] : s.filter((x) => x !== t.id)))} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                  {t.project_name ? <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: t.project_color }} />{t.project_name}</span> : null}
                  <span>{tr("updated {when}", { when: relativeTime(t.updated_at) })}</span>
                </span>
              </span>
              {t.ticket_key ? <TicketChip link={{ ticket_key: t.ticket_key, ticket_status: t.ticket_status }} /> : <span className="font-mono text-[11px] text-fg-faint">{t.pms_project ? tr("new in {project}", { project: t.pms_project }) : ""}</span>}
              <StatusBadge map={TASK_STATUS} value={t.status} />
            </label>
          </li>
        ))}
      </ul>
      {!shown.length ? <p className="py-4 text-center text-sm text-fg-muted">{tr("Nothing matches.")}</p> : null}
    </div>
  );
}

/** One task in the preview (dry) or after sending: every step with what it carries, and how it went. */
function Outcome({ plan, answer, dry = false }) {
  const tr = useT();
  const locale = useLocale();
  if (!answer) return null;
  const link = answer.data?.link;
  const key = answer.data?.target?.ticket_key;
  return (
    <Card className="pms-outcome space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{plan.task.title}</span>
        {link?.ticket_key ? <TicketChip link={link} /> : key ? <span className="font-mono text-[11px] font-semibold">{key}</span> : answer.data?.target ? <span className="font-mono text-[11px] text-fg-muted">{tr("new in {project}", { project: answer.data.target.pms_project })}</span> : null}
        {link?.ticket_url ? <a href={link.ticket_url} target="_blank" rel="noopener noreferrer" className="text-fg-muted hover:text-accent" aria-label={tr("Open in Bitara PMS")}><ExternalLink size={14} /></a> : null}
      </div>
      {answer.error ? <p className="text-sm text-rose-500">{tr(answer.error)}</p> : (
        <ol className="space-y-1.5">
          {answer.data.results.map((o, i) => {
            const Icon = OP_ICON[o.op] ?? Send;
            const failed = !dry && !o.ok;
            return (
              <li key={i} className={cn("pms-op flex items-start gap-2 text-sm", o.skip && "text-fg-muted")}>
                {dry ? <Icon size={14} className="mt-0.5 shrink-0 text-fg-muted" /> : o.ok ? <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-rose-500" />}
                <div className="min-w-0 flex-1">
                  <p>{opLabel(tr, o)}{!dry && o.key && o.op === "ticket.create" ? <span className="font-mono font-semibold"> → {o.key}</span> : null}</p>
                  {o.op === "ticket.create" ? <p className="text-xs text-fg-muted"><span className="font-medium text-fg">{o.title}</span> · {[o.fields.priority, tr(PMS_CATEGORY_LABEL[o.fields.category] ?? o.fields.category), PMS_LANGS[o.fields.lang], o.fields.dueAt ? tr("due {date}", { date: formatDate(o.fields.dueAt) }) : null, o.fields.estimateMinutes ? tr("estimate {time}", { time: formatMinutes(o.fields.estimateMinutes) }) : null].filter(Boolean).join(" · ")}</p> : null}
                  {o.op === "ticket.link" && o.title ? <p className="text-xs text-fg-muted"><span className="font-medium text-fg">{o.title}</span>{o.status ? ` · ${pmsStatusText(o.status, locale)}` : ""}</p> : null}
                  {o.op === "ticket.update" && o.title ? <p className="text-xs text-fg-muted">{o.title}</p> : null}
                  {o.op === "comment" && o.again ? <p className="text-[11px] text-fg-faint">{tr("Sent before: this goes as a new comment.")}</p> : null}
                  {o.op === "ticket.close" && o.reason && !o.skip ? <p className="text-xs text-fg-muted">{tr("Reason: {reason}", { reason: o.reason })}</p> : null}
                  {(o.op === "worklogs" || (o.op === "worklog.update" && !o.skip)) && o.entries ? (
                    <ul className="mt-0.5 space-y-0.5 text-xs text-fg-muted">
                      {o.entries.map((e, j) => <li key={j} className="tabular-nums">{e.startedAt ? `${formatDate(e.startedAt.slice(0, 10))} ${e.startedAt.slice(11, 16)}` : ""} · {formatMinutes(e.minutes)}{e.note ? ` · ${e.note}` : ""}</li>)}
                    </ul>
                  ) : null}
                  {dry ? <ShowText text={o.text} /> : null}
                  {o.error ? <p className="text-xs text-rose-500">{tr(o.error)}</p> : null}
                  {o.note ? <p className="text-xs text-amber-600">{tr(o.note)}</p> : null}
                  {failed && !o.error ? <p className="text-xs text-rose-500">{tr("Not sent.")}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ---------- entry points ---------- */

/** "Bitara PMS" button: opens the dialog (with `taskIds` picked already, or the task picker). Only for people with a connection. */
export function PmsSendButton({ taskIds = [], onDone, label, size = "md", variant = "outline", className }) {
  const tr = useT();
  const allowed = useFeature("pms");
  const { canEdit } = useAccess();
  const { data } = useFetch("/api/pms/connections?brief=1", { enabled: allowed && canEdit });
  const [open, setOpen] = useState(false);
  if (!allowed || !canEdit || !data?.connected) return null;
  return (
    <>
      <Button size={size} variant={variant} icon={Send} onClick={() => setOpen(true)} className={cn("pms-open", className)}>{label ?? tr("Bitara PMS")}</Button>
      {open ? <PmsSendDialog taskIds={taskIds} onClose={() => setOpen(false)} onDone={onDone} /> : null}
    </>
  );
}

/** The task page's card: the linked ticket and its status, refresh, unlink, send. Hidden for people who do not use Bitara PMS. */
export function PmsTaskCard({ taskId, onChanged }) {
  const tr = useT();
  const toast = useToast();
  const allowed = useFeature("pms");
  const { data, setData, refetch } = useFetch(`/api/pms/tasks/${taskId}?brief=1`, { enabled: allowed });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
  if (!allowed || !data || (!data.connected && !data.link)) return null;
  const link = data.link;
  const refresh = async () => {
    setBusy("refresh");
    try {
      const res = await api.post(`/api/pms/tasks/${taskId}/refresh`, {});
      setData((d) => ({ ...d, link: res.link }));
    } catch (e) {
      toast.error(tr("Could not ask Bitara PMS"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };
  const claimIt = async () => {
    setBusy("claim");
    try {
      const res = await api.post(`/api/pms/tasks/${taskId}/send`, { claim: "owner" });
      const step = res.results.find((r) => r.op === "ticket.claim");
      setData((d) => ({ ...d, link: res.link }));
      if (step?.ok) toast.success(tr("Claimed as {role}", { role: tr(ROLE_WORD.owner) }), step.note ? tr(step.note) : undefined);
      else toast.error(tr("Could not claim it"), step?.error ? tr(step.error) : undefined);
      onChanged?.();
    } catch (e) {
      toast.error(tr("Could not claim it"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };
  const unlink = async () => {
    try {
      await api.del(`/api/pms/tasks/${taskId}/link`);
      setData((d) => ({ ...d, link: null }));
      setUnlinking(false);
      toast.success(tr("Unlinked"));
      onChanged?.();
    } catch (e) {
      toast.error(tr("Could not unlink"), tr(e.message));
    }
  };
  return (
    <Card className="pms-card space-y-2">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><Ticket size={13} /> {tr("Bitara PMS")}</p>
      {link ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <TicketChip link={link} className="min-w-0 flex-1" />
            {link.ticket_url ? <a href={link.ticket_url} target="_blank" rel="noopener noreferrer" className="grid h-7 w-7 place-items-center rounded-app-sm text-fg-muted hover:bg-surface-2 hover:text-accent" aria-label={tr("Open in Bitara PMS")}><ExternalLink size={13} /></a> : null}
            {link.ticket_key && data.connected ? <Button size="iconXs" variant="ghost" icon={RefreshCw} loading={busy === "refresh"} onClick={refresh} aria-label={tr("Check the status again")} data-tip={tr("Check the status again")} className="pms-refresh" /> : null}
            {data.can_send ? <Button size="iconXs" variant="ghost" icon={Unlink} onClick={() => setUnlinking(true)} aria-label={tr("Unlink")} data-tip={tr("Unlink")} className="pms-unlink" /> : null}
          </div>
          {link.ticket_title ? <p className="truncate text-xs">{link.ticket_title}</p> : null}
          <p className="text-[11px] text-fg-faint">{[link.created_here ? tr("Raised from Task Portal") : tr("Linked to an existing ticket"), link.status_at ? tr("status from {when}", { when: relativeTime(link.status_at) }) : null].filter(Boolean).join(" · ")}</p>
          {link.claimed_as ? (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400"><UserCheck size={12} /> {tr("You claimed it as {role}", { role: tr(ROLE_WORD[link.claimed_as] ?? link.claimed_as) })}</p>
          ) : link.ticket_key && data.connected && data.can_send ? (
            <Button size="xs" variant="outline" icon={UserCheck} loading={busy === "claim"} onClick={claimIt} className="pms-claim-card" data-tip={tr("Take the owner slot of this ticket in Bitara PMS")}>{tr("Claim it")}</Button>
          ) : null}
        </div>
      ) : <p className="text-xs text-fg-muted">{tr("Not sent to Bitara PMS yet.")}</p>}
      {data.connected && data.can_send ? <Button size="sm" variant="secondary" icon={Send} onClick={() => setOpen(true)} className="pms-task-send w-full">{tr("Send to Bitara PMS…")}</Button> : null}
      {open ? <PmsSendDialog taskIds={[taskId]} onClose={() => setOpen(false)} onDone={() => { refetch(); onChanged?.(); }} /> : null}
      <ConfirmDialog open={unlinking} onClose={() => setUnlinking(false)} onConfirm={unlink} title={tr("Unlink from {key}?", { key: link?.ticket_key ?? "" })} description={tr("The ticket stays in Bitara PMS. Linking it again later picks up what was already sent.")} confirmText={tr("Unlink")} />
    </Card>
  );
}
