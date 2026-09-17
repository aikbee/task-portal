"use client";
import { useState } from "react";
import { UserPlus, Trash2, Crown, Mail, Users, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export const MEMBER_ROLE = {
  owner: { label: "Owner", tone: "amber", hint: "Everything, including the Info vault" },
  manager: { label: "Manager", tone: "violet", hint: "Add, edit, delete and invite people" },
  editor: { label: "Editor", tone: "sky", hint: "Add and edit, but not delete" },
  viewer: { label: "Viewer", tone: "slate", hint: "Look only" },
};
const ASSIGNABLE = ["viewer", "editor", "manager"];

/** Who a profile is shared with: list, invite (a chat friend or any account by email), change roles, remove. */
export default function ProfileMembers({ profile, open, onClose, onChanged }) {
  const tr = useT();
  const toast = useToast();
  const { user } = useAuth();
  const { data, setData, loading, error } = useFetch(`/api/profiles/${profile?.id}/members`, { enabled: Boolean(open && profile) });
  const canManage = Boolean(data?.can_manage);
  const myRole = data?.profile?.my_role;
  const friends = useFetch(`/api/profiles/${profile?.id}/candidates`, { enabled: Boolean(open && profile && canManage) });
  const [pick, setPick] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const withdraw = async (inv) => {
    try {
      apply(await api.del(`/api/profiles/${profile.id}/invites/${inv.id}`));
      toast.success(tr("Invitation withdrawn"));
    } catch (e) {
      toast.error(tr("Could not withdraw"), e.message);
    }
  };
  const roles = myRole === "owner" ? ASSIGNABLE : ["viewer", "editor"]; // managers are the owner's call

  const apply = (next) => {
    setData((d) => ({ ...d, members: next.members ?? d.members, pending: next.pending ?? d.pending }));
    friends.refetch();
    onChanged?.();
  };
  const invite = async () => {
    if (!pick && !email.trim()) return;
    setBusy(true);
    try {
      const next = await api.post(`/api/profiles/${profile.id}/members`, pick ? { user_id: Number(pick), role } : { email: email.trim(), role });
      apply(next);
      if (next.invited_by_email) toast.success(tr("Invitation emailed"), tr("{email} has no account yet. The link in the message creates one and works for 7 days.", { email: next.invited_by_email }));
      else toast.success(tr("Invitation sent"), tr("They join once they accept it on their Profiles page."));
      setPick("");
      setEmail("");
    } catch (e) {
      toast.error(tr("Could not invite"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const changeRole = async (m, next) => {
    try {
      apply(await api.put(`/api/profiles/${profile.id}/members/${m.id}`, { role: next }));
    } catch (e) {
      toast.error(tr("Could not change the role"), e.message);
    }
  };
  const remove = async (m) => {
    try {
      apply(await api.del(`/api/profiles/${profile.id}/members/${m.id}`));
      toast.success(m.status === "invited" ? tr("Invitation withdrawn") : tr("{name} removed", { name: m.name }));
    } catch (e) {
      toast.error(tr("Could not remove"), e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={profile ? tr("Share “{name}”", { name: profile.name }) : ""} description={tr("Members see this profile's projects, requirements, employees, tasks, board, calendar and draw boards. The Info vault stays private to the owner.")}>
      {error ? <p className="text-sm text-rose-500">{error.message}</p> : null}
      {loading && !data ? <Skeleton className="h-40 w-full" /> : null}
      {data ? (
        <div className="profile-members space-y-5">
          {canManage ? (
            <div className="member-invite rounded-app border border-line bg-surface-2/50 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-faint"><UserPlus size={13} /> {tr("Invite someone")}</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <select className="control member-friend" value={pick} onChange={(e) => { setPick(e.target.value); if (e.target.value) setEmail(""); }} aria-label={tr("A chat friend")}>
                  <option value="">{friends.data?.length ? tr("Pick a chat friend…") : tr("No chat friends to pick")}</option>
                  {(friends.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name} · {f.email}</option>)}
                </select>
                <label className="relative block">
                  <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
                  <input className="control member-email pl-9" type="email" placeholder={data.can_invite_new ? tr("…or any email address") : tr("…or the email of an account")} value={email} onChange={(e) => { setEmail(e.target.value); if (e.target.value) setPick(""); }} onKeyDown={(e) => e.key === "Enter" && invite()} />
                </label>
                <select className="control member-role w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label={tr("Role")}>
                  {roles.map((r) => <option key={r} value={r}>{tr(MEMBER_ROLE[r].label)}</option>)}
                </select>
                <Button icon={UserPlus} onClick={invite} loading={busy} disabled={!pick && !email.trim()} className="member-invite-btn">{tr("Invite")}</Button>
              </div>
              <p className="mt-2 text-[11px] text-fg-muted">{roles.map((r) => `${tr(MEMBER_ROLE[r].label)}: ${tr(MEMBER_ROLE[r].hint)}`).join(" · ")}</p>
            </div>
          ) : null}

          <ul className="member-list divide-y divide-line rounded-app border border-line">
            {data.members.map((m) => {
              const meta = MEMBER_ROLE[m.role] ?? MEMBER_ROLE.viewer;
              const editable = canManage && m.role !== "owner" && m.id !== user?.id && (myRole === "owner" || m.role !== "manager");
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar name={m.name} color={m.avatar_color} avatar={m.avatar} size="sm" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">{m.name}{m.id === user?.id ? <span className="text-xs font-normal text-fg-muted">({tr("you")})</span> : null}</p>
                    <p className="truncate text-xs text-fg-muted">{m.email}</p>
                  </div>
                  {m.status === "invited" ? <Badge tone="amber"><Clock size={10} className="mr-1 inline" />{tr("Invited")}</Badge> : null}
                  {editable ? (
                    <select className="control h-8 w-auto py-0 text-xs" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={tr("Role")}>
                      {roles.map((r) => <option key={r} value={r}>{tr(MEMBER_ROLE[r].label)}</option>)}
                    </select>
                  ) : (
                    <Badge tone={meta.tone}>{m.role === "owner" ? <Crown size={10} className="mr-1 inline" /> : null}{tr(meta.label)}</Badge>
                  )}
                  {editable ? <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={() => remove(m)} aria-label={tr("Remove")} data-tip={m.status === "invited" ? tr("Withdraw invitation") : tr("Remove")} /> : null}
                </li>
              );
            })}
          </ul>
          {data.pending?.length ? (
            <div className="member-pending">
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-faint"><Mail size={13} /> {tr("Invited by email, no account yet")}</p>
              <ul className="divide-y divide-line rounded-app border border-dashed border-line">
                {data.pending.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                    <Badge tone={MEMBER_ROLE[inv.role]?.tone ?? "slate"}>{tr(MEMBER_ROLE[inv.role]?.label ?? inv.role)}</Badge>
                    <span className="hidden text-xs text-fg-muted sm:inline">{tr("until {date}", { date: formatDate(inv.expires_at) })}</span>
                    <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={() => withdraw(inv)} aria-label={tr("Withdraw invitation")} data-tip={tr("Withdraw invitation")} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.members.length === 1 && !data.pending?.length ? <p className="flex items-center gap-2 text-xs text-fg-muted"><Users size={13} /> {tr("Only you can see this profile so far.")}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
