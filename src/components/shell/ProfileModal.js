"use client";
import { useState } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES } from "@/lib/modules";
import { PASSWORD_MIN } from "@/lib/password";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Input, Field } from "@/components/ui/Controls";
import ColorPicker from "@/components/ui/ColorPicker";
import { Divider } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** Edit your own name / avatar colour and change your password. */
export default function ProfileModal({ open, onClose }) {
  if (!open) return null;
  return <ProfileModalInner onClose={onClose} />;
}

function ProfileModalInner({ onClose }) {
  const tr = useT();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [color, setColor] = useState(user?.avatar_color ?? "#6366f1");
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await api.put("/api/auth/profile", { name, avatar_color: color });
      setUser((u) => ({ ...u, ...saved }));
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Could not update profile", err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (next.length < PASSWORD_MIN) return setPwError(`New password must be at least ${PASSWORD_MIN} characters.`);
    if (next !== confirm) return setPwError("New passwords do not match.");
    setPwBusy(true);
    try {
      await api.put("/api/auth/password", { current_password: current, new_password: next });
      toast.success("Password changed", "Other sessions were signed out");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Your profile" description={user?.email} size="md">
      <form onSubmit={saveProfile} className="space-y-4">
        <div className="flex items-center gap-4 rounded-app border border-line bg-surface-2 p-3">
          <Avatar name={name || user?.name} color={color} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name || user?.name}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
              <StatusBadge map={USER_ROLES} value={user?.role} dot={false} />
              {user?.email}
            </div>
            <ColorPicker value={color} onChange={setColor} className="mt-2" />
          </div>
        </div>
        <Field label="Display name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" icon={UserRound} loading={saving}>Save profile</Button>
        </div>
      </form>

      <Divider className="my-5" label={tr("Password")} />

      <form onSubmit={changePassword} className="space-y-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="New password" hint={`At least ${PASSWORD_MIN} characters`}>
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label={tr("Confirm")}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
        </div>
        {pwError ? <p className="text-xs text-rose-500">{pwError}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon={KeyRound} loading={pwBusy}>Change password</Button>
        </div>
      </form>
    </Modal>
  );
}
