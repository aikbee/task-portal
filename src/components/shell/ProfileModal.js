"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, UserRound, Fingerprint, Plus, Trash2, ShieldCheck, ShieldOff, Copy, RefreshCw } from "lucide-react";
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

      <p className="mt-3 text-[11px] text-fg-faint">
        <Link href="/security" onClick={onClose} className="text-accent hover:underline">{tr("Active sessions and login history")}</Link> {tr("are on the Security page.")}
      </p>

      <Divider className="my-5" label={tr("Two-factor authentication")} />
      <TwoFactorSection tr={tr} toast={toast} setUser={setUser} />

      <Divider className="my-5" label={tr("Passkeys")} />
      <PasskeysSection tr={tr} toast={toast} />

      <Divider className="my-5" label={tr("Google account")} />
      <GoogleSection tr={tr} toast={toast} user={user} setUser={setUser} />
    </Modal>
  );
}

/** Authenticator-app (TOTP) second factor: set up with a QR code, recovery codes, trusted browsers, turn off. */
function TwoFactorSection({ tr, toast, setUser }) {
  const [status, setStatus] = useState(null);
  const [stage, setStage] = useState("idle"); // idle | setup | codes | regen | disable
  const [setup, setSetup] = useState(null); // { secret, otpauth, qr }
  const [codes, setCodes] = useState(null); // freshly issued recovery codes (shown once)
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.get("/api/auth/totp").then(setStatus).catch(() => setStatus({ enabled: false, recovery_codes_left: 0, trusted_devices: 0 }));
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const begin = () =>
    run(async () => {
      setSetup(await api.post("/api/auth/totp/setup"));
      setCode("");
      setStage("setup");
    });
  const enable = (e) => {
    e.preventDefault();
    return run(async () => {
      const r = await api.post("/api/auth/totp/enable", { code });
      setCodes(r.recovery_codes);
      setStatus(r);
      setStage("codes");
      setCode("");
      setUser((u) => ({ ...u, has_totp: true }));
      toast.success(tr("Two-factor authentication is on"), tr("Save your recovery codes now."));
    });
  };
  const regen = (e) => {
    e.preventDefault();
    return run(async () => {
      const r = await api.post("/api/auth/totp/recovery-codes", { password });
      setCodes(r.recovery_codes);
      setStatus(r);
      setPassword("");
      setStage("codes");
    });
  };
  const disable = (e) => {
    e.preventDefault();
    return run(async () => {
      setStatus(await api.post("/api/auth/totp/disable", { password, code }));
      setPassword("");
      setCode("");
      setStage("idle");
      setUser((u) => ({ ...u, has_totp: false }));
      toast.success(tr("Two-factor authentication is off"));
    });
  };
  const forget = () =>
    run(async () => {
      setStatus(await api.del("/api/auth/totp/trusted"));
      toast.success(tr("Trusted browsers forgotten"));
    });
  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(tr("Copied"));
    } catch {
      toast.error(tr("Could not copy"));
    }
  };
  const cancel = () => { setStage("idle"); setCode(""); setPassword(""); setErr(null); };
  const codeInput = (
    <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" required className="text-center tracking-[0.3em] tabular-nums" />
  );

  if (status === null) return <p className="text-xs text-fg-faint">{tr("Loading…")}</p>;

  if (stage === "setup" && setup) {
    return (
      <form onSubmit={enable} className="space-y-3">
        <p className="text-xs text-fg-muted">{tr("Scan this QR code with Google Authenticator, Authy, 1Password or any authenticator app, then enter the 6-digit code it shows.")}</p>
        <div className="flex flex-col items-center gap-3 rounded-app border border-line bg-white p-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for the authenticator app" width={160} height={160} className="shrink-0 rounded" />
          <div className="min-w-0 flex-1 text-xs text-slate-600">
            <p className="font-medium text-slate-800">{tr("Can't scan? Enter this key by hand:")}</p>
            <p className="mt-1 break-all font-mono text-[11px] tracking-wider text-slate-800">{setup.secret.match(/.{1,4}/g).join(" ")}</p>
            <p className="mt-2">{tr("Time-based, 6 digits, 30 seconds.")}</p>
          </div>
        </div>
        <Field label={tr("Code from the app")}>{codeInput}</Field>
        {err ? <p className="text-xs text-rose-500">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>{tr("Cancel")}</Button>
          <Button type="submit" icon={ShieldCheck} loading={busy}>{tr("Turn on")}</Button>
        </div>
      </form>
    );
  }

  if (stage === "codes" && codes) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">{tr("Recovery codes let you sign in if you lose your phone. Each one works once. Store them somewhere safe — they are not shown again.")}</p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-app border border-line bg-surface-2 p-3 font-mono text-sm tabular-nums">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" icon={Copy} onClick={copyCodes}>{tr("Copy")}</Button>
          <Button type="button" onClick={() => { setCodes(null); setStage("idle"); }}>{tr("I saved them")}</Button>
        </div>
      </div>
    );
  }

  if (stage === "regen" || stage === "disable") {
    const off = stage === "disable";
    return (
      <form onSubmit={off ? disable : regen} className="space-y-3">
        <p className="text-xs text-fg-muted">{tr(off ? "Confirm with your password and a current code (or a recovery code) to turn two-factor authentication off." : "Confirm with your password to get new recovery codes. The old ones stop working.")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Password")}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {off ? <Field label={tr("Code")}>{codeInput}</Field> : null}
        </div>
        {err ? <p className="text-xs text-rose-500">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>{tr("Cancel")}</Button>
          <Button type="submit" variant={off ? "danger" : "secondary"} icon={off ? ShieldOff : RefreshCw} loading={busy}>{tr(off ? "Turn off" : "New recovery codes")}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-app border border-line bg-surface-2 p-3">
        {status.enabled ? <ShieldCheck size={18} className="shrink-0 text-emerald-500" /> : <ShieldOff size={18} className="shrink-0 text-fg-faint" />}
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">{status.enabled ? tr("On") : tr("Off")}</span>
          <span className="block text-[11px] text-fg-muted">
            {status.enabled
              ? tr("{n} recovery codes left · {d} trusted browsers", { n: status.recovery_codes_left, d: status.trusted_devices })
              : tr("Ask for a code from an authenticator app whenever you sign in with your password.")}
          </span>
        </span>
        {status.enabled ? (
          <Button size="sm" variant="secondary" icon={ShieldOff} onClick={() => setStage("disable")}>{tr("Turn off")}</Button>
        ) : (
          <Button size="sm" icon={ShieldCheck} loading={busy} onClick={begin}>{tr("Set up")}</Button>
        )}
      </div>
      {status.enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" icon={RefreshCw} onClick={() => setStage("regen")}>{tr("New recovery codes")}</Button>
          {status.trusted_devices > 0 ? <Button size="xs" variant="outline" loading={busy} onClick={forget}>{tr("Forget trusted browsers")}</Button> : null}
        </div>
      ) : null}
      {err ? <p className="text-xs text-rose-500">{err}</p> : null}
    </div>
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
