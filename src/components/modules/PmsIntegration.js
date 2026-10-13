"use client";
import { useState } from "react";
import Link from "next/link";
import { Plug, Ticket, Plus, RefreshCw, Trash2, Pencil, Check, X, KeyRound, FolderKanban, ArrowRight, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useFeature } from "@/lib/auth-context";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Input, Select, Field } from "@/components/ui/Controls";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { relativeTime, cn } from "@/lib/utils";
import { useT, useLocale } from "@/lib/i18n";
import { pmsStatusText, PMS_MODE_NOTE } from "@/lib/pms-shared";

/** Integrations page: connections to other tools. Today: Bitara PMS. */
export default function IntegrationsPage() {
  const tr = useT();
  const allowed = useFeature("pms");
  return (
    <>
      <PageHeader title={tr("Integrations")} description={tr("Connect Task Portal to the other tools you work in.")} icon={Plug} color="#0ea5e9" crumbs={[]} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        {allowed ? <BitaraPms /> : <Card><EmptyState icon={Plug} title="Bitara PMS is turned off for your account" description="An administrator decides which modules each person uses. Ask them if you need this one." compact /></Card>}
      </div>
    </>
  );
}

const MODE_TONE = { SUGGEST_ONLY: "amber", OFF: "rose", FULL: "emerald" };

function BitaraPms() {
  const tr = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data, setData, loading, error } = useFetch("/api/pms/connections");
  const [form, setForm] = useState({ label: "", token: "", base_url: "" });
  const [busy, setBusy] = useState(null); // "add" | `check:${id}` | `save:${id}` | `map:${projectId}`
  const [editing, setEditing] = useState(null); // { id, label?, token? }
  const [removing, setRemoving] = useState(null);
  const [adding, setAdding] = useState(false); // the form for another token, once there is one
  const connections = data?.connections ?? [];
  const maps = data?.maps ?? [];

  const add = async () => {
    setBusy("add");
    try {
      const res = await api.post("/api/pms/connections", { token: form.token.trim(), label: form.label.trim() || undefined, base_url: form.base_url.trim() || undefined });
      setData((d) => ({ ...d, connections: res.connections }));
      setForm({ label: "", token: "", base_url: "" });
      setAdding(false);
      const conn = res.connections.find((c) => c.id === res.id);
      toast.success(tr("Connected to Bitara PMS"), conn?.acting_as ? tr("As {who}", { who: conn.acting_as }) : undefined);
    } catch (e) {
      toast.error(tr("Could not connect"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };
  const check = async (c) => {
    setBusy(`check:${c.id}`);
    try {
      const res = await api.post(`/api/pms/connections/${c.id}/check`, {});
      setData((d) => ({ ...d, connections: res.connections }));
      const now = res.connections.find((x) => x.id === c.id);
      if (now?.status === "ok") toast.success(tr("The connection works"));
      else toast.error(tr("Bitara PMS did not accept the connection"), now?.last_error ? tr(now.last_error) : undefined);
    } catch (e) {
      toast.error(tr("Could not check the connection"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    const c = editing;
    setBusy(`save:${c.id}`);
    try {
      const body = c.token != null ? { token: c.token.trim() } : { label: c.label };
      const res = await api.put(`/api/pms/connections/${c.id}`, body);
      setData((d) => ({ ...d, connections: res.connections }));
      setEditing(null);
      toast.success(c.token != null ? tr("Token replaced") : tr("Saved"));
    } catch (e) {
      toast.error(tr("Could not save"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    try {
      const res = await api.del(`/api/pms/connections/${removing.id}`);
      setData((d) => ({ ...d, connections: res.connections, maps: res.maps }));
      toast.success(tr("Connection removed"));
      setRemoving(null);
    } catch (e) {
      toast.error(tr("Could not remove"), tr(e.message));
    }
  };
  const pair = async (projectId, value) => {
    const [connectionId, key] = value ? value.split(":") : [null, ""];
    setBusy(`map:${projectId}`);
    try {
      const res = await api.put("/api/pms/maps", { project_id: projectId, connection_id: connectionId ? Number(connectionId) : null, pms_project: key });
      setData((d) => ({ ...d, maps: res }));
    } catch (e) {
      toast.error(tr("Could not save"), tr(e.message));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Card><EmptyState icon={Plug} title="Could not load your connections" description={error.message} compact /></Card>;
  if (loading && !data) return <Card className="grid place-items-center py-10"><Spinner /></Card>;

  const targets = connections.flatMap((c) => c.projects.map((p) => ({ value: `${c.id}:${p.key}`, label: `${p.key}${p.name ? ` · ${p.name}` : ""}${connections.length > 1 ? ` (${c.label})` : ""}` })));
  return (
    <>
      <Card className="pms-connections">
        <CardHeader icon={Ticket} title={tr("Bitara PMS")} description={tr("Send what you choose from a task to a Bitara PMS ticket: the task itself, outputs, comments, files and your logged time. Nothing is sent on its own, and everything goes out as you, with your own token.")} />
        {connections.length ? (
          <ul className="mb-5 divide-y divide-line rounded-app border border-line">
            {connections.map((c) => {
              const edit = editing?.id === c.id ? editing : null;
              return (
                <li key={c.id} className="pms-connection space-y-2 px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {edit && edit.label != null ? (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Input autoFocus value={edit.label} onChange={(e) => setEditing({ ...edit, label: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }} maxLength={80} className="h-8 max-w-xs" aria-label={tr("Name")} />
                        <Button size="iconSm" variant="ghost" icon={Check} onClick={save} loading={busy === `save:${c.id}`} aria-label={tr("Save")} />
                        <Button size="iconSm" variant="ghost" icon={X} onClick={() => setEditing(null)} aria-label={tr("Cancel")} />
                      </span>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                        <span className="truncate">{c.label}</span>
                        <Button size="iconXs" variant="ghost" icon={Pencil} onClick={() => setEditing({ id: c.id, label: c.label })} aria-label={tr("Rename")} data-tip={tr("Rename")} />
                      </span>
                    )}
                    <Badge tone={c.status === "ok" ? "emerald" : "rose"} dot>{c.status === "ok" ? tr("Connected") : tr("Problem")}</Badge>
                  </div>
                  <p className="text-xs text-fg-muted">
                    {[c.acting_as ? tr("As {who}", { who: c.acting_as }) : null, tr("token {hint}", { hint: c.token_hint }), c.checked_at ? tr("checked {when}", { when: relativeTime(c.checked_at) }) : null, c.base_url ? c.base_url : null].filter(Boolean).join(" · ")}
                  </p>
                  {c.status !== "ok" && c.last_error ? <p className="pms-error rounded-app-sm bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-300">{tr(c.last_error)}</p> : null}
                  {c.projects.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {c.projects.map((p) => (
                        <span key={p.key} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px]" data-tip={p.mode ? tr(PMS_MODE_NOTE[p.mode] ?? pmsStatusText(p.mode, locale)) : undefined}>
                          <span className="font-mono font-medium">{p.key}</span>
                          {p.name ? <span className="text-fg-muted">{p.name}</span> : null}
                          {p.mode ? <Badge tone={MODE_TONE[p.mode] ?? "slate"} className="!px-1.5 !py-0 !text-[10px]">{pmsStatusText(p.mode, locale)}</Badge> : null}
                        </span>
                      ))}
                    </div>
                  ) : c.status === "ok" ? <p className="text-xs text-amber-600">{tr("Bitara PMS did not list any project for this token.")}</p> : null}
                  {edit && edit.token != null ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input type="password" autoFocus autoComplete="off" value={edit.token} onChange={(e) => setEditing({ ...edit, token: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && edit.token.trim()) save(); if (e.key === "Escape") setEditing(null); }} placeholder="pms_pat_…" className="pms-new-token h-8 min-w-0 flex-1 font-mono" aria-label={tr("New token")} />
                      <Button size="sm" icon={Check} onClick={save} loading={busy === `save:${c.id}`} disabled={!edit.token.trim()}>{tr("Replace")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="xs" variant="secondary" icon={RefreshCw} onClick={() => check(c)} loading={busy === `check:${c.id}`} className="pms-check">{tr("Check again")}</Button>
                      <Button size="xs" variant="secondary" icon={KeyRound} onClick={() => setEditing({ id: c.id, token: "" })}>{tr("Replace token")}</Button>
                      <Button size="xs" variant="dangerGhost" icon={Trash2} onClick={() => setRemoving(c)} className="pms-remove">{tr("Remove")}</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {connections.length && !adding ? (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)} className="pms-add-more">{tr("Add another token")}</Button>
        ) : (
        <div className="pms-add space-y-3 rounded-app border border-line bg-surface-2/50 p-3">
          <p className="text-sm font-medium">{connections.length ? tr("Add another token") : tr("Connect with your token")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={tr("Name (optional), like “Bitwinex v2”")} maxLength={80} className="pms-label" aria-label={tr("Name")} />
            <Input type="password" autoComplete="off" spellCheck={false} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} onKeyDown={(e) => e.key === "Enter" && form.token.trim() && add()} placeholder="pms_pat_…" className="pms-token font-mono" aria-label={tr("API token")} />
            <Button icon={Plus} onClick={add} loading={busy === "add"} disabled={!form.token.trim()} className="pms-connect">{tr("Connect")}</Button>
          </div>
          {data?.custom_base ? (
            <Field label={tr("Bitara PMS address (test servers only; empty = {base})", { base: data.base })}>
              <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder={data.base} className="pms-base h-8 font-mono text-xs" />
            </Field>
          ) : null}
          <p className="text-xs text-fg-muted">{tr("In Bitara PMS, open API tokens and create one for Task Portal. It needs projects:read, tickets:read, tickets:write, comments:write and worklogs:write, and can be limited to one project. Task Portal checks it with Bitara PMS, keeps it encrypted and never shows it again.")}</p>
        </div>
        )}
      </Card>

      {connections.length ? (
        <Card className="pms-maps">
          <CardHeader icon={FolderKanban} title={tr("Where your projects go")} description={tr("For each project in this workspace, the Bitara PMS project its tasks are sent to. This is your own setting; other people choose their own.")} />
          {maps.length ? (
            <ul className="divide-y divide-line rounded-app border border-line">
              {maps.map((m) => {
                const value = m.pms_project ? `${m.connection_id}:${m.pms_project}` : "";
                const known = !value || targets.some((t) => t.value === value);
                return (
                  <li key={m.project_id} className="pms-map flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                      <Link href={`/projects/${m.project_id}`} className="truncate font-medium hover:text-accent">{m.name}</Link>
                      {m.code ? <span className="font-mono text-[11px] text-fg-faint">{m.code}</span> : null}
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-fg-faint max-sm:hidden" />
                    <span className="flex w-full items-center gap-2 sm:w-72">
                      <Select value={value} onChange={(e) => pair(m.project_id, e.target.value)} disabled={busy === `map:${m.project_id}`} className={cn("h-8 text-xs", value && "font-medium")} aria-label={tr("Bitara PMS project for {name}", { name: m.name })}>
                        <option value="">{tr("Not sent to Bitara PMS")}</option>
                        {!known ? <option value={value}>{m.pms_project} ({tr("no longer reached")})</option> : null}
                        {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </Select>
                      {busy === `map:${m.project_id}` ? <Spinner size={14} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-fg-muted">{tr("This workspace has no projects yet.")}</p>}
          <p className="mt-3 flex items-start gap-2 text-xs text-fg-muted">
            <Send size={13} className="mt-0.5 shrink-0" />
            <span>{tr("Then open Tasks and press Bitara PMS to pick the tasks to send, or use the button on a task.")} <Link href="/tasks" className="text-accent hover:underline">{tr("Open Tasks")}</Link></span>
          </p>
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={tr("Remove this connection?")}
        description={tr("Task Portal forgets the token and which projects used it. The token stays valid in Bitara PMS until you revoke it there; tickets and time already sent stay in Bitara PMS.")}
        confirmText={tr("Remove")}
      />
    </>
  );
}
