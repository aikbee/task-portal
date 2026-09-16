"use client";
import { useMemo, useState } from "react";
import { Flag, MessageSquare, Users, HardDrive, Trash2, Download, Timer, Check, X, Save, RefreshCw, Link2, EllipsisVertical, FileText, FileJson, FileArchive } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import StatCard from "@/components/ui/StatCard";
import Avatar from "@/components/ui/Avatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select, Toggle, Input, Field } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { DropdownMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import DataTable from "@/components/table/DataTable";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import { cn, formatBytes, formatDateTime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { RETENTION_OPTIONS, retentionLabel } from "@/lib/chat-ui";


/** Admin: reported messages, every conversation's footprint, and the instance-wide history cap. */
export default function ModerationPage() {
  const tr = useT();
  const mod = MODULE_MAP.moderation;
  const [tab, setTab] = useState("reports");
  const overview = useFetch("/api/chat/admin/overview");
  const [showResolved, setShowResolved] = useState(false);
  const reports = useFetch(`/api/chat/admin/reports?status=${showResolved ? "all" : "open"}`);
  const reload = () => {
    overview.refetch();
    reports.refetch();
  };
  const totals = overview.data?.totals;
  return (
    <>
      <PageHeader title={tr("Moderation")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>{tr("Refresh")}</Button>} />
      {totals ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={tr("Open reports")} value={totals.open_reports} icon={Flag} color="#ef4444" hint={tr("waiting for a decision")} />
          <StatCard label={tr("Conversations")} value={totals.conversations} icon={Users} color="#0ea5e9" hint={tr("{g} groups · {d} direct", { g: totals.groups, d: totals.direct })} />
          <StatCard label={tr("Messages")} value={totals.messages} icon={MessageSquare} color="#8b5cf6" hint={tr("messages, system lines and deleted ones excluded")} />
          <StatCard label={tr("Files")} value={formatBytes(totals.attachment_bytes)} icon={HardDrive} color="#f59e0b" hint={tr("photos, voice notes and files")} />
        </div>
      ) : null}
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "reports", label: "Reports", icon: Flag, count: totals?.open_reports ?? undefined },
          { key: "conversations", label: "Conversations", icon: Users, count: totals?.conversations ?? undefined },
          { key: "settings", label: "Settings", icon: Timer },
        ]}
      />
      {tab === "reports" ? <Reports tr={tr} state={reports} showResolved={showResolved} setShowResolved={setShowResolved} onChanged={reload} /> : null}
      {tab === "conversations" ? <Conversations tr={tr} state={overview} onChanged={reload} /> : null}
      {tab === "settings" ? <RetentionSettings tr={tr} state={overview} onChanged={reload} /> : null}
    </>
  );
}

function Reports({ tr, state, showResolved, setShowResolved, onChanged }) {
  const toast = useToast();
  const setCounts = useUI((s) => s.setCounts);
  const [confirm, setConfirm] = useState(null); // report to delete the message of
  const [busy, setBusy] = useState(null);
  const act = async (report, action) => {
    setBusy(report.id);
    try {
      await api.put(`/api/chat/admin/reports/${report.id}`, { action });
      toast.success(action === "dismiss" ? tr("Report dismissed") : tr("Message removed"));
      const counts = useUI.getState().counts ?? {};
      setCounts({ ...counts, moderation: Math.max(0, (counts.moderation || 0) - 1) || null });
      onChanged();
    } catch (e) {
      toast.error(tr("Something went wrong"), e.message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };
  if (state.error) return <p className="text-sm text-rose-500">{state.error.message}</p>;
  const list = state.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{tr("People report a message from its ⋯ menu. The text below is a copy taken when they reported it, so it stays readable even after the message is deleted.")}</p>
        <Toggle size="sm" checked={showResolved} onChange={setShowResolved} label={tr("Show resolved")} />
      </div>
      {!list ? (
        <Skeleton className="h-40 w-full" />
      ) : !list.length ? (
        <Card><EmptyState icon={Flag} title={showResolved ? tr("No reports yet") : tr("Nothing to review")} description={showResolved ? tr("Reports from chat members will show up here.") : tr("Every report has been handled.")} compact /></Card>
      ) : (
        list.map((r) => {
          const open = r.status === "open";
          const gone = r.message_gone || r.message_deleted;
          return (
            <Card key={r.id} className={cn("mod-report", !open && "opacity-75")} padding={false}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    <Badge tone={open ? "rose" : r.status === "actioned" ? "amber" : "slate"} size="xs">{open ? tr("Awaiting review") : r.status === "actioned" ? tr("Message removed") : tr("Dismissed")}</Badge>
                    <span>{r.conversation_kind === "group" ? tr("Group “{title}”", { title: r.conversation_title ?? r.snapshot?.conversation }) : tr("Direct chat: {names}", { names: r.snapshot?.conversation ?? "" })}</span>
                    <span>·</span>
                    <span title={formatDateTime(r.created_at)}>{tr("reported {when} by {name}", { when: relativeTime(r.created_at), name: r.snapshot?.reporter_name ?? `#${r.reporter_id}` })}</span>
                  </div>
                  <blockquote className="mod-quote rounded-app-sm border-l-2 border-rose-400 bg-surface-2 px-3 py-2 text-sm">
                    <span className="mb-0.5 block text-[11px] font-semibold text-fg-muted">{r.snapshot?.sender_name ?? `#${r.sender_id}`}{gone ? ` · ${tr("message no longer exists")}` : ""}</span>
                    <span className="whitespace-pre-wrap break-words">{r.snapshot?.body || <em className="text-fg-muted">{tr("(no text)")}</em>}</span>
                    {r.snapshot?.attachments?.length ? <span className="mt-1 block text-[11px] text-fg-muted">{tr("Attachments: {list}", { list: r.snapshot.attachments.join(", ") })}</span> : null}
                  </blockquote>
                  <p className="text-sm"><span className="font-medium">{tr("Reason")}:</span> {r.reason}</p>
                  {!open ? <p className="text-[11px] text-fg-muted">{tr("Resolved {when} by {name}", { when: relativeTime(r.resolved_at), name: r.resolved_by_name ?? "—" })}</p> : null}
                </div>
                {open ? (
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm(r)} disabled={gone} loading={busy === r.id}>{tr("Delete message")}</Button>
                    <Button size="sm" variant="secondary" icon={Check} onClick={() => act(r, "dismiss")} loading={busy === r.id}>{tr("Dismiss report")}</Button>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => act(confirm, "delete_message")}
        loading={busy != null}
        title={tr("Remove this message for everyone?")}
        confirmText={tr("Delete message")}
        description={tr("The text and any files are removed and a “message deleted” placeholder stays. {name} is told an administrator removed it.", { name: confirm?.snapshot?.sender_name ?? "" })}
      />
    </div>
  );
}

function Conversations({ tr, state, onChanged }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retentionFor, setRetentionFor] = useState(null); // { row, days }
  const rows = state.data?.conversations ?? [];
  const cap = state.data?.settings?.max_retention_days ?? null;
  const remove = async () => {
    const row = confirm;
    setBusy(true);
    try {
      await api.del(`/api/chat/admin/conversations/${row.id}`);
      toast.success(tr("Conversation deleted"));
      onChanged();
    } catch (e) {
      toast.error(tr("Something went wrong"), e.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const saveRetention = async () => {
    const { row, days } = retentionFor;
    setBusy(true);
    try {
      await api.put(`/api/chat/admin/conversations/${row.id}/retention`, { days: days ? Number(days) : null });
      toast.success(tr("Retention updated"));
      onChanged();
    } catch (e) {
      toast.error(tr("Something went wrong"), e.message);
    } finally {
      setBusy(false);
      setRetentionFor(null);
    }
  };
  const exportAs = (row, format) => {
    const a = document.createElement("a");
    a.href = `/api/chat/admin/conversations/${row.id}/export?format=${format}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const columns = useMemo(
    () => [
      {
        key: "name",
        label: tr("Conversation"),
        render: (r) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={r.name} color={r.avatar_color} avatar={r.kind === "group" ? r.avatar ?? null : "initials"} fallback={r.kind === "group" ? "group" : "initials"} size="sm" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{r.name || tr("Untitled")}</span>{r.open_reports ? <Badge tone="rose" size="xs">{r.open_reports}</Badge> : null}{r.has_invite ? <Link2 size={12} className="shrink-0 text-fg-faint" aria-label={tr("Invite link on")} /> : null}</span>
              <span className="block truncate text-[11px] text-fg-muted">{r.kind === "group" ? r.members : tr("Direct chat")}</span>
            </span>
          </span>
        ),
        sortValue: (r) => r.name ?? "",
      },
      { key: "kind", label: tr("Kind"), render: (r) => <Badge tone={r.kind === "group" ? "violet" : "sky"} size="xs">{r.kind === "group" ? tr("Group") : tr("Direct")}</Badge>, width: 90 },
      { key: "member_count", label: tr("Members"), align: "right", width: 90 },
      { key: "message_count", label: tr("Messages"), align: "right", width: 100 },
      { key: "attachment_bytes", label: tr("Files"), align: "right", render: (r) => (r.attachment_bytes ? formatBytes(r.attachment_bytes) : "—"), width: 100 },
      { key: "retention_days", label: tr("Retention"), render: (r) => <span className={cn(r.retention_days || cap ? "text-amber-600" : "text-fg-muted")}>{r.retention_days ? retentionLabel(r.retention_days, tr) : cap ? tr("cap: {v}", { v: retentionLabel(cap, tr) }) : tr("Keep forever")}</span>, width: 120 },
      { key: "last_at", label: tr("Last activity"), render: (r) => (r.last_at ? <span title={formatDateTime(r.last_at)}>{relativeTime(r.last_at)}</span> : "—"), sortValue: (r) => r.last_at ?? "", width: 130 },
      { key: "created_at", label: tr("Created"), render: (r) => formatDateTime(r.created_at), defaultHidden: true },
    ],
    [tr, cap]
  );
  return (
    <>
      <p className="mb-3 text-xs text-fg-muted">{tr("Sizes and members only — the contents of a chat are never shown here. Export a conversation to review it in full, set its own retention, or delete it for everyone.")}</p>
      <DataTable
        id="moderation-conversations"
        columns={columns}
        rows={rows}
        loading={!state.data && !state.error}
        error={state.error}
        defaultSort={{ key: "last_at", dir: "desc" }}
        searchPlaceholder={tr("Search conversations…")}
        rowActions={(r) => (
          <DropdownMenu
            trigger={({ toggle }) => <Button variant="ghost" size="iconSm" icon={EllipsisVertical} aria-label={tr("Actions")} onClick={toggle} />}
            items={[
              { label: tr("Export transcript (.txt)"), icon: FileText, onClick: () => exportAs(r, "txt") },
              { label: tr("Export data (.json)"), icon: FileJson, onClick: () => exportAs(r, "json") },
              { label: tr("Export with files (.zip)"), icon: FileArchive, onClick: () => exportAs(r, "zip") },
              { divider: true },
              { label: tr("Set retention…"), icon: Timer, onClick: () => setRetentionFor({ row: r, days: r.retention_days ? String(r.retention_days) : "" }) },
              { label: tr("Delete conversation"), icon: Trash2, danger: true, onClick: () => setConfirm(r) },
            ]}
          />
        )}
        emptyTitle={tr("No conversations yet")}
        emptyDescription={tr("Chats appear here as soon as people start talking.")}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        loading={busy}
        title={tr("Delete “{name}” for everyone?", { name: confirm?.name ?? "" })}
        confirmText={tr("Delete conversation")}
        description={tr("All {n} messages and their files are removed for every member. This cannot be undone.", { n: confirm?.message_count ?? 0 })}
      />
      <ConfirmDialog
        open={!!retentionFor}
        onClose={() => setRetentionFor(null)}
        onConfirm={saveRetention}
        loading={busy}
        danger={false}
        title={tr("Retention for “{name}”", { name: retentionFor?.row?.name ?? "" })}
        confirmText={tr("Save")}
        description={
          retentionFor ? (
            <span className="block space-y-2">
              <span className="block">{tr("Messages older than this are deleted for every member, files included. Members see a system line saying an administrator changed it.")}</span>
              <Select value={retentionFor.days} onChange={(e) => setRetentionFor((s) => ({ ...s, days: e.target.value }))} className="h-9 w-full">
                {RETENTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{tr(o.label)}</option>)}
              </Select>
              {cap ? <span className="block text-[11px]">{tr("The instance cap of {v} applies on top.", { v: retentionLabel(cap, tr) })}</span> : null}
            </span>
          ) : null
        }
      />
    </>
  );
}

function RetentionSettings({ tr, state, onChanged }) {
  const toast = useToast();
  const current = state.data?.settings?.max_retention_days ?? null;
  const [value, setValue] = useState(null); // null = untouched
  const [saving, setSaving] = useState(false);
  const shown = value ?? (current ? String(current) : "");
  const dirty = shown !== (current ? String(current) : "");
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/api/chat/admin/settings", { max_retention_days: shown ? Number(shown) : null });
      toast.success(r.purged ? tr("Saved — {n} old messages purged", { n: r.purged }) : tr("Retention cap saved"));
      setValue(null);
      onChanged();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setSaving(false);
    }
  };
  if (!state.data) return <Skeleton className="h-40 w-full" />;
  return (
    <>
    <Card className="max-w-2xl space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{tr("Maximum chat history")}</h3>
        <p className="mt-1 text-xs text-fg-muted">{tr("A cap for the whole instance. Messages older than this are purged from every conversation, whatever its own disappearing-messages setting. Purges run when people open Chat (at most every 10 minutes) and with the nightly cron.")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={shown} onChange={(e) => setValue(e.target.value)} className="h-9 w-48">
          {RETENTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{tr(o.value === "" ? "No cap" : o.label)}</option>)}
        </Select>
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save changes")}</Button>
        {dirty ? <Button variant="ghost" icon={X} onClick={() => setValue(null)}>{tr("Cancel")}</Button> : null}
      </div>
      <p className="text-[11px] text-fg-muted">{tr("Members can pick a shorter window per chat (owner or admin in groups, either person in a direct chat); they cannot keep messages longer than the cap.")}</p>
    </Card>
    <GifSettings tr={tr} state={state} onChanged={onChanged} />
    <CallSettings tr={tr} state={state} onChanged={onChanged} />
    </>
  );
}

/** Calls: an optional TURN server for voice / video calls between people behind strict NATs. */
function CallSettings({ tr, state, onChanged }) {
  const toast = useToast();
  const s = state.data?.settings ?? {};
  const [form, setForm] = useState(null); // { url, username, credential } or null = untouched
  const [saving, setSaving] = useState(false);
  const shown = form ?? { url: s.turn_url || "", username: s.turn_username || "", credential: "" };
  const dirty = Boolean(form) && (shown.url !== (s.turn_url || "") || shown.username !== (s.turn_username || "") || shown.credential !== "");
  const save = async () => {
    setSaving(true);
    try {
      const body = { turn_url: shown.url, turn_username: shown.username };
      if (shown.credential || !shown.url) body.turn_credential = shown.url ? shown.credential : "";
      await api.put("/api/chat/admin/settings", body);
      toast.success(shown.url ? tr("TURN server saved") : tr("TURN server removed"));
      setForm(null);
      onChanged();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setSaving(false);
    }
  };
  const set = (k) => (e) => setForm({ ...shown, [k]: e.target.value });
  return (
    <Card className="mt-4 max-w-2xl space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{tr("Voice and video calls")}</h3>
        <p className="mt-1 text-xs text-fg-muted">{tr("Calls connect browser to browser through public STUN servers, which works on most networks. Add a TURN server (for example coturn, or a hosted one) so calls also connect from behind strict company or mobile NATs; its address and credentials are handed to signed-in users when a call starts.")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tr("TURN URL")} className="sm:col-span-3"><Input value={shown.url} onChange={set("url")} placeholder="turn:turn.example.com:3478?transport=udp" /></Field>
        <Field label={tr("Username")}><Input value={shown.username} onChange={set("username")} disabled={!shown.url} autoComplete="off" /></Field>
        <Field label={tr("Credential")} hint={s.turn_credential_set && !shown.credential ? tr("A credential is saved. Paste a new one to replace it.") : undefined} className="sm:col-span-2"><Input type="password" value={shown.credential} onChange={set("credential")} disabled={!shown.url} autoComplete="off" placeholder={s.turn_credential_set ? "••••••••••••" : ""} /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save changes")}</Button>
        <span className="text-[11px] text-fg-muted">{s.turn_url ? tr("TURN server on: {url}", { url: s.turn_url }) : tr("STUN only — most home and office networks work; some strict NATs will not connect.")}</span>
      </div>
    </Card>
  );
}

/** GIF search: a GIPHY or Tenor key kept on the server; the chat's sticker panel gets a GIF tab once it is set. */
function GifSettings({ tr, state, onChanged }) {
  const toast = useToast();
  const s = state.data?.settings ?? {};
  const [provider, setProvider] = useState(null); // null = untouched
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const shownProvider = provider ?? (s.gif_provider || "");
  const dirty = shownProvider !== (s.gif_provider || "") || key.trim() !== "";
  const save = async () => {
    setSaving(true);
    try {
      const body = { gif_provider: shownProvider || null };
      if (key.trim() || !shownProvider) body.gif_api_key = shownProvider ? key.trim() : "";
      const r = await api.put("/api/chat/admin/settings", body);
      toast.success(r.gif_search ? tr("GIF search is on") : tr("GIF search is off"));
      setProvider(null);
      setKey("");
      onChanged();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="mt-4 max-w-2xl space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{tr("GIF search")}</h3>
        <p className="mt-1 text-xs text-fg-muted">{tr("Lets people search GIFs from the sticker panel. Paste a GIPHY or Tenor API key; it stays on the server, searches go through this portal, and a chosen GIF is downloaded and stored like a photo so recipients never contact the provider.")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label={tr("Provider")}>
          <Select value={shownProvider} onChange={(e) => setProvider(e.target.value)} className="h-9 w-full">
            <option value="">{tr("Off")}</option>
            <option value="giphy">GIPHY</option>
            <option value="tenor">Tenor</option>
          </Select>
        </Field>
        <Field label={tr("API key")} hint={s.gif_key_set && !key ? tr("A key is saved. Paste a new one to replace it.") : undefined}>
          <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.gif_key_set ? "••••••••••••" : tr("Paste the key")} disabled={!shownProvider} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save changes")}</Button>
        {s.gif_search ? <span className="text-[11px] text-emerald-600">{tr("GIF search is on ({p})", { p: s.gif_provider === "giphy" ? "GIPHY" : "Tenor" })}</span> : <span className="text-[11px] text-fg-muted">{tr("Currently off — the GIF tab tells people to ask an administrator.")}</span>}
      </div>
    </Card>
  );
}
