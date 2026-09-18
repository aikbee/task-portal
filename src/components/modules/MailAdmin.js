"use client";
import { useState } from "react";
import { Mail, Send, Save, Server, ToggleRight, ScrollText, CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Input, Select, Field, Toggle } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, EmptyState } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { MODULE_MAP } from "@/lib/modules";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const SECURITY = [
  { value: "starttls", label: "STARTTLS (usually port 587)" },
  { value: "tls", label: "SSL / TLS (usually port 465)" },
  { value: "none", label: "None (only inside a trusted network)" },
];
const KINDS = { test: "Test", reset: "Password reset", security: "Security", invite: "Invitation", join: "Invitation to join", notification: "Notification", digest: "Daily summary", other: "Other" };

/** Admin: the outgoing mail account, what the portal may send, a test button and the last messages. */
export default function MailAdmin() {
  const tr = useT();
  const toast = useToast();
  const { user } = useAuth();
  const mod = MODULE_MAP.mail;
  const { data, setData, loading, error } = useFetch("/api/mail");
  const [draft, setDraft] = useState(null);
  const [seen, setSeen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  // the form starts from what the server has; derived during render so a save refreshes it too
  if (data?.settings && data.settings !== seen) {
    setSeen(data.settings);
    setDraft({ ...data.settings, password: "" });
  }

  const header = <PageHeader title={tr("Email")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} />;
  if (error && !data) return <>{header}<p className="text-sm text-rose-500">{error.message}</p></>;
  if ((loading && !data) || !draft) return <>{header}<Skeleton className="h-96 w-full" /></>;

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e?.target ? e.target.value : e }));
  const saved = data.settings;
  const live = saved.enabled && saved.configured;
  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      setData(await api.put("/api/mail", draft));
      toast.success(tr("Email settings saved"));
    } catch (err) {
      toast.error(tr("Could not save"), err.message);
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const to = testTo.trim() || user.email;
      await api.post("/api/mail/test", { ...draft, to });
      toast.success(tr("Test message sent"), tr("Look for it in the inbox of {to}.", { to }));
    } catch (err) {
      toast.error(tr("The mail server did not accept it"), err.message);
    } finally {
      setTesting(false);
      api.get("/api/mail").then((d) => setData((cur) => ({ ...cur, log: d.log }))).catch(() => {});
    }
  };

  return (
    <>
      {header}
      <div className="mail-state mb-4 flex items-start gap-3 rounded-app border border-line bg-surface-2/60 p-4 text-sm">
        {live ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <CircleSlash size={18} className="mt-0.5 shrink-0 text-fg-muted" />}
        <p className="text-fg-muted">
          <span className="font-medium text-fg">{live ? tr("Email is on.") : tr("Email is off.")}</span>{" "}
          {live ? tr("The portal sends through {host} as {from}.", { host: saved.host, from: saved.from_email }) : tr("Nothing is sent and the sign-in page shows no “Forgot password?” link. Enter a mail account below, send yourself a test, then turn it on.")}
        </p>
      </div>

      <form onSubmit={save} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={tr("Mail account")} description={tr("Any SMTP account works: your hosting mailbox, Google Workspace, Brevo, Mailgun, Amazon SES…")} icon={Server} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr("Mail server")} className="sm:col-span-2"><Input value={draft.host} onChange={set("host")} placeholder="smtp.example.com" className="mail-host" /></Field>
            <Field label={tr("Port")}><Input type="number" min={1} max={65535} value={draft.port} onChange={set("port")} className="mail-port" /></Field>
            <Field label={tr("Encryption")}>
              <Select value={draft.secure} onChange={set("secure")} className="mail-secure">{SECURITY.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}</Select>
            </Field>
            <Field label={tr("User name")}><Input value={draft.username} onChange={set("username")} autoComplete="off" className="mail-username" /></Field>
            <Field label={tr("Password")} hint={saved.password_set ? tr("A password is stored. Leave this empty to keep it.") : tr("Stored encrypted. It is never shown again.")}>
              <Input type="password" value={draft.password} onChange={set("password")} autoComplete="new-password" placeholder={saved.password_set ? "••••••••" : ""} className="mail-password" />
            </Field>
            <Field label={tr("Sender name")}><Input value={draft.from_name} onChange={set("from_name")} className="mail-from-name" /></Field>
            <Field label={tr("Sender address")}><Input type="email" value={draft.from_email} onChange={set("from_email")} placeholder="portal@example.com" className="mail-from-email" /></Field>
            <Field label={tr("Address of this portal")} hint={tr("Used for the links inside messages. Empty = the address people use to open the portal.")} className="sm:col-span-2">
              <Input value={draft.app_url} onChange={set("app_url")} placeholder="https://task.example.com" className="mail-app-url" />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={tr("What may be sent")} icon={ToggleRight} />
            <div className="space-y-4">
              <Toggle checked={draft.enabled} onChange={set("enabled")} label={tr("Send email")} description={tr("The main switch.")} className="mail-enabled" />
              <Toggle checked={draft.allow_reset} onChange={set("allow_reset")} label={tr("Password reset links")} description={tr("“Forgot password?” on the sign-in page.")} />
              <Toggle checked={draft.allow_notifications} onChange={set("allow_notifications")} label={tr("Notification emails")} description={tr("Assignments, mentions, due dates, security. Each person can turn theirs off.")} />
              <Toggle checked={draft.allow_invites} onChange={set("allow_invites")} label={tr("Invitations to people without an account")} description={tr("Whoever shares a workspace with a new address lets that person create an account. Off = only administrators create accounts.")} />
            </div>
          </Card>
          <Card>
            <CardHeader title={tr("Try it")} description={tr("Uses what is in the form now, saved or not.")} icon={Send} />
            <div className="flex gap-2">
              <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={user.email} className="mail-test-to" />
              <Button type="button" variant="secondary" icon={Send} onClick={test} loading={testing} className="mail-test shrink-0">{tr("Send test")}</Button>
            </div>
          </Card>
          <Button type="submit" icon={Save} loading={saving} className="mail-save w-full">{tr("Save")}</Button>
        </div>
      </form>

      <Card className="mt-4" padding={false}>
        <div className="p-5 pb-0"><CardHeader title={tr("Last messages")} description={tr("Who, what and whether the mail server took it. The text of a message is never kept. Entries go after 60 days.")} icon={ScrollText} /></div>
        {data.log?.length ? (
          <ul className="mail-log divide-y divide-line">
            {data.log.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                {m.status === "sent" ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500" /> : <AlertTriangle size={15} className="shrink-0 text-rose-500" />}
                <span className="min-w-0 flex-1 truncate"><span className="font-medium">{m.subject}</span> <span className="text-fg-muted">→ {m.to_email}</span></span>
                <Badge tone={m.status === "sent" ? "slate" : "rose"}>{tr(KINDS[m.kind] ?? m.kind)}</Badge>
                <span className="text-xs text-fg-muted">{formatDateTime(m.created_at)}</span>
                {m.error ? <p className="w-full pl-7 text-xs text-rose-500">{m.error}</p> : null}
              </li>
            ))}
          </ul>
        ) : <div className="p-5"><EmptyState icon={Mail} title={tr("Nothing sent yet")} /></div>}
      </Card>
    </>
  );
}
