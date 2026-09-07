"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Pin, PinOff, KeyRound, Eye, EyeOff, Copy, Check, Link2, User, Calendar, Clock, Tag, FolderKanban } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useUI, usePrefs } from "@/lib/store";
import { hashPin } from "@/lib/pin";
import VerifyModal from "@/components/ui/VerifyModal";
import { useFetch } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { INFO_CATEGORY, MODULE_MAP } from "@/lib/modules";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import InfoForm from "./InfoForm";
import TaskOutputs from "./TaskOutputs";
import AttachmentsPanel from "./AttachmentsPanel";
import { DetailSkeleton } from "./ProjectDetail";
import { useT } from "@/lib/i18n";

const NOTE_LABELS = { title: "Notes", singular: "note", plural: "notes", add: "Add note", first: "Add first note", empty: "No notes yet", emptyHint: "Add any number of notes to this topic — steps, snippets, history. Each keeps its own position.", placeholder: "Write a note…" };

export default function InfoDetail({ id }) {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const { data: item, loading, error, refetch, setData } = useFetch(`/api/info/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (error) return <EmptyState title="Info item not found" description={error.message} action={<Button onClick={() => router.push("/info")}>Back to info</Button>} />;
  if (loading && !item) return <DetailSkeleton />;
  if (!item) return null;

  const mod = MODULE_MAP.info;
  const togglePin = async () => {
    try {
      setData(await api.put(`/api/info/${id}`, { pinned: !item.pinned }));
    } catch (e) {
      toast.error("Could not update", e.message);
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/info/${id}`);
      toast.success("Info deleted");
      router.push("/info");
    } catch (e) {
      toast.error("Could not delete", e.message);
      setDeleting(false);
    }
  };
  const tags = (item.tags ?? "").split(",").filter(Boolean);
  const hasCredential = item.has_secret || item.username || item.url;

  return (
    <>
      <PageHeader
        title={tr(item.title)}
        icon={mod.icon}
        color={item.color}
        crumbs={[{ label: tr("Info"), href: "/info" }]}
        actions={
          <>
            <Button variant="outline" icon={item.pinned ? PinOff : Pin} onClick={togglePin}>{item.pinned ? "Unpin" : "Pin"}</Button>
            <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>{tr("Edit")}</Button>
            <Button variant="dangerGhost" icon={Trash2} onClick={() => setDelOpen(true)}>{tr("Delete")}</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <StatusBadge map={INFO_CATEGORY} value={item.category} dot={false} />
          {item.project_name ? (
            <Link href={`/projects/${item.project_id}`} className="inline-flex items-center gap-1 hover:text-accent">
              <span className="h-2 w-2 rounded-full" style={{ background: item.project_color }} /> {item.project_name}
            </Link>
          ) : null}
          {tags.map((t) => <span key={t} className="rounded-full border border-line px-1.5 py-px text-[10px]">#{t}</span>)}
          <span>· updated {relativeTime(item.updated_at)}</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4 anim-stagger">
          {item.summary ? <p className="text-sm text-fg-muted">{item.summary}</p> : null}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Content")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{item.content || <span className="text-fg-faint">Nothing written yet. Click Edit to add the main body.</span>}</p>
          </Card>
          <TaskOutputs taskId={item.id} outputs={item.notes ?? []} baseUrl={`/api/info/${item.id}/notes`} itemUrl="/api/info-notes" labels={NOTE_LABELS} onChange={(notes) => setData((i) => ({ ...i, notes, note_count: notes.length }))} />
          <AttachmentsPanel kind="info" parentId={item.id} attachments={item.attachments ?? []} onChange={(attachments) => setData((i) => ({ ...i, attachments, attachment_count: attachments.length }))} />
        </div>

        <div className="min-w-0 space-y-4 anim-stagger xl:sticky xl:top-0 xl:self-start">
          {hasCredential ? <CredentialCard item={item} /> : null}
          <Card className="space-y-2 text-xs text-fg-muted">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{tr("Meta")}</p>
            <p className="flex items-center gap-2"><FolderKanban size={13} /> {item.project_name ? <Link href={`/projects/${item.project_id}`} className="hover:text-fg">{item.project_name} · {item.project_code}</Link> : "Not linked to a project"}</p>
            <p className="flex items-center gap-2"><Tag size={13} /> {tags.length ? tags.map((t) => `#${t}`).join(" ") : "No tags"}</p>
            <p className="flex items-center gap-2"><Calendar size={13} /> Created {formatDateTime(item.created_at)}</p>
            <p className="flex items-center gap-2"><Clock size={13} /> Updated {formatDateTime(item.updated_at)}</p>
          </Card>
        </div>
      </div>

      <InfoForm open={editOpen} onClose={() => setEditOpen(false)} initial={item} onSaved={refetch} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={remove} loading={deleting} title={tr("Delete this info item?")} description="Its notes, attachments and any stored secret are permanently removed." />
    </>
  );
}

function CredentialCard({ item }) {
  const tr = useT();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const localPinHash = usePrefs((s) => s.pinHash);
  const localPinSalt = usePrefs((s) => s.pinSalt);
  const unlockedUntil = useUI((s) => s.secretsUnlockedUntil);
  const setUnlockedUntil = useUI((s) => s.setSecretsUnlockedUntil);
  const [secret, setSecret] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(null);
  const [verify, setVerify] = useState(null); // { then: (secret) => void }

  /** Fetch the secret; opens the verification prompt when the session is not (or no longer) verified. */
  const fetchSecret = (creds) => api.post(`/api/info/${item.id}/reveal`, creds ?? {});
  const withSecret = async (then) => {
    const fresh = unlockedUntil && new Date(unlockedUntil) > new Date();
    try {
      const r = await fetchSecret(fresh || user?.secrets_unlocked ? {} : undefined);
      setUnlockedUntil(r.unlocked_until);
      then(r.secret);
    } catch (e) {
      if (e.status === 401 && e.details?.needs) return setVerify({ then });
      throw e;
    }
  };
  const onVerify = async (creds) => {
    if (creds.pin && !user?.has_pin) {
      // the account has no PIN on record yet: check against this browser's lock-screen PIN, then store it
      if (!localPinHash || (await hashPin(creds.pin, localPinSalt)) !== localPinHash) throw new Error("Incorrect PIN.");
      const r = await api.put("/api/auth/pin", { pin: creds.pin });
      setUser((u) => (u ? { ...u, has_pin: r.has_pin } : u));
    }
    const r = await fetchSecret(creds); // throws with a message on a wrong PIN / password
    setUnlockedUntil(r.unlocked_until);
    verify?.then(r.secret);
  };

  // auto-hide a revealed secret after 30 s
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(() => setSecret(null), 30_000);
    return () => clearTimeout(t);
  }, [secret]);

  const reveal = async () => {
    if (secret) return setSecret(null);
    setRevealing(true);
    try {
      await withSecret((s) => setSecret(s ?? ""));
    } catch (e) {
      toast.error("Could not reveal secret", e.message);
    } finally {
      setRevealing(false);
    }
  };
  const copyValue = async (label, v) => {
    try {
      await navigator.clipboard.writeText(v ?? "");
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      toast.error("Could not copy", e.message);
    }
  };
  const copy = async (label, value) => {
    if (label !== "secret") return copyValue(label, value);
    if (secret != null) return copyValue("secret", secret);
    try {
      await withSecret((s) => copyValue("secret", s));
    } catch (e) {
      toast.error("Could not copy secret", e.message);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><KeyRound size={13} />{tr("Credential")}</p>
      {item.url ? (
        <Row label="URL">
          <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 text-sm hover:bg-surface-2">
            <Link2 size={14} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate">{item.url}</span>
          </a>
        </Row>
      ) : null}
      {item.username ? (
        <Row label="Username">
          <div className="flex items-center gap-1">
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-app-sm border border-line px-2 py-1.5 font-mono text-sm"><User size={14} className="shrink-0 text-fg-muted" /><span className="truncate">{item.username}</span></span>
            <Button variant="ghost" size="iconSm" icon={copied === "username" ? Check : Copy} onClick={() => copy("username", item.username)} aria-label="Copy username" title={tr("Copy")} />
          </div>
        </Row>
      ) : null}
      {item.has_secret ? (
        <Row label="Secret">
          <div className="flex items-center gap-1">
            <span className={cn("flex min-w-0 flex-1 items-center rounded-app-sm border border-line px-2 py-1.5 font-mono text-sm", !secret && "tracking-[0.25em] text-fg-muted")}>
              <span className="truncate">{secret ?? "••••••••••"}</span>
            </span>
            <Button variant="ghost" size="iconSm" icon={secret ? EyeOff : Eye} loading={revealing} onClick={reveal} aria-label={secret ? "Hide secret" : "Reveal secret"} title={secret ? "Hide" : "Reveal for 30 s"} />
            <Button variant="ghost" size="iconSm" icon={copied === "secret" ? Check : Copy} onClick={() => copy("secret", secret)} aria-label="Copy secret" title="Copy without showing" />
          </div>
          {item.secret_hint ? <p className="mt-1 text-[11px] text-fg-faint">{item.secret_hint}</p> : null}
          <p className="mt-1 text-[10px] text-fg-faint">Stored encrypted. Revealing or copying asks for your lock-screen PIN or password (once per 10 minutes); revealed values hide again after 30 seconds.</p>
        </Row>
      ) : null}
      <VerifyModal
        open={!!verify}
        onClose={() => setVerify(null)}
        onVerify={onVerify}
        allowPin={Boolean(user?.has_pin || localPinHash)}
        title="Reveal secret"
        description={user?.has_pin || localPinHash ? "Confirm with your lock-screen PIN or your login password." : "Confirm with your login password. Set a lock-screen PIN in Preferences to use it here too."}
      />
    </Card>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{label}</p>
      {children}
    </div>
  );
}
