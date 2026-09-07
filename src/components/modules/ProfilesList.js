"use client";
import { useCallback, useState } from "react";
import { Plus, Layers, Check, Pencil, Trash2, Star, ArrowRightLeft, FolderKanban, ClipboardList, Users, CheckSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { MODULE_MAP } from "@/lib/modules";
import { cn, formatDate } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import ProfileForm from "./ProfileForm";
import { useNewParam, useNewShortcut } from "./shared";
import { useT } from "@/lib/i18n";

export default function ProfilesList() {
  const tr = useT();
  const toast = useToast();
  const { user, switchProfile, setUser } = useAuth();
  const { data, loading, error, refetch } = useFetch("/api/profiles");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/profiles", openNew);
  useNewShortcut(openNew);
  const mod = MODULE_MAP.profiles;
  const items = data?.items ?? [];
  const activeId = user?.profile_id;

  const onSaved = async (saved, created, switchAfter) => {
    if (created && switchAfter) return switchProfile(saved.id, "/");
    refetch();
    // keep the header/switcher list fresh
    try {
      const me = await api.get("/api/auth/me");
      setUser((u) => ({ ...u, profile: me.profile, profiles: me.profiles }));
    } catch {}
  };
  const makeDefault = async (p) => {
    try {
      await api.put(`/api/profiles/${p.id}`, { is_default: true });
      toast.success(`${p.name} is now your default profile`);
      onSaved(p, false, false);
    } catch (e) {
      toast.error("Could not update profile", e.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/api/profiles/${toDelete.id}`);
      toast.success(`${toDelete.name} deleted`);
      const wasActive = toDelete.id === activeId;
      setToDelete(null);
      if (wasActive) window.location.assign(new URL("/", window.location.origin).toString());
      else onSaved(null, false, false);
    } catch (e) {
      toast.error("Could not delete profile", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={tr("Profiles")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button icon={Plus} onClick={openNew}>{tr("New profile")}</Button>} />
      {error ? <EmptyState title="Could not load profiles" description={error.message} /> : null}
      {loading && !data ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 anim-stagger">
        {items.map((p) => {
          const active = p.id === activeId;
          return (
            <Card key={p.id} className={cn("relative flex flex-col", active && "ring-2 ring-accent/50")}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-app text-white shadow-app" style={{ background: p.color }}>
                  <Layers size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-base font-semibold">{p.name}</h3>
                    {active ? <span className="rounded-full bg-accent/12 px-1.5 py-px text-[10px] font-semibold text-accent">active</span> : null}
                    {p.is_default ? <span className="rounded-full bg-surface-3 px-1.5 py-px text-[10px] text-fg-muted">{tr("default")}</span> : null}
                  </div>
                  <p className="truncate text-xs text-fg-muted">{p.description || `Created ${formatDate(p.created_at)}`}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  [FolderKanban, p.project_count, "projects"],
                  [ClipboardList, p.requirement_count, "reqs"],
                  [Users, p.employee_count, "people"],
                  [CheckSquare, p.open_task_count, "open"],
                ].map(([Icon, n, label]) => (
                  <div key={label} className="rounded-app-sm bg-surface-2 py-2">
                    <Icon size={13} className="mx-auto mb-0.5 text-fg-muted" />
                    <dd className="text-lg font-semibold tabular-nums leading-tight">{n}</dd>
                    <dt className="text-[10px] uppercase tracking-wider text-fg-faint">{label}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center gap-1.5">
                {active ? (
                  <Button size="sm" variant="secondary" icon={Check} disabled>{tr("Active")}</Button>
                ) : (
                  <Button size="sm" icon={ArrowRightLeft} onClick={() => switchProfile(p.id, "/")}>Switch</Button>
                )}
                <span className="flex-1" />
                {!p.is_default ? <Button size="iconSm" variant="ghost" icon={Star} onClick={() => makeDefault(p)} aria-label="Make default" title="Make default" /> : null}
                <Button size="iconSm" variant="ghost" icon={Pencil} onClick={() => { setEditing(p); setFormOpen(true); }} aria-label={tr("Edit")} title={tr("Edit")} />
                <Button size="iconSm" variant="dangerGhost" icon={Trash2} onClick={() => setToDelete(p)} aria-label={tr("Delete")} title={tr("Delete")} disabled={items.length <= 1} />
              </div>
            </Card>
          );
        })}
      </div>
      <ProfileForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={onSaved} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        title={toDelete ? `Delete profile “${toDelete.name}”?` : ""}
        description={toDelete ? `Everything inside it is deleted permanently: ${toDelete.project_count} projects, ${toDelete.requirement_count} requirements, ${toDelete.employee_count} employees, ${toDelete.task_count} tasks and their attachments.` : ""}
        confirmText="Delete profile and its data"
      />
    </>
  );
}
