"use client";
import { useState } from "react";
import { Webhook, Plus, Trash2, Send, Copy, Check, ListChecks, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Input, Checkbox, Toggle } from "@/components/ui/Controls";
import { Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, relativeTime, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** A profile's webhooks: add one (URL + events, secret shown once), test it, watch deliveries, pause or remove it. */
export default function WebhooksDialog({ profile, open, onClose }) {
  const tr = useT();
  const toast = useToast();
  const { data, setData, loading } = useFetch(`/api/profiles/${profile?.id}/webhooks`, { enabled: Boolean(open && profile) });
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState(null); // null = every event
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null); // { id, secret }
  const [copied, setCopied] = useState(false);
  const [showing, setShowing] = useState(null); // hook id whose deliveries are open
  const deliveries = useFetch(`/api/profiles/${profile?.id}/webhooks/${showing}/deliveries`, { enabled: Boolean(showing) });
  const events = Object.entries(data?.events ?? {});
  const hooks = data?.webhooks ?? [];

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/profiles/${profile.id}/webhooks`, { url: url.trim(), events: picked ? [...picked] : "*" });
      setData((d) => ({ ...d, webhooks: res.webhooks }));
      setFresh({ id: res.webhook.id, secret: res.webhook.secret });
      setCopied(false);
      setUrl("");
      setPicked(null);
    } catch (e) {
      toast.error(tr("Could not add the webhook"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const update = async (h, patch) => {
    try {
      const res = await api.put(`/api/profiles/${profile.id}/webhooks/${h.id}`, patch);
      setData((d) => ({ ...d, webhooks: res.webhooks }));
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    }
  };
  const remove = async (h) => {
    try {
      const res = await api.del(`/api/profiles/${profile.id}/webhooks/${h.id}`);
      setData((d) => ({ ...d, webhooks: res.webhooks }));
      if (showing === h.id) setShowing(null);
      toast.success(tr("Webhook removed"));
    } catch (e) {
      toast.error(tr("Could not remove"), e.message);
    }
  };
  const test = async (h) => {
    try {
      const d = await api.post(`/api/profiles/${profile.id}/webhooks/${h.id}/test`, {});
      if (d.status === "sent") toast.success(tr("The receiver answered {status}", { status: d.response_status }));
      else toast.error(tr("The receiver did not take it"), d.error || `HTTP ${d.response_status}`);
      const res = await api.get(`/api/profiles/${profile.id}/webhooks`);
      setData(res);
      if (showing === h.id) deliveries.refetch();
    } catch (e) {
      toast.error(tr("Could not send the test"), e.message);
    }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(fresh.secret); setCopied(true); } catch { toast.error(tr("Could not copy")); } };
  const toggleEvent = (k) => setPicked((p) => { const next = new Set(p ?? events.map(([e]) => e)); next.has(k) ? next.delete(k) : next.add(k); return next; });

  return (
    <Modal open={open} onClose={onClose} size="lg" title={tr("Webhooks for “{name}”", { name: profile?.name })} description={tr("Tell another system when something happens here. Each delivery is a signed JSON POST; failures are retried three times.")} className="webhooks-dialog">
      {loading && !data ? <Skeleton className="h-40 w-full" /> : null}
      {data ? (
        <div className="space-y-4">
          {fresh ? (
            <div className="hook-fresh rounded-app border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <p className="font-medium">{tr("Signing secret: copy it now, it is not shown again.")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><code className="hook-secret break-all rounded-app-sm bg-surface px-2 py-1 font-mono text-xs">{fresh.secret}</code><Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>{copied ? tr("Copied") : tr("Copy")}</Button></div>
              <p className="mt-2 text-xs text-fg-muted">{tr("Check X-TaskPortal-Signature = sha256=HMAC-SHA256(body, secret) on the receiving side.")}</p>
            </div>
          ) : null}
          <div className="hook-add rounded-app border border-line bg-surface-2/50 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-faint"><Plus size={13} /> {tr("Add a webhook")}</p>
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="https://example.com/task-portal" className="hook-url h-9 flex-1" />
              <Button icon={Plus} onClick={add} loading={busy} disabled={!url.trim()} className="hook-create">{tr("Add")}</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Checkbox checked={!picked} onChange={(v) => setPicked(v ? null : new Set())} label={tr("Every event")} className="text-xs" />
              {events.map(([k, label]) => <Checkbox key={k} checked={!picked || picked.has(k)} onChange={() => toggleEvent(k)} label={<span className="text-xs"><code className="text-[11px]">{k}</code> <span className="text-fg-muted">· {tr(label)}</span></span>} className={cn("text-xs", !picked && "opacity-60")} />)}
            </div>
          </div>
          {hooks.length ? (
            <ul className="hook-list divide-y divide-line rounded-app border border-line">
              {hooks.map((h) => (
                <li key={h.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Webhook size={15} className={cn("shrink-0", h.active ? "text-accent" : "text-fg-faint")} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{h.url}</span>
                    {h.last_status != null ? <Badge tone={h.last_status >= 200 && h.last_status < 300 ? "emerald" : "rose"}>{h.last_status}</Badge> : null}
                    {h.failures ? <Badge tone="amber">{tr("{n} failures", { n: h.failures })}</Badge> : null}
                    {!h.active ? <Badge tone="slate">{tr("Paused")}</Badge> : null}
                    <Toggle size="sm" checked={h.active} onChange={(v) => update(h, { active: v })} className="hook-active" />
                    <Button size="iconSm" variant="ghost" icon={Send} onClick={() => test(h)} aria-label={tr("Send test")} data-tip={tr("Send test")} className="hook-test" />
                    <Button size="iconSm" variant={showing === h.id ? "secondary" : "ghost"} icon={ListChecks} onClick={() => setShowing(showing === h.id ? null : h.id)} aria-label={tr("Deliveries")} data-tip={tr("Deliveries")} className="hook-deliveries" />
                    <Button size="iconSm" variant="dangerGhost" icon={Trash2} onClick={() => remove(h)} aria-label={tr("Remove")} data-tip={tr("Remove")} className="hook-remove" />
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{h.events[0] === "*" ? tr("Every event") : h.events.join(", ")} · {h.last_delivered_at ? tr("last delivered {when}", { when: relativeTime(h.last_delivered_at) }) : tr("nothing delivered yet")} · {tr("by {name}", { name: h.created_by })}</p>
                  {showing === h.id ? (
                    <div className="hook-delivery-list mt-2 rounded-app border border-line bg-surface-2/40">
                      {deliveries.data?.length ? deliveries.data.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-0">
                          {d.status === "sent" ? <CheckCircle2 size={13} className="text-emerald-500" /> : d.status === "failed" ? <AlertTriangle size={13} className="text-rose-500" /> : <Clock size={13} className="text-amber-500" />}
                          <code>{d.event}</code>
                          <span className="text-fg-muted">{formatDateTime(d.created_at)}</span>
                          <span className="text-fg-muted">{tr("{n} attempts", { n: d.attempts })}{d.response_status ? ` · HTTP ${d.response_status}` : ""}</span>
                          {d.error ? <span className="text-rose-500">{d.error}</span> : null}
                          {d.status === "pending" && d.next_attempt_at ? <span className="text-fg-muted">{tr("retry {when}", { when: relativeTime(d.next_attempt_at) })}</span> : null}
                        </div>
                      )) : <p className="px-2 py-2 text-xs text-fg-muted">{deliveries.loading ? tr("Loading…") : tr("No deliveries yet.")}</p>}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-muted">{tr("No webhooks yet. Add one above; the events are listed with it.")}</p>}
        </div>
      ) : null}
    </Modal>
  );
}
