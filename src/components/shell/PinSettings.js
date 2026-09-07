"use client";
import { useState } from "react";
import { Lock, KeyRound, Trash2, ShieldCheck, Sun, Moon, Monitor } from "lucide-react";
import { usePrefs } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { hashPin, randomSalt, isValidPin, PIN_MIN, PIN_MAX } from "@/lib/pin";
import Button from "@/components/ui/Button";
import { Input, Select, Field, Toggle, Segmented } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { Kbd } from "@/components/ui/Misc";
import { useT } from "@/lib/i18n";

const AUTO_LOCK_OPTIONS = [
  [0, "Never"], [1, "After 1 minute"], [2, "After 2 minutes"], [5, "After 5 minutes"],
  [10, "After 10 minutes"], [15, "After 15 minutes"], [30, "After 30 minutes"], [60, "After 1 hour"],
];

/** Lock-screen settings: set / change / remove the PIN, enable the lock, auto-lock delay. */
export default function PinSettings() {
  const tr = useT();
  const pinHash = usePrefs((s) => s.pinHash);
  const pinSalt = usePrefs((s) => s.pinSalt);
  const pinLength = usePrefs((s) => s.pinLength);
  const lockEnabled = usePrefs((s) => s.lockEnabled);
  const autoLockMinutes = usePrefs((s) => s.autoLockMinutes);
  const lockTheme = usePrefs((s) => s.lockTheme);
  const setPrefs = usePrefs((s) => s.set);
  const setPin = usePrefs((s) => s.setPin);
  const clearPin = usePrefs((s) => s.clearPin);
  const lock = usePrefs((s) => s.lock);
  const toast = useToast();
  const { setUser } = useAuth();
  const syncServerPin = async (pin) => {
    try {
      const r = await api.put("/api/auth/pin", { pin });
      setUser((u) => (u ? { ...u, has_pin: r.has_pin } : u));
    } catch (e) {
      toast.error("PIN saved locally, but not on your account", e.message);
    }
  };

  const [mode, setMode] = useState(null); // null | "set" | "change" | "remove"
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const hasPin = Boolean(pinHash);
  const closeForm = () => {
    setMode(null);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const verifyCurrent = async () => (await hashPin(current, pinSalt)) === pinHash;

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode !== "set" && !(await verifyCurrent())) return setError("Current PIN is incorrect.");
      if (mode === "remove") {
        clearPin();
        await syncServerPin(null);
        toast.success("PIN removed", "Lock screen disabled");
        return closeForm();
      }
      if (!isValidPin(next)) return setError(`PIN must be ${PIN_MIN}–${PIN_MAX} digits.`);
      if (next !== confirm) return setError("PINs do not match.");
      const salt = randomSalt();
      setPin({ pinHash: await hashPin(next, salt), pinSalt: salt, pinLength: next.length });
      await syncServerPin(next);
      toast.success(mode === "set" ? "PIN set" : "PIN changed", "Lock screen enabled · also used to reveal secrets");
      closeForm();
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (value, onChange, placeholder, autoFocus) => (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={PIN_MAX}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="font-mono tracking-[0.3em]"
    />
  );

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between rounded-app border border-line bg-surface-2 px-3 py-2.5">
        <span className="flex items-center gap-2.5 text-sm">
          <span className={`grid h-8 w-8 place-items-center rounded-app-sm ${hasPin ? "bg-emerald-500/12 text-emerald-500" : "bg-surface-3 text-fg-muted"}`}>
            {hasPin ? <ShieldCheck size={16} /> : <KeyRound size={16} />}
          </span>
          <span>
            <span className="block font-medium">{hasPin ? `PIN set · ${pinLength} digits` : "No PIN set"}</span>
            <span className="block text-[11px] text-fg-muted">{hasPin ? "Used to unlock this browser" : "Create a PIN to enable the lock screen"}</span>
          </span>
        </span>
        {!mode ? (
          hasPin ? (
            <span className="flex gap-1">
              <Button size="xs" variant="outline" onClick={() => setMode("change")}>{tr("Change")}</Button>
              <Button size="xs" variant="dangerGhost" icon={Trash2} onClick={() => setMode("remove")} aria-label={tr("Remove PIN")} />
            </span>
          ) : (
            <Button size="xs" onClick={() => setMode("set")} icon={KeyRound}>{tr("Set PIN")}</Button>
          )
        ) : null}
      </div>

      {mode ? (
        <form onSubmit={save} className="space-y-3 rounded-app border border-accent/30 bg-accent/5 p-3 anim-pop">
          <p className="text-xs font-semibold">{mode === "set" ? "Create a PIN" : mode === "change" ? "Change PIN" : "Remove PIN"}</p>
          {mode !== "set" ? <Field label={tr("Current PIN")}>{pinInput(current, setCurrent, "••••", true)}</Field> : null}
          {mode !== "remove" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label={tr("New PIN")} hint={`${PIN_MIN}–${PIN_MAX} digits`}>{pinInput(next, setNext, "••••", mode === "set")}</Field>
              <Field label={tr("Confirm")}>{pinInput(confirm, setConfirm, "••••")}</Field>
            </div>
          ) : null}
          {error ? <p className="text-xs text-rose-500">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" type="button" onClick={closeForm} disabled={busy}>{tr("Cancel")}</Button>
            <Button size="sm" type="submit" variant={mode === "remove" ? "danger" : "primary"} loading={busy}>
              {mode === "remove" ? "Remove PIN" : "Save PIN"}
            </Button>
          </div>
        </form>
      ) : null}

      <Toggle
        checked={hasPin && lockEnabled}
        onChange={(v) => hasPin && setPrefs({ lockEnabled: v })}
        label={tr("Enable lock screen")}
        description={hasPin ? "Lock from the account menu, the bottom bar, or ⌘⇧L" : "Set a PIN first"}
        className={!hasPin ? "opacity-50" : ""}
      />
      <Field label={tr("Auto-lock after inactivity")} hint={tr("No mouse or keyboard activity for this long locks the screen")}>
        <Select value={autoLockMinutes} onChange={(e) => setPrefs({ autoLockMinutes: Number(e.target.value) })} disabled={!hasPin || !lockEnabled}>
          {AUTO_LOCK_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label={tr("Lock screen appearance")} hint={tr("Independent of the app theme")}>
        <Segmented
          value={lockTheme}
          onChange={(v) => setPrefs({ lockTheme: v })}
          options={[
            { value: "system", label: tr("Follow app"), icon: Monitor },
            { value: "light", label: tr("Light"), icon: Sun },
            { value: "dark", label: tr("Dark"), icon: Moon },
          ]}
          className="w-full"
        />
      </Field>
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" icon={Lock} onClick={lock} disabled={!hasPin || !lockEnabled}>{tr("Lock now")}</Button>
        <span className="flex items-center gap-1 text-[11px] text-fg-faint"><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>L</Kbd></span>
      </div>
      <p className="text-[11px] text-fg-faint">The PIN is stored as a salted hash in this browser (for the lock screen) and on your account (so it can confirm sensitive actions such as revealing a stored secret). Your login password always works as well.</p>
    </div>
  );
}
