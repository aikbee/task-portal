"use client";
import { useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check, Terminal, BookOpen, Pencil, Activity, Globe, RefreshCw, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Input, Select, Segmented, Checkbox } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Misc";
import { formatDate, formatDateTime, relativeTime, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { featureAllowed } from "@/lib/access-control";
import { API_SCOPES, SCOPE_KEYS, READ_SCOPES } from "@/lib/api-scopes";

const NEW_FORM = { name: "", access: "read", scopes: READ_SCOPES, profileId: "", days: "", ip: "" };

/**
 * Integrations → Task Portal API: personal tokens for other systems and scripts. A token works inside one profile, as
 * the person who made it, with the permissions picked here, and only from the addresses listed (if any). The token is
 * shown once, right after it is made; afterwards its owner sees what it asked for (the request log).
 */
export default function ApiTokens() {
  const tr = useT();
  const toast = useToast();
  const { user } = useAuth();
  const allowed = featureAllowed(user, "api_tokens");
  const tokens = useFetch("/api/tokens", { enabled: allowed });
  const [form, setForm] = useState(NEW_FORM);
  const [showIp, setShowIp] = useState(false);
  const [fresh, setFresh] = useState(null); // { token, row } just created
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null); // { id, what: "log" | "edit" }
  const [revoking, setRevoking] = useState(null);
  const profiles = [...(user?.profiles ?? []).map((p) => ({ id: p.id, name: p.name })), ...(user?.shared_profiles ?? []).map((p) => ({ id: p.id, name: `${p.name} · ${p.owner?.name ?? ""}` }))];
  const profileName = (id) => (id ? profiles.find((p) => p.id === id)?.name ?? `#${id}` : tr("Default profile"));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const custom = form.access === "custom";
      const res = await api.post("/api/tokens", {
        name: form.name.trim(),
        ...(custom ? { scopes: form.scopes } : { scope: form.access }),
        profile_id: form.profileId || null,
        days: form.days || null,
        ip_allow: form.ip.trim() || null,
      });
      tokens.setData(res.tokens);
      setFresh(res);
      setForm(NEW_FORM);
      setShowIp(false);
      setCopied(false);
    } catch (e) {
      toast.error(tr("Could not create the token"), tr(e.message));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    const t = revoking;
    setBusy(true);
    try {
      tokens.setData((await api.del(`/api/tokens/${t.id}`)).tokens);
      if (fresh?.row.id === t.id) setFresh(null);
      if (panel?.id === t.id) setPanel(null);
      setRevoking(null);
      toast.success(tr("Token revoked"));
    } catch (e) {
      toast.error(tr("Could not revoke"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh.token); setCopied(true); } catch { toast.error(tr("Could not copy")); }
  };
  const toggle = (id, what) => setPanel((p) => (p?.id === id && p.what === what ? null : { id, what }));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const list = tokens.data ?? [];

  if (!allowed) return null;
  return (
    <section className="ui-card card api-tokens p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{tr("API tokens")}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {tr("Let other systems create, assign and update tasks here and check their status. A token works inside one profile, as you; what it changes shows in the task's history as “via” its name. No token can change your account or administration settings.")}{" "}
            {list[0]?.limits ? tr("Each token may make {m} requests a minute and {d} a day; over that the API answers 429 with a Retry-After header.", { m: list[0].limits.perMinute, d: list[0].limits.perDay }) : null}
          </p>
        </div>
        <a href="/developers" target="_blank" rel="noreferrer" className="api-guide inline-flex h-8 shrink-0 items-center gap-1.5 rounded-app-sm border border-line bg-surface-2 px-3 text-xs font-medium hover:bg-surface-3">
          <BookOpen size={14} /> {tr("API guide")}
        </a>
      </div>

      {fresh ? (
        <div className="token-fresh mt-4 rounded-app border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <p className="font-medium">{tr("Copy the token now: it is not shown again.")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="token-value break-all rounded-app-sm bg-surface px-2 py-1 font-mono text-xs">{fresh.token}</code>
            <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy} className="token-copy">{copied ? tr("Copied") : tr("Copy")}</Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-fg-muted"><Terminal size={13} className="mt-0.5 shrink-0" /><code className="break-all">curl -H &quot;Authorization: Bearer {fresh.token.slice(0, 10)}…&quot; {origin}/api/v1/me</code></p>
        </div>
      ) : null}

      <div className="token-form mt-4 space-y-3 rounded-app border border-line bg-surface-2/50 p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={tr("Name, like “Zapier” or “weekly report script”")} maxLength={80} className="token-name h-9" />
          <Select value={form.profileId} onChange={(e) => set({ profileId: e.target.value })} className="token-profile h-9 sm:w-44" aria-label={tr("Profile")}><option value="">{tr("Default profile")}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select value={form.days} onChange={(e) => set({ days: e.target.value })} className="token-days h-9 sm:w-36" aria-label={tr("Expiry")}><option value="">{tr("Never expires")}</option><option value="30">{tr("{n} days", { n: 30 })}</option><option value="90">{tr("{n} days", { n: 90 })}</option><option value="365">{tr("{n} days", { n: 365 })}</option></Select>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-medium text-fg-muted">{tr("Permissions")}</span>
          <Segmented size="sm" value={form.access} onChange={(access) => set({ access })} className="token-scope shrink-0 [&_.ui-seg-btn]:whitespace-nowrap [&_.ui-seg-btn]:px-3" options={[{ value: "read", label: tr("Read") }, { value: "write", label: tr("Read & write") }, { value: "custom", label: tr("Custom") }]} />
          <button type="button" onClick={() => setShowIp((v) => !v)} className="token-ip-toggle ml-auto inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg" aria-expanded={showIp}>
            <Globe size={13} /> {tr("Allowed addresses")}{form.ip.trim() ? ` · ${form.ip.split(/[\s,]+/).filter(Boolean).length}` : ""} <ChevronDown size={13} className={cn("transition", showIp && "rotate-180")} />
          </button>
        </div>
        {form.access === "custom" ? (
          <div className="token-scopes grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {SCOPE_KEYS.map((k) => (
              <div key={k} className="flex items-start gap-2">
                <Checkbox checked={form.scopes.includes(k)} onChange={(on) => set({ scopes: on ? SCOPE_KEYS.filter((x) => x === k || form.scopes.includes(x)) : form.scopes.filter((x) => x !== k) })} className="mt-0.5" aria-label={tr(API_SCOPES[k].label)} data-scope={k} />
                <span className="min-w-0 text-xs leading-snug">
                  <span className="font-medium text-fg">{tr(API_SCOPES[k].label)}</span> <code className="font-mono text-[10px] text-fg-faint">{k}</code>
                  <span className="block text-fg-muted">{tr(API_SCOPES[k].description)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-fg-muted">{form.access === "read" ? tr("Reads tasks, projects and people; changes nothing.") : tr("Everything the API offers, including deleting tasks.")}</p>
        )}
        {showIp ? (
          <div className="token-ip">
            <Input value={form.ip} onChange={(e) => set({ ip: e.target.value })} placeholder="203.0.113.4, 198.51.100.0/24" className="token-ip-input h-9 font-mono text-xs" />
            <p className="mt-1 text-[11px] text-fg-faint">{tr("Only requests from these IP addresses or ranges are accepted. Leave it empty to accept any address.")}</p>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button icon={Plus} onClick={create} loading={busy && !revoking} disabled={!form.name.trim() || (form.access === "custom" && !form.scopes.length)} className="token-create">{tr("Create token")}</Button>
        </div>
      </div>

      <div className="mt-4">
        {tokens.loading && !tokens.data ? <Spinner className="text-fg-muted" /> : list.length ? (
          <ul className="token-list divide-y divide-line rounded-app border border-line">
            {list.map((t) => (
              <li key={t.id} className="token-row text-sm" data-token={t.id}>
                <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <KeyRound size={16} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{t.name} <code className="rounded bg-surface-2 px-1.5 font-mono text-[11px] text-fg-muted">{t.prefix}…</code></span>
                    <span className="block text-xs text-fg-muted">{profileName(t.profile_id)} · {t.last_used_at ? tr("used {when}", { when: relativeTime(t.last_used_at) }) : tr("never used")} · {t.expires_at ? tr("expires {date}", { date: formatDate(t.expires_at) }) : tr("no expiry")}{t.requests_total ? ` · ${tr("{n} requests today, {t} in all", { n: t.requests_today, t: t.requests_total })}` : ""}</span>
                    {t.scopes || t.ip_allow ? (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {(t.scopes ?? []).map((k) => <code key={k} className="token-scope-chip rounded bg-surface-2 px-1.5 font-mono text-[10px] text-fg-muted" title={tr(API_SCOPES[k]?.label ?? k)}>{k}</code>)}
                        {t.ip_allow ? <span className="token-ip-chip inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 text-[10px] text-fg-muted" title={t.ip_allow}><Globe size={10} /> {tr("only from {list}", { list: t.ip_allow })}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={t.scopes ? "violet" : t.scope === "write" ? "amber" : "sky"}>{t.scopes ? tr("Custom") : t.scope === "write" ? tr("Read & write") : tr("Read")}</Badge>
                  <span className="flex items-center gap-0.5">
                    <Button variant="ghost" size="iconSm" icon={Activity} onClick={() => toggle(t.id, "log")} aria-label={tr("Requests")} data-tip={tr("Requests")} className={cn("token-log-btn", panel?.id === t.id && panel.what === "log" && "bg-surface-2 text-fg")} />
                    <Button variant="ghost" size="iconSm" icon={Pencil} onClick={() => toggle(t.id, "edit")} aria-label={tr("Edit")} data-tip={tr("Edit")} className={cn("token-edit-btn", panel?.id === t.id && panel.what === "edit" && "bg-surface-2 text-fg")} />
                    <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={() => setRevoking(t)} aria-label={tr("Revoke")} data-tip={tr("Revoke")} className="token-revoke" />
                  </span>
                </div>
                {panel?.id === t.id && panel.what === "log" ? <TokenLog id={t.id} /> : null}
                {panel?.id === t.id && panel.what === "edit" ? <TokenEdit token={t} onDone={(rows) => { if (rows) tokens.setData(rows); setPanel(null); }} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-fg-muted">{tr("No tokens yet.")}</p>}
      </div>
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        loading={busy}
        title="Revoke this token?"
        description={revoking ? tr("Whatever uses “{name}” stops working at once. This cannot be undone; make a new token if you need one again.", { name: revoking.name }) : null}
        confirmText="Revoke"
      />
    </section>
  );
}

/** Rename a token or change the addresses it may be used from. */
function TokenEdit({ token, onDone }) {
  const tr = useT();
  const toast = useToast();
  const [name, setName] = useState(token.name);
  const [ip, setIp] = useState(token.ip_allow ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.patch(`/api/tokens/${token.id}`, { name: name.trim(), ip_allow: ip.trim() || null });
      toast.success(tr("Token saved"));
      onDone(res.tokens);
    } catch (e) {
      toast.error(tr("Could not save the token"), tr(e.message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="token-edit space-y-2 border-t border-line bg-surface-2/40 px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
        <label className="text-xs text-fg-muted">{tr("Name")}<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="token-edit-name mt-1 h-9" /></label>
        <label className="text-xs text-fg-muted">{tr("Allowed addresses")}<Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder={tr("Any address")} className="token-edit-ip mt-1 h-9 font-mono text-xs" /></label>
      </div>
      <p className="text-[11px] text-fg-faint">{tr("Permissions and profile stay as they were made; for others, make a new token.")}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => onDone(null)}>{tr("Cancel")}</Button>
        <Button size="sm" onClick={save} loading={busy} disabled={!name.trim()} className="token-edit-save">{tr("Save")}</Button>
      </div>
    </div>
  );
}

const STATUS_TONE = (s) => (s < 300 ? "text-emerald-600 dark:text-emerald-400" : s < 500 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400");

/** The latest requests a token made (kept 14 days). */
function TokenLog({ id }) {
  const tr = useT();
  const log = useFetch(`/api/tokens/${id}/log?limit=50`);
  const rows = log.data ?? [];
  return (
    <div className="token-log border-t border-line bg-surface-2/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium">{tr("Latest requests")}</span>
        <span className="text-[11px] text-fg-faint">{tr("kept for 14 days")}</span>
        <Button variant="ghost" size="iconXs" icon={RefreshCw} onClick={log.refetch} aria-label={tr("Refresh")} data-tip={tr("Refresh")} className="ml-auto" loading={log.loading} />
      </div>
      {log.loading && !log.data ? <Spinner className="text-fg-muted" /> : log.error ? <p className="text-xs text-rose-500">{log.error.message}</p> : rows.length ? (
        <div className="max-h-72 overflow-auto rounded-app-sm border border-line bg-surface">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-surface text-fg-faint">
              <tr><th className="px-2 py-1.5 font-medium">{tr("When")}</th><th className="px-2 py-1.5 font-medium">{tr("Request")}</th><th className="px-2 py-1.5 text-right font-medium">{tr("Answer")}</th><th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">ms</th><th className="hidden px-2 py-1.5 font-medium sm:table-cell">IP</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i} className="token-log-row">
                  <td className="whitespace-nowrap px-2 py-1 text-fg-muted" title={formatDateTime(r.created_at)}>{relativeTime(r.created_at)}</td>
                  <td className="px-2 py-1 font-mono"><span className="font-semibold">{r.method}</span> <span className="break-all text-fg-muted">{r.path}</span></td>
                  <td className={cn("px-2 py-1 text-right font-mono font-semibold", STATUS_TONE(r.status))}>{r.status}</td>
                  <td className="hidden px-2 py-1 text-right font-mono text-fg-faint sm:table-cell">{r.ms}</td>
                  <td className="hidden px-2 py-1 font-mono text-fg-faint sm:table-cell">{r.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs text-fg-muted">{tr("This token has not been used in the last 14 days.")}</p>}
    </div>
  );
}
