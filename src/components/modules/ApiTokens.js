"use client";
import { useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check, Terminal } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Input, Select, Segmented } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Misc";
import { formatDate, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Security page: personal API tokens for scripts and other tools. The token is shown once, right after it is made. */
export default function ApiTokens() {
  const tr = useT();
  const toast = useToast();
  const { user } = useAuth();
  const tokens = useFetch("/api/tokens");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("read");
  const [profileId, setProfileId] = useState("");
  const [days, setDays] = useState("");
  const [fresh, setFresh] = useState(null); // { token, row } just created
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const profiles = [...(user?.profiles ?? []).map((p) => ({ id: p.id, name: p.name })), ...(user?.shared_profiles ?? []).map((p) => ({ id: p.id, name: `${p.name} · ${p.owner?.name ?? ""}` }))];
  const profileName = (id) => (id ? profiles.find((p) => p.id === id)?.name ?? `#${id}` : tr("Default profile"));

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post("/api/tokens", { name: name.trim(), scope, profile_id: profileId || null, days: days || null });
      tokens.setData(res.tokens);
      setFresh(res);
      setName("");
      setCopied(false);
    } catch (e) {
      toast.error(tr("Could not create the token"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (t) => {
    try {
      tokens.setData((await api.del(`/api/tokens/${t.id}`)).tokens);
      if (fresh?.row.id === t.id) setFresh(null);
      toast.success(tr("Token revoked"));
    } catch (e) {
      toast.error(tr("Could not revoke"), e.message);
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh.token); setCopied(true); } catch { toast.error(tr("Could not copy")); }
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const list = tokens.data ?? [];

  return (
    <section className="ui-card card api-tokens p-5">
      <h2 className="text-base font-semibold">{tr("API tokens")}</h2>
      <p className="mb-4 text-xs text-fg-muted">{tr("For scripts, spreadsheets and other tools. A token uses the same API as this app, inside one profile, as you. Read tokens can only read; no token can change your account or administration settings.")}</p>
      {fresh ? (
        <div className="token-fresh mb-4 rounded-app border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <p className="font-medium">{tr("Copy the token now: it is not shown again.")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="token-value break-all rounded-app-sm bg-surface px-2 py-1 font-mono text-xs">{fresh.token}</code>
            <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy} className="token-copy">{copied ? tr("Copied") : tr("Copy")}</Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-fg-muted"><Terminal size={13} className="mt-0.5 shrink-0" /><code className="break-all">curl -H &quot;Authorization: Bearer {fresh.token.slice(0, 10)}…&quot; {origin}/api/tasks</code></p>
        </div>
      ) : null}
      <div className="mb-4 grid gap-2 rounded-app border border-line bg-surface-2/50 p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={tr("Name, like “Zapier” or “weekly report script”")} maxLength={80} className="token-name h-9" />
        <Segmented size="sm" value={scope} onChange={setScope} className="token-scope self-center" options={[{ value: "read", label: tr("Read") }, { value: "write", label: tr("Read & write") }]} />
        <Select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="token-profile h-9 w-44"><option value="">{tr("Default profile")}</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="token-days h-9 w-36"><option value="">{tr("Never expires")}</option><option value="30">{tr("{n} days", { n: 30 })}</option><option value="90">{tr("{n} days", { n: 90 })}</option><option value="365">{tr("{n} days", { n: 365 })}</option></Select>
        <Button icon={Plus} onClick={create} loading={busy} disabled={!name.trim()} className="token-create">{tr("Create")}</Button>
      </div>
      {tokens.loading && !tokens.data ? <Spinner className="text-fg-muted" /> : list.length ? (
        <ul className="token-list divide-y divide-line rounded-app border border-line">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <KeyRound size={16} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">{t.name} <code className="rounded bg-surface-2 px-1.5 font-mono text-[11px] text-fg-muted">{t.prefix}…</code></span>
                <span className="block text-xs text-fg-muted">{profileName(t.profile_id)} · {t.last_used_at ? tr("used {when}", { when: relativeTime(t.last_used_at) }) : tr("never used")} · {t.expires_at ? tr("expires {date}", { date: formatDate(t.expires_at) }) : tr("no expiry")}</span>
              </span>
              <Badge tone={t.scope === "write" ? "amber" : "sky"}>{t.scope === "write" ? tr("Read & write") : tr("Read")}</Badge>
              <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={() => revoke(t)} aria-label={tr("Revoke")} data-tip={tr("Revoke")} className="token-revoke" />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-fg-muted">{tr("No tokens yet.")}</p>}
    </section>
  );
}
