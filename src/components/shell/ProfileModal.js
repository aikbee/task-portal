"use client";
import { useEffect, useState } from "react";
import { KeyRound, UserRound, Fingerprint, Plus, Trash2 } from "lucide-react";
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
import GoogleMark from "@/components/ui/GoogleMark";
import { useMounted } from "@/lib/hooks";
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

      <Divider className="my-5" label={tr("Passkeys")} />
      <PasskeysSection tr={tr} toast={toast} />

      <Divider className="my-5" label={tr("Google account")} />
      <GoogleSection tr={tr} toast={toast} user={user} setUser={setUser} />
    </Modal>
  );
}

/** Register, rename-free list and removal of WebAuthn passkeys for the signed-in user. */
function PasskeysSection({ tr, toast }) {
  const mounted = useMounted();
  const supported = mounted && typeof window !== "undefined" && Boolean(window.PublicKeyCredential);
  const [list, setList] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  useEffect(() => {
    api.get("/api/auth/passkeys").then(setList).catch(() => setList([]));
  }, []);

  const add = async () => {
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await api.post("/api/auth/passkeys/register/options");
      const response = await startRegistration({ optionsJSON: options });
      setList(await api.post("/api/auth/passkeys/register/verify", { response, name }));
      setName("");
      toast.success(tr("Passkey added"), tr("You can now sign in with it."));
    } catch (err) {
      if (err?.name !== "NotAllowedError") toast.error(tr("Could not add passkey"), err?.name === "InvalidStateError" ? tr("This device already has a passkey for your account.") : err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    try {
      setList(await api.del(`/api/auth/passkeys/${encodeURIComponent(id)}`));
      setPendingId(null);
      toast.success(tr("Passkey removed"));
    } catch (err) {
      toast.error(tr("Could not remove passkey"), err.message);
    }
  };
  const when = (d) => new Date(d).toLocaleDateString();

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">{tr("Sign in with Touch ID, Face ID, Windows Hello or a security key instead of your password.")}</p>
      {list === null ? (
        <p className="text-xs text-fg-faint">{tr("Loading…")}</p>
      ) : list.length === 0 ? (
        <p className="rounded-app border border-dashed border-line p-3 text-xs text-fg-muted">{tr("No passkeys yet.")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-app border border-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Fingerprint size={16} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-[11px] text-fg-muted">
                  {tr("Added {date}", { date: when(p.created_at) })}
                  {p.last_used_at ? ` · ${tr("last used {date}", { date: when(p.last_used_at) })}` : ""}
                  {p.backed_up ? ` · ${tr("synced")}` : ""}
                </span>
              </span>
              {pendingId === p.id ? (
                <span className="flex items-center gap-1">
                  <Button size="xs" variant="danger" onClick={() => remove(p.id)}>{tr("Remove")}</Button>
                  <Button size="xs" variant="ghost" onClick={() => setPendingId(null)}>{tr("Cancel")}</Button>
                </span>
              ) : (
                <Button size="iconXs" variant="ghost" icon={Trash2} onClick={() => setPendingId(p.id)} aria-label={tr("Remove")} />
              )}
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Name (optional), e.g. MacBook Touch ID")} className="flex-1" />
          <Button type="button" variant="secondary" icon={Plus} loading={busy} onClick={add}>{tr("Add a passkey")}</Button>
        </div>
      ) : mounted ? (
        <p className="text-xs text-fg-faint">{tr("This browser does not support passkeys.")}</p>
      ) : null}
    </div>
  );
}

/** Connect or disconnect "Continue with Google" for the signed-in user. */
function GoogleSection({ tr, toast, user, setUser }) {
  const [methods, setMethods] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/api/auth/methods").then(setMethods).catch(() => setMethods({ google: false }));
  }, []);
  if (methods === null) return <p className="text-xs text-fg-faint">{tr("Loading…")}</p>;
  if (!methods.google) return <p className="text-xs text-fg-muted">{tr("Sign in with Google is not set up on this server.")}</p>;

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.del("/api/auth/google");
      setUser((u) => ({ ...u, has_google: false }));
      toast.success(tr("Google account disconnected"));
    } catch (err) {
      toast.error(tr("Could not disconnect"), err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-app border border-line bg-surface-2 p-3">
      <GoogleMark size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-medium">{user?.has_google ? tr("Connected") : tr("Not connected")}</span>
        <span className="block text-[11px] text-fg-muted">{user?.has_google ? tr("You can sign in with Google.") : tr("Connect a Google account to sign in with one click.")}</span>
      </span>
      {user?.has_google ? (
        <Button size="sm" variant="secondary" loading={busy} onClick={disconnect}>{tr("Disconnect")}</Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => window.location.assign(new URL("/api/auth/google?link=1", window.location.origin).href)}>{tr("Connect")}</Button>
      )}
    </div>
  );
}
