"use client";
import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Monitor, Smartphone, Tablet, LogOut, KeyRound, Fingerprint, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import GoogleMark from "@/components/ui/GoogleMark";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const DEVICE_ICON = { phone: Smartphone, tablet: Tablet, desktop: Monitor };
const METHOD = {
  password: { label: "Password", icon: KeyRound },
  totp: { label: "Password + code", icon: ShieldCheck },
  passkey: { label: "Passkey", icon: Fingerprint },
  google: { label: "Google", icon: GoogleMark },
};
const REASON = { wrong_password: "Wrong password", wrong_code: "Wrong code", disabled: "Account disabled", passkey_failed: "Passkey rejected" };

/** Account security: active sessions (terminate them) and the sign-in history with device details. */
export default function SecurityPage() {
  const tr = useT();
  const toast = useToast();
  const sessions = useFetch("/api/auth/sessions");
  const history = useFetch("/api/auth/login-history");
  const [target, setTarget] = useState(null); // a session row, or "others"
  const [busy, setBusy] = useState(false);

  const terminate = async () => {
    setBusy(true);
    try {
      const list = await api.del(target === "others" ? "/api/auth/sessions" : `/api/auth/sessions/${target.id}`);
      sessions.setData(list);
      toast.success(target === "others" ? tr("Other sessions signed out") : tr("Session terminated"));
      setTarget(null);
      history.refetch();
    } catch (e) {
      toast.error(tr("Could not terminate the session"), e.message);
    } finally {
      setBusy(false);
    }
  };

  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);

  return (
    <>
      <PageHeader title={tr("Security")} description={tr("Where you are signed in, and your recent sign-ins.")} icon={ShieldCheck} color="#10b981" crumbs={[]} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{tr("Active sessions")}</h2>
              <p className="text-xs text-fg-muted">{tr("Every device and browser that is currently signed in to your account. Terminate any you don't recognise.")}</p>
            </div>
            {others.length ? (
              <Button variant="secondary" size="sm" icon={LogOut} onClick={() => setTarget("others")}>{tr("Sign out other sessions")}</Button>
            ) : null}
          </div>
          {sessions.loading && !sessions.data ? (
            <Spinner className="text-fg-muted" />
          ) : sessions.error ? (
            <p className="text-sm text-rose-500">{sessions.error.message}</p>
          ) : (
            <ul className="divide-y divide-line rounded-app border border-line">
              {list.map((s) => {
                const Icon = DEVICE_ICON[s.device] ?? Monitor;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app bg-surface-2 text-fg-muted"><Icon size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {s.label}
                        {s.current ? <Badge tone="accent">{tr("This device")}</Badge> : null}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {s.ip ? `${s.ip} · ` : ""}
                        {tr("signed in {when}", { when: relativeTime(s.created_at) })}
                        {s.last_seen_at ? ` · ${tr("last active {when}", { when: relativeTime(s.last_seen_at) })}` : ""}
                        {` · ${tr("expires {when}", { when: relativeTime(s.expires_at) })}`}
                      </span>
                    </span>
                    {s.current ? null : (
                      <Button variant="ghost" size="xs" className="text-rose-500" onClick={() => setTarget(s)}>{tr("Terminate")}</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-fg-faint">
            {tr("Passkeys, Google and two-factor authentication are managed in")} <Link href="#" onClick={(e) => { e.preventDefault(); document.querySelector('[aria-label="Account menu"]')?.click(); }} className="text-accent hover:underline">{tr("Profile & password")}</Link>.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">{tr("Login history")}</h2>
          <p className="mb-4 text-xs text-fg-muted">{tr("Successful sign-ins and failed attempts on your account, newest first. Kept for 180 days.")}</p>
          {history.loading && !history.data ? (
            <Spinner className="text-fg-muted" />
          ) : history.error ? (
            <p className="text-sm text-rose-500">{history.error.message}</p>
          ) : !history.data?.length ? (
            <EmptyState icon={ShieldCheck} title={tr("No sign-ins recorded yet")} description={tr("Sign-ins from now on will appear here.")} compact />
          ) : (
            <div className="overflow-x-auto rounded-app border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">{tr("When")}</th>
                    <th className="px-3 py-2 font-medium">{tr("Result")}</th>
                    <th className="px-3 py-2 font-medium">{tr("Method")}</th>
                    <th className="px-3 py-2 font-medium">{tr("Device")}</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.data.map((e) => {
                    const m = METHOD[e.method] ?? { label: e.method, icon: KeyRound };
                    const MIcon = m.icon;
                    const DIcon = DEVICE_ICON[e.device] ?? Monitor;
                    return (
                      <tr key={e.id} className={e.success ? undefined : "bg-rose-500/[0.04]"}>
                        <td className="whitespace-nowrap px-3 py-2 text-fg-muted" title={formatDateTime(e.created_at)}>{relativeTime(e.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {e.success ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> {tr("Signed in")}{e.current ? ` · ${tr("this session")}` : e.session_active ? ` · ${tr("still active")}` : ""}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-500"><XCircle size={14} /> {tr("Failed")}{e.reason ? ` · ${tr(REASON[e.reason] ?? e.reason)}` : ""}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2"><span className="inline-flex items-center gap-1.5"><MIcon size={14} className="text-fg-muted" /> {tr(m.label)}</span></td>
                        <td className="whitespace-nowrap px-3 py-2"><span className="inline-flex items-center gap-1.5"><DIcon size={14} className="text-fg-muted" /> {e.browser}{e.os ? ` ${tr("on")} ${e.os}` : ""}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg-muted">{e.ip || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={terminate}
        loading={busy}
        title={target === "others" ? tr("Sign out other sessions?") : tr("Terminate this session?")}
        confirmText={target === "others" ? tr("Sign out") : tr("Terminate")}
        description={target === "others" ? tr("Every other device and browser is signed out immediately. This one stays signed in.") : target ? `${target.label}${target.ip ? ` · ${target.ip}` : ""} — ${tr("that device is signed out immediately.")}` : ""}
      />
    </>
  );
}
