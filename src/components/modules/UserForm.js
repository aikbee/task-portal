"use client";
import { useState } from "react";
import { ShieldCheck, User as UserIcon } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Select, Field, Segmented } from "@/components/ui/Controls";
import ColorPicker from "@/components/ui/ColorPicker";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES, USER_STATUS, PALETTE } from "@/lib/modules";
import { PASSWORD_MIN } from "@/lib/password";
import { fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const empty = { name: "", email: "", role: "user", status: "active", avatar_color: PALETTE[0], employee_id: "", password: "", confirm: "" };

function fromInitial(initial) {
  if (!initial) return { ...empty, avatar_color: PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  return {
    name: initial.name ?? "",
    email: initial.email ?? "",
    role: initial.role ?? "user",
    status: initial.status ?? "active",
    avatar_color: initial.avatar_color ?? PALETTE[0],
    employee_id: initial.employee_id ?? "",
    password: "",
    confirm: "",
  };
}

export default function UserForm({ open, onClose, initial = null, onSaved }) {
  if (!open) return null;
  return <UserFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} onSaved={onSaved} />;
}

function UserFormInner({ onClose, initial, onSaved }) {
  const tr = useT();
  const { user: me, setUser } = useAuth();
  const [form, setForm] = useState(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: employees } = useFetch("/api/employees");
  const isSelf = initial && me && initial.id === me.id;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!initial && form.password.length < PASSWORD_MIN) return setError(`Password must be at least ${PASSWORD_MIN} characters.`);
    if (form.password && form.password !== form.confirm) return setError("Passwords do not match.");
    setSaving(true);
    try {
      const payload = { name: form.name, email: form.email, role: form.role, status: form.status, avatar_color: form.avatar_color, employee_id: form.employee_id || null };
      if (form.password) payload.password = form.password;
      const saved = initial ? await api.put(`/api/users/${initial.id}`, payload) : await api.post("/api/users", payload);
      if (isSelf) setUser((u) => ({ ...u, name: saved.name, avatar_color: saved.avatar_color, email: saved.email }));
      toast.success(initial ? "User updated" : "User created", saved.email);
      onSaved?.(saved, !initial);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit user" : "New user"}
      description={initial ? `Editing ${initial.email}` : "Create a login account and choose its role."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="user-form" loading={saving}>{initial ? "Save changes" : "Create user"}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6 flex items-center gap-4 rounded-app border border-line bg-surface-2 p-3">
          <Avatar name={form.name || "New user"} color={form.avatar_color} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{form.name || "New user"}</p>
            <p className="truncate text-xs text-fg-muted">{form.email || "email@company.com"}</p>
            <ColorPicker value={form.avatar_color} onChange={(c) => set("avatar_color", c)} className="mt-2" />
          </div>
        </div>
        <Field label={tr("Name")} required className="sm:col-span-3">
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label={tr("Email")} required className="sm:col-span-3">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="name@company.com" />
        </Field>
        <Field label={tr("Role")} className="sm:col-span-3" hint={isSelf ? "You cannot change your own role" : USER_ROLES[form.role]?.description}>
          <Segmented
            value={form.role}
            onChange={(v) => !isSelf && set("role", v)}
            options={[
              { value: "admin", label: tr("Admin"), icon: ShieldCheck },
              { value: "user", label: tr("User"), icon: UserIcon },
            ]}
            className={isSelf ? "w-full opacity-60 pointer-events-none" : "w-full"}
          />
        </Field>
        <Field label={tr("Status")} className="sm:col-span-3" hint={isSelf ? "You cannot disable yourself" : undefined}>
          <Select value={form.status} onChange={(e) => set("status", e.target.value)} disabled={isSelf}>
            {Object.entries(USER_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Linked employee")} className="sm:col-span-6" hint="Optional: connect this login to an employee record">
          <Select value={form.employee_id ?? ""} onChange={(e) => set("employee_id", e.target.value)}>
            <option value="">Not linked</option>
            {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} — {e.job_title}</option>)}
          </Select>
        </Field>
        <Field label={initial ? "New password" : "Password"} required={!initial} className="sm:col-span-3" hint={initial ? "Leave empty to keep the current password" : `At least ${PASSWORD_MIN} characters`}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} required={!initial} />
        </Field>
        <Field label="Confirm password" required={!initial} className="sm:col-span-3">
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} required={!initial || !!form.password} />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
