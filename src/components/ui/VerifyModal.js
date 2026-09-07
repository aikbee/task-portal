"use client";
import { useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { Input, Field, Segmented } from "./Controls";
import { useT } from "@/lib/i18n";

/**
 * Asks for the lock-screen PIN or the login password before a sensitive action.
 * `onVerify({ pin } | { password })` must resolve when accepted or throw with a message.
 */
export default function VerifyModal({ open, onClose, onVerify, allowPin = true, title = "Verify it's you", description = "Confirm with your PIN or password to continue." }) {
  if (!open) return null;
  return <VerifyInner onClose={onClose} onVerify={onVerify} allowPin={allowPin} title={title} description={description} />;
}

function VerifyInner({ onClose, onVerify, allowPin, title, description }) {
  const tr = useT();
  const [mode, setMode] = useState(allowPin ? "pin" : "password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(mode === "pin" ? { pin: value } : { password: value });
      onClose();
    } catch (err) {
      setError(err.message || "Verification failed");
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent"><ShieldCheck size={20} /></span>
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{description}</p>
          </div>
        </div>
        {allowPin ? (
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setValue(""); setError(null); }}
            options={[
              { value: "pin", label: "Lock-screen PIN", icon: KeyRound },
              { value: "password", label: tr("Password"), icon: LockKeyhole },
            ]}
            className="w-full"
          />
        ) : null}
        <Field label={mode === "pin" ? "PIN" : "Login password"}>
          <Input
            autoFocus
            type="password"
            inputMode={mode === "pin" ? "numeric" : undefined}
            autoComplete={mode === "pin" ? "off" : "current-password"}
            value={value}
            onChange={(e) => setValue(mode === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value)}
            placeholder={mode === "pin" ? "••••" : "••••••••"}
            className={mode === "pin" ? "font-mono tracking-[0.3em]" : ""}
          />
        </Field>
        {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{tr("Cancel")}</Button>
          <Button type="submit" loading={busy} disabled={!value}>Verify</Button>
        </div>
        <p className="text-[11px] text-fg-faint">Verified for 10 minutes on this session. Five wrong attempts pause verification for a minute.</p>
      </form>
    </Modal>
  );
}
