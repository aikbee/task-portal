"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Delete, Unlock, LogOut } from "lucide-react";
import Logo from "@/components/ui/Logo";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import { usePrefs } from "@/lib/store";
import { hashPin } from "@/lib/pin";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

/**
 * Full-screen PIN lock. Renders when the persisted `locked` flag is set and a
 * PIN exists; also runs the inactivity auto-lock timer.
 */
export default function LockScreen() {
  const mounted = useMounted();
  const locked = usePrefs((s) => s.locked);
  const pinHash = usePrefs((s) => s.pinHash);
  const pinSalt = usePrefs((s) => s.pinSalt);
  const pinLength = usePrefs((s) => s.pinLength);
  const unlock = usePrefs((s) => s.unlock);
  const active = mounted && locked && Boolean(pinHash);

  useAutoLock();

  // <html data-locked> hides the shell via CSS (the boot script sets it before hydration to avoid a flash)
  useEffect(() => {
    document.documentElement.dataset.locked = active ? "true" : "false";
  }, [active]);

  if (!active) return null;
  return createPortal(<LockOverlay pinHash={pinHash} pinSalt={pinSalt} pinLength={pinLength} onUnlock={unlock} />, document.body);
}

const ACTIVITY_KEY = "admin-portal-last-activity";

/**
 * Locks the workspace after `autoLockMinutes` without pointer/keyboard activity
 * in ANY open tab of the app. Activity is shared through localStorage so an
 * idle background tab never locks while you are working in another one.
 */
function useAutoLock() {
  const lockEnabled = usePrefs((s) => s.lockEnabled);
  const minutes = usePrefs((s) => s.autoLockMinutes);
  const pinHash = usePrefs((s) => s.pinHash);
  const locked = usePrefs((s) => s.locked);
  const lock = usePrefs((s) => s.lock);

  useEffect(() => {
    if (!lockEnabled || !pinHash || !minutes || locked) return;
    let last = Date.now();
    let lastShared = 0;
    const share = () => {
      const now = Date.now();
      if (now - lastShared < 2000) return; // throttle writes
      lastShared = now;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now));
      } catch {}
    };
    const bump = () => {
      last = Date.now();
      share();
    };
    const sharedLast = () => {
      try {
        return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
      } catch {
        return 0;
      }
    };
    const check = () => {
      const idleFor = Date.now() - Math.max(last, sharedLast());
      if (idleFor >= minutes * 60_000) lock();
    };
    bump(); // opening or returning to this tab counts as activity
    const events = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const onVisibility = () => document.visibilityState === "visible" && check();
    const onMessage = (e) => e.origin === window.location.origin && e.data?.type === "task-portal:activity" && bump();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("message", onMessage);
    const t = setInterval(check, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("message", onMessage);
      clearInterval(t);
    };
  }, [lockEnabled, minutes, pinHash, locked, lock]);
}

function LockOverlay({ pinHash, pinSalt, pinLength, onUnlock }) {
  const tr = useT();
  const { user, logout, setUser } = useAuth();
  const lockTheme = usePrefs((s) => s.lockTheme);
  const [signingOut, setSigningOut] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [shake, setShake] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);

  const coolingDown = cooldownUntil > now;
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  // clock + cooldown ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (value) => {
    if (checking || coolingDown || !value.length) return;
    setChecking(true);
    try {
      const ok = (await hashPin(value, pinSalt)) === pinHash;
      if (ok) {
        setPin("");
        setError(null);
        onUnlock();
        if (user && !user.has_pin) {
          // keep a hashed copy on the account so the PIN can confirm sensitive actions too
          api.put("/api/auth/pin", { pin: value }).then((r) => setUser((u) => (u ? { ...u, has_pin: r.has_pin } : u))).catch(() => {});
        }
        return;
      }
      const n = attempts + 1;
      setAttempts(n);
      setPin("");
      setShake((s) => s + 1);
      if (n >= MAX_ATTEMPTS) {
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        setAttempts(0);
        setError("Too many attempts.");
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - n} attempt${MAX_ATTEMPTS - n === 1 ? "" : "s"} left.`);
      }
    } finally {
      setChecking(false);
    }
  };

  const press = (digit) => {
    if (coolingDown || checking) return;
    setError(null);
    setPin((p) => {
      if (p.length >= pinLength) return p;
      const next = p + digit;
      if (next.length === pinLength) submit(next);
      return next;
    });
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  // physical keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit(pin);
      } else if (e.key === "Escape") {
        setPin("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pinLength, coolingDown, checking, attempts]);

  const date = new Date(now);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"];

  return (
    <div
      data-lock-screen
      data-theme={lockTheme === "system" ? undefined : lockTheme}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-bg/90 p-4 text-fg backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Screen locked"
    >
      <div className="mb-8 text-center anim-rise">
        <p className="text-5xl font-semibold tracking-tight tabular-nums">{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
        <p className="mt-1 text-sm text-fg-muted">{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <div className="glass w-[340px] max-w-full rounded-app-lg p-7 text-center shadow-app-lg anim-pop">
        <span className="relative mx-auto block h-16 w-16">
          {user ? (
            <Avatar name={user.name} color={user.avatar_color} size="xl" className="h-16 w-16 text-xl" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-strong text-white"><Lock size={26} /></span>
          )}
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-surface text-accent shadow-app ring-2 ring-surface">
            <Lock size={13} />
          </span>
        </span>
        <h1 className="mt-4 text-lg font-semibold">{user ? user.name : tr("Workspace locked")}</h1>
        <p className="text-xs text-fg-muted">{tr("Enter your {n}-digit PIN to continue", { n: pinLength })}</p>

        {/* PIN dots */}
        <div key={shake} className={cn("mt-5 flex justify-center gap-2.5", shake > 0 && "anim-shake")} aria-label="PIN entry">
          {Array.from({ length: pinLength }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full border transition-all duration-150",
                i < pin.length ? "scale-110 border-accent bg-accent shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_20%,transparent)]" : "border-line-strong bg-surface-2"
              )}
            />
          ))}
        </div>
        <p className={cn("mt-3 h-4 text-xs", error ? "text-rose-500" : "text-fg-faint")}>
          {coolingDown ? `Too many attempts. Try again in ${secondsLeft}s.` : error || (checking ? "Checking…" : " ")}
        </p>

        {/* keypad */}
        <div className="mx-auto mt-3 grid w-[228px] grid-cols-3 gap-2">
          {keys.map((k) => {
            if (k === "back") {
              return (
                <button key={k} onClick={backspace} disabled={!pin.length || coolingDown} className="grid h-14 place-items-center rounded-app text-fg-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Delete last digit">
                  <Delete size={18} />
                </button>
              );
            }
            if (k === "go") {
              return (
                <button key={k} onClick={() => submit(pin)} disabled={!pin.length || coolingDown || checking} className="grid h-14 place-items-center rounded-app bg-accent text-white shadow-[0_8px_18px_-8px_var(--accent)] transition hover:bg-accent-strong disabled:opacity-40" aria-label="Unlock">
                  <Unlock size={18} />
                </button>
              );
            }
            return (
              <button
                key={k}
                onClick={() => press(k)}
                disabled={coolingDown || pin.length >= pinLength}
                className="h-14 rounded-app border border-line bg-surface/70 text-lg font-medium tabular-nums transition hover:bg-surface-2 active:scale-95 disabled:opacity-40"
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 anim-fade">
        <button
          onClick={async () => {
            setSigningOut(true);
            await logout();
          }}
          disabled={signingOut}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-2 text-xs font-medium text-fg-muted transition hover:border-rose-500/40 hover:text-rose-500 disabled:opacity-60"
        >
          <LogOut size={13} /> {signingOut ? tr("Signing out…") : user ? tr("Not {name}? Sign out", { name: user.name.split(" ")[0] }) : tr("Sign out")}
        </button>
        <p className="flex items-center gap-2 text-xs text-fg-faint">
          <Logo size={14} className="rounded-[3px]" /> Task Portal · type the PIN or use the keypad
        </p>
      </div>
    </div>
  );
}
