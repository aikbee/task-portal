"use client";
import { useCallback, useState } from "react";
import { Plus, KeyRound, Briefcase, Fingerprint, Unlink, ShieldCheck, ShieldOff, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge, { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/Misc";
import GoogleMark from "@/components/ui/GoogleMark";
import UserForm from "./UserForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, PersonCell } from "./shared";
import { USER_ROLES, USER_STATUS, MODULE_MAP } from "@/lib/modules";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function UsersList() {
  const tr = useT();
  const toast = useToast();
  const { user: me, isAdmin } = useAuth();
  const [role, setRole] = useState("");
  const { rows, loading, error, refetch, removeLocal } = useCrudList(isAdmin ? "/api/users" : null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/users", openNew, { workspace: false });
  useNewShortcut(openNew, { workspace: false });
  const del = useDeleteFlow("/api/users", { toast, label: "user", onDeleted: removeLocal });
  // admin recovery actions: drop every passkey of an account or disconnect Google
  const [methodTarget, setMethodTarget] = useState(null); // { user, kind: "passkeys" | "google" | "totp" | "sessions" }
  const [methodBusy, setMethodBusy] = useState(false);
  const runMethodAction = async () => {
    if (!methodTarget) return;
    setMethodBusy(true);
    try {
      await api.del(`/api/users/${methodTarget.user.id}/${methodTarget.kind}`);
      toast.success(methodTarget.kind === "google" ? tr("Google unlinked") : methodTarget.kind === "totp" ? tr("Two-factor authentication reset") : methodTarget.kind === "sessions" ? tr("Signed out everywhere") : tr("Passkeys removed"), methodTarget.user.name);
      setMethodTarget(null);
      refetch();
    } catch (e) {
      toast.error(tr("Could not update sign-in methods"), e.message);
    } finally {
      setMethodBusy(false);
    }
  };
  const mod = MODULE_MAP.users;

  if (!isAdmin) {
    return <EmptyState icon={KeyRound} title="Admins only" description="User management is available to administrators." />;
  }

  const filtered = role ? rows.filter((r) => r.role === role) : rows;
  const columns = [
    { key: "name", label: tr("User"), hideable: false, render: (r) => <PersonCell name={r.name} color={r.avatar_color} avatar={r.avatar} sub={r.email} link={false} size="md" /> },
    { key: "role", label: tr("Role"), render: (r) => <span className="inline-flex items-center gap-1.5"><StatusBadge map={USER_ROLES} value={r.role} dot={false} />{r.id === me?.id ? <Badge tone="accent">you</Badge> : null}</span> },
    { key: "status", label: tr("Status"), render: (r) => <StatusBadge map={USER_STATUS} value={r.status} /> },
    { key: "employee_name", label: tr("Linked employee"), render: (r) => r.employee_name ? <PersonCell id={r.employee_id} name={r.employee_name} color={r.employee_color} /> : <span className="text-fg-faint">—</span> },
    {
      key: "workspace", label: tr("Workspace"), sortValue: (r) => r.project_count + r.employee_count + r.task_count,
      render: (r) => (
        <span className="inline-flex items-center gap-3 text-xs text-fg-muted">
          <span><b className="text-fg">{r.project_count}</b> projects</span>
          <span><b className="text-fg">{r.employee_count}</b> employees</span>
          <span><b className="text-fg">{r.task_count}</b> tasks</span>
        </span>
      ),
    },
    {
      key: "signin", label: tr("Sign-in"), sortValue: (r) => (r.has_totp ? 4 : 0) + (r.passkey_count > 0 ? 2 : 0) + (r.has_google ? 1 : 0),
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {r.passkey_count > 0 ? (
            <Badge tone="emerald" className="inline-flex items-center gap-1"><Fingerprint size={11} /> {r.passkey_count === 1 ? tr("1 passkey") : tr("{n} passkeys", { n: r.passkey_count })}</Badge>
          ) : null}
          {r.has_google ? <Badge tone="sky" className="inline-flex items-center gap-1"><GoogleMark size={10} /> Google</Badge> : null}
          {r.has_totp ? <Badge tone="violet" className="inline-flex items-center gap-1"><ShieldCheck size={11} /> 2FA</Badge> : null}
          {!r.passkey_count && !r.has_google && !r.has_totp ? <span className="text-xs text-fg-faint">{tr("Password only")}</span> : null}
        </span>
      ),
    },
    { key: "active_sessions", label: tr("Sessions"), align: "center", render: (r) => <span className="tabular-nums">{r.active_sessions}</span> },
    { key: "last_login_at", label: tr("Last login"), render: (r) => r.last_login_at ? <span title={formatDateTime(r.last_login_at)}>{relativeTime(r.last_login_at)}</span> : <span className="text-fg-faint">never</span> },
    { key: "created_at", label: tr("Created"), render: (r) => formatDate(r.created_at) },
    { key: "email", label: tr("Email"), defaultHidden: true },
  ];

  return (
    <>
      <PageHeader title={tr("Users")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button icon={Plus} onClick={openNew}>{tr("New user")}</Button>} />
      <DataTable
        workspace={false}
        id="users"
        columns={columns}
        rows={filtered}
        loading={loading}
        error={error}
        defaultSort={{ key: "name", dir: "asc" }}
        searchPlaceholder={tr("Search users…")}
        dateFields={[
          { key: "last_login_at", label: tr("Last login") },
          { key: "created_at", label: tr("Created") },
        ]}
        onRowClick={(r) => { setEditing(r); setFormOpen(true); }}
        rowActions={(r) => (
          <>
            {r.id !== me?.id ? (
              <Button
                variant="ghost"
                size="iconXs"
                icon={Briefcase}
                aria-label="Open workspace"
                data-tip="Open their workspace"
                onClick={async () => {
                  try {
                    await api.put("/api/auth/workspace", { user_id: r.id });
                    window.location.assign(new URL("/", window.location.origin).toString());
                  } catch (e) {
                    toast.error("Could not switch workspace", e.message);
                  }
                }}
              />
            ) : null}
            {r.passkey_count > 0 ? (
              <Button variant="ghost" size="iconXs" icon={Fingerprint} aria-label={tr("Remove passkeys")} data-tip={tr("Remove passkeys")} onClick={() => setMethodTarget({ user: r, kind: "passkeys" })} />
            ) : null}
            {r.has_google ? (
              <Button variant="ghost" size="iconXs" icon={Unlink} aria-label={tr("Unlink Google")} data-tip={tr("Unlink Google")} onClick={() => setMethodTarget({ user: r, kind: "google" })} />
            ) : null}
            {r.has_totp && r.id !== me?.id ? (
              <Button variant="ghost" size="iconXs" icon={ShieldOff} aria-label={tr("Reset 2FA")} data-tip={tr("Reset 2FA")} onClick={() => setMethodTarget({ user: r, kind: "totp" })} />
            ) : null}
            {r.active_sessions > 0 && r.id !== me?.id ? (
              <Button variant="ghost" size="iconXs" icon={LogOut} aria-label={tr("Sign out everywhere")} data-tip={tr("Sign out everywhere")} onClick={() => setMethodTarget({ user: r, kind: "sessions" })} />
            ) : null}
            <RowActions workspace={false} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={r.id === me?.id ? undefined : () => del.setTarget(r)} />
          </>
        )}
        filters={
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-36">
            <option value="">{tr("All roles")}</option>
            {Object.entries(USER_ROLES).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        }
        emptyTitle="No users"
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New user")}</Button>}
      />
      <UserForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!methodTarget}
        onClose={() => setMethodTarget(null)}
        onConfirm={runMethodAction}
        loading={methodBusy}
        title={methodTarget?.kind === "google" ? tr("Unlink Google?") : methodTarget?.kind === "totp" ? tr("Reset two-factor authentication?") : methodTarget?.kind === "sessions" ? tr("Sign out everywhere?") : tr("Remove passkeys?")}
        confirmText={methodTarget?.kind === "google" ? tr("Unlink") : methodTarget?.kind === "totp" ? tr("Reset") : methodTarget?.kind === "sessions" ? tr("Sign out") : tr("Remove")}
        description={
          !methodTarget
            ? ""
            : methodTarget.kind === "google"
              ? tr("{name} will no longer be able to sign in with Google until they connect it again. Their password keeps working.", { name: methodTarget.user.name })
              : methodTarget.kind === "totp"
                ? tr("{name} will sign in with their password alone until they set up an authenticator app again. Use this when they lost their phone and their recovery codes.", { name: methodTarget.user.name })
                : methodTarget.kind === "sessions"
                  ? tr("{name} is signed out of all {n} devices and browsers immediately. They can sign in again right away.", { name: methodTarget.user.name, n: methodTarget.user.active_sessions })
              : tr("All passkeys of {name} ({n}) are removed. Their password keeps working, and they can add a new passkey from their profile.", { name: methodTarget.user.name, n: methodTarget.user.passkey_count })
        }
      />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={tr("Delete user?")}
        description={del.target ? `${del.target.name} (${del.target.email}) will lose access immediately, and their whole workspace is deleted: ${del.target.project_count} projects, ${del.target.employee_count} employees, ${del.target.task_count} tasks and their notes.` : ""}
      />
    </>
  );
}
