"use client";
import { useRef, useState } from "react";
import { Smartphone, Upload, Download, Trash2, ShieldCheck, Package, BellRing, Save, KeyRound, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Input, Field } from "@/components/ui/Controls";
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
      <IphonePush tr={tr} />
      <LegalInfo tr={tr} />
      <ConfirmDialog open={Boolean(doomed)} title={tr("Remove version {v}?", { v: doomed?.version_name ?? "" })} description={tr("Phones that already have it keep it. The newest remaining build is offered from now on.")} confirmText={tr("Remove")} onConfirm={remove} onClose={() => setDoomed(null)} />
    </div>
  );
}

/** The key iPhone notifications go out with: Apple's push service wants a .p8 key with its Key ID and the Team ID. */
function IphonePush({ tr }) {
  const toast = useToast();
  const { data: s, refetch } = useFetch("/api/app/apns");
  const [form, setForm] = useState(null); // { teamId, keyId } or null = untouched
  const [key, setKey] = useState(null); // { name, text } of a chosen .p8 file
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const input = useRef(null);
  const shown = form ?? { teamId: s?.team_id || "", keyId: s?.key_id || "" };
  const dirty = Boolean(key) || (Boolean(form) && (shown.teamId !== (s?.team_id || "") || shown.keyId !== (s?.key_id || "")));
  const pick = async (file) => {
    if (!file) return setKey(null);
    const text = await file.text();
    setKey({ name: file.name, text });
    // Apple names the file after the key: AuthKey_<Key ID>.p8
    const id = /AuthKey_([A-Z0-9]{10})\.p8$/i.exec(file.name)?.[1];
    if (id) setForm({ ...shown, keyId: id.toUpperCase() });
  };
  const save = async () => {
    setSaving(true);
    try {
      const body = { team_id: shown.teamId, key_id: shown.keyId };
      if (key) body.key = key.text;
      await api.put("/api/app/apns", body);
      toast.success(tr("iPhone notification key saved"));
      setForm(null);
      setKey(null);
      if (input.current) input.current.value = "";
      refetch();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      await api.post("/api/app/apns/test");
      toast.success(tr("Apple accepts the key"), tr("iPhones that turned notifications on get them from now on."));
    } catch (e) {
      toast.error(tr("Apple does not accept the key"), e.message);
    } finally {
      setTesting(false);
      refetch();
    }
  };
  const remove = async () => {
    setRemoving(false);
    try {
      await api.put("/api/app/apns", { key: "" });
      toast.success(tr("The key is removed"), tr("iPhones get no notifications until a key is saved again."));
      refetch();
    } catch (e) {
      toast.error(tr("Could not remove"), e.message);
    }
  };
  return (
    <Card className="space-y-4">
      <CardHeader title={tr("iPhone notifications")} description={tr("The iPhone app gets its notifications through Apple's push service, which needs a key from the Apple Developer account: Certificates, IDs & Profiles → Keys → add a key with Apple Push Notifications service (APNs) and download it. The file (AuthKey_<Key ID>.p8) can be downloaded only once; keep a copy somewhere safe. The Team ID is under Membership details.")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tr("Team ID")}><Input value={shown.teamId} onChange={(e) => setForm({ ...shown, teamId: e.target.value.toUpperCase() })} maxLength={10} autoComplete="off" placeholder="ABCDE12345" className="apns-team" /></Field>
        <Field label={tr("Key ID")}><Input value={shown.keyId} onChange={(e) => setForm({ ...shown, keyId: e.target.value.toUpperCase() })} maxLength={10} autoComplete="off" placeholder="XYZ987WVUT" className="apns-key-id" /></Field>
        <Field label={tr("Key file (.p8)")} hint={s?.key_set && !key ? tr("A key is saved. Choose a new file to replace it.") : key ? key.name : undefined}>
          <input ref={input} type="file" accept=".p8" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="apns-key-file block w-full text-sm file:mr-3 file:rounded-app file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty} className="apns-save">{tr("Save changes")}</Button>
        <Button variant="outline" icon={KeyRound} onClick={test} loading={testing} disabled={dirty || !s?.ready} className="apns-test">{tr("Test the key")}</Button>
        {s?.key_set ? <Button variant="ghost" icon={Trash2} onClick={() => setRemoving(true)}>{tr("Remove the key")}</Button> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <BellRing className="h-3.5 w-3.5" />
        {s?.ready ? <Badge tone="emerald">{tr("On")}</Badge> : <Badge>{tr("Off")}</Badge>}
        <span>{s?.ready ? tr("iPhones signed in with notifications on: {n}", { n: s.devices }) : tr("No key yet: the iPhone app works, but gets no notifications while it is closed.")}</span>
        {s?.ready && s.last_ok_at ? <span>· {tr("Apple last accepted a notification {when}.", { when: relativeTime(s.last_ok_at) })}</span> : null}
      </div>
      {s?.last_error ? <p className="rounded-app bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">{tr("Last problem ({when}): {error}", { when: relativeTime(s.last_error_at), error: s.last_error })}</p> : null}
      <ConfirmDialog open={removing} title={tr("Remove the iPhone notification key?")} description={tr("iPhones get no notifications until a key is saved again.")} confirmText={tr("Remove")} onConfirm={remove} onClose={() => setRemoving(false)} />
    </Card>
  );
}

/** Who runs the portal, as the public privacy policy and terms name them (the App Store listing links to both). */
function LegalInfo({ tr }) {
  const toast = useToast();
  const { data: s, refetch } = useFetch("/api/settings/legal");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const saved = { operator: s?.operator || "", contact_email: s?.contact_email || "", country: s?.country || "" };
  const shown = form ?? saved;
  const dirty = Boolean(form) && Object.keys(saved).some((k) => shown[k].trim() !== saved[k]);
  const set = (k) => (e) => setForm({ ...shown, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/settings/legal", shown);
      toast.success(tr("Saved"), tr("The privacy policy and the terms show it from now on."));
      setForm(null);
      refetch();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setSaving(false);
    }
  };
  const link = (href, label) => (
    <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-accent hover:underline">{label} <ExternalLink className="h-3 w-3" /></a>
  );
  return (
    <Card className="legal-info space-y-4">
      <CardHeader title={tr("Privacy policy and terms")} description={tr("Both pages are public and come in English and Chinese. The App Store asks for the privacy policy's address; the sign-in and sign-up screens of the web and the iPhone app link to both. Say who runs this portal and where people can reach you; until then the pages name “the administrator of this portal”.")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tr("Run by")} hint={tr("A person or a company, as on the App Store")}><Input value={shown.operator} onChange={set("operator")} maxLength={160} placeholder={tr("Your name or company")} className="legal-operator" /></Field>
        <Field label={tr("Contact email")}><Input type="email" value={shown.contact_email} onChange={set("contact_email")} maxLength={190} placeholder="privacy@example.com" className="legal-contact" /></Field>
        <Field label={tr("Country (law that applies)")}><Input value={shown.country} onChange={set("country")} maxLength={80} placeholder={tr("e.g. Malaysia")} className="legal-country" /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button icon={Save} onClick={save} loading={saving} disabled={!dirty} className="legal-save">{tr("Save changes")}</Button>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {link("/privacy?lang=en", tr("Privacy Policy"))}
          {link("/privacy?lang=zh-CN", "隐私政策")}
          {link("/terms?lang=en", tr("Terms of Use"))}
          {link("/terms?lang=zh-CN", "使用条款")}
        </span>
      </div>
    </Card>
  );
}
