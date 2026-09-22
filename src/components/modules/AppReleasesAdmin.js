"use client";
import { useRef, useState } from "react";
import { Smartphone, Upload, Download, Trash2, ShieldCheck, Package } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, EmptyState } from "@/components/ui/Misc";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP } from "@/lib/modules";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const RELEASE_PACKAGE = "com.systemportal.task";

/** Admin: publish builds of the Android app; the phones update themselves from the newest one. */
export default function AppReleasesAdmin() {
  const tr = useT();
  const toast = useToast();
  const mod = MODULE_MAP.apps;
  const { data, loading, error, refetch } = useFetch("/api/app/releases");
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [doomed, setDoomed] = useState(null);
  const input = useRef(null);
  const releases = data ?? [];
  const latest = releases.find((r) => r.package_name === RELEASE_PACKAGE) ?? null;
  const others = releases.filter((r) => r.package_name !== RELEASE_PACKAGE);

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (notes.trim()) fd.append("notes", notes.trim());
      const r = await api.upload("/api/app/releases", fd);
      toast.success(tr("Version {v} published", { v: r.version_name }), tr("Phones with the app will update themselves."));
      setFile(null);
      setNotes("");
      if (input.current) input.current.value = "";
      refetch();
    } catch (e) {
      toast.error(tr("Could not publish"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const r = doomed;
    setDoomed(null);
    try {
      await api.del(`/api/app/releases/${r.id}`);
      toast.success(tr("Release removed"));
      refetch();
    } catch (e) {
      toast.error(tr("Could not remove"), e.message);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={tr("Mobile app")} description={tr(mod.description)} icon={Smartphone} color={mod.color} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={tr("Publish a new build")} description={tr("Choose the signed APK from the Android project (dist/TaskPortal-<version>.apk). The file itself says which version it is; a build that is older than the published one, or signed with another key, is refused.")} />
          <div className="mt-3 space-y-3">
            <input ref={input} type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-app file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={tr("What is new (shown on the phone before it updates)")} className="input w-full text-sm" />
            <div className="flex items-center gap-3">
              <Button icon={Upload} onClick={publish} loading={busy} disabled={!file} className="app-publish">{tr("Publish")}</Button>
              {file ? <span className="text-xs text-fg-muted">{file.name} · {formatBytes(file.size)}</span> : null}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={tr("Published now")} description={tr("What a phone that checks for updates is offered.")} />
          {loading && !data ? <Skeleton className="mt-3 h-24 w-full" /> : error ? <p className="mt-3 text-sm text-rose-500">{error.message}</p> : !latest ? (
            <EmptyState icon={Package} title={tr("Nothing published yet")} description={tr("Phones keep the version they have until a build is published here.")} className="mt-3" />
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2"><span className="text-xl font-semibold">{latest.version_name}</span><Badge tone="emerald">{tr("code {n}", { n: latest.version_code })}</Badge><span className="text-xs text-fg-muted">{formatBytes(latest.size_bytes)}</span></div>
              <p className="text-xs text-fg-muted">{tr("Published {when} by {name}", { when: formatDateTime(latest.created_at), name: latest.uploaded_by_name || "—" })}{latest.min_sdk ? ` · ${tr("Android {v} or newer", { v: latest.min_sdk >= 34 ? 14 : latest.min_sdk >= 33 ? 13 : latest.min_sdk >= 31 ? 12 : latest.min_sdk >= 30 ? 11 : latest.min_sdk >= 29 ? 10 : latest.min_sdk >= 28 ? 9 : 8 })}` : ""}</p>
              {latest.notes ? <p className="whitespace-pre-wrap rounded-app bg-surface-2 p-2 text-xs">{latest.notes}</p> : null}
              <p className="flex items-center gap-1 text-[11px] text-fg-muted"><ShieldCheck className="h-3.5 w-3.5" /> {tr("Signing key")} {latest.cert_sha256?.slice(0, 16)}… · SHA-256 {latest.sha256.slice(0, 16)}…</p>
              <div className="flex gap-2 pt-1">
                <a href={latest.url} className="inline-flex items-center gap-1 rounded-app border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2"><Download className="h-3.5 w-3.5" /> {tr("Download APK")}</a>
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDoomed(latest)}>{tr("Remove")}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title={tr("All builds")} description={tr("Every build ever published, newest first. Removing one never touches the phones; the newest remaining build is offered from then on.")} />
        {releases.length === 0 ? <p className="mt-3 text-sm text-fg-muted">{tr("No builds yet.")}</p> : (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-fg-muted"><th className="py-1 pr-3">{tr("Version")}</th><th className="py-1 pr-3">{tr("Package")}</th><th className="py-1 pr-3">{tr("Size")}</th><th className="py-1 pr-3">{tr("Published")}</th><th className="py-1 pr-3">{tr("By")}</th><th /></tr></thead>
            <tbody>
              {[...(latest ? [latest] : []), ...releases.filter((r) => r !== latest)].map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-medium">{r.version_name} <span className="text-xs text-fg-muted">({r.version_code})</span></td>
                  <td className="py-1.5 pr-3 text-xs text-fg-muted">{r.package_name}{others.includes(r) ? ` · ${tr("test flavour")}` : ""}</td>
                  <td className="py-1.5 pr-3">{formatBytes(r.size_bytes)}</td>
                  <td className="py-1.5 pr-3" title={formatDateTime(r.created_at)}>{relativeTime(r.created_at)}</td>
                  <td className="py-1.5 pr-3">{r.uploaded_by_name || "—"}</td>
                  <td className="py-1.5 text-right"><a href={r.url} className="mr-2 text-xs text-accent hover:underline">{tr("Download")}</a><button type="button" onClick={() => setDoomed(r)} className="text-xs text-rose-500 hover:underline">{tr("Remove")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ConfirmDialog open={Boolean(doomed)} title={tr("Remove version {v}?", { v: doomed?.version_name ?? "" })} description={tr("Phones that already have it keep it. The newest remaining build is offered from now on.")} confirmLabel={tr("Remove")} onConfirm={remove} onClose={() => setDoomed(null)} />
    </div>
  );
}
