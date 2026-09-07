"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, LockKeyhole, Eye, EyeOff, LogIn, ShieldCheck, User } from "lucide-react";
import { api } from "@/lib/api";
import { usePrefs } from "@/lib/store";
import { cn } from "@/lib/utils";
import ThemeApplier from "@/components/shell/ThemeApplier";
import AnimatedBackground from "@/components/shell/AnimatedBackground";
import { ToastProvider } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Input, Field, Checkbox } from "@/components/ui/Controls";
import Logo from "@/components/ui/Logo";
import {LOCALES, switchLocale, useLocale, useT } from "@/lib/i18n";

export default function LoginView({ demo = false }) {
  return (
    <ToastProvider>
      <ThemeApplier />
      <AnimatedBackground />
      <LoginCard demo={demo} />
    </ToastProvider>
  );
}

function LoginCard({ demo }) {
  const tr = useT();
  const sp = useSearchParams();
  const next = sp.get("next");
  const reason = sp.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setPrefs = usePrefs((s) => s.set);
  const locale = useLocale();

  // a PIN lock from a previous session must never cover the login page
  useEffect(() => {
    document.documentElement.dataset.locked = "false";
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password, remember });
      setPrefs({ locked: false });
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.href = new URL(target, window.location.origin).href; // full reload so the server layout sees the session
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const fill = (mail, pw) => {
    setEmail(mail);
    setPassword(pw);
    setError(null);
  };

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[420px] anim-rise">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo size={48} className="rounded-app shadow-[0_10px_24px_-8px_var(--accent)]" />
          <span>
            <span className="block text-lg font-semibold tracking-tight">{tr("Task Portal")}</span>
            <span className="block text-xs text-fg-muted">{tr("Control center")}</span>
          </span>
        </div>

        <form onSubmit={submit} className="glass rounded-app-lg p-6 shadow-app-lg">
          <h1 className="text-xl font-semibold tracking-tight">{tr("Sign in")}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {tr(reason === "expired" ? "Your session has expired. Please sign in again." : "Use your account email and password.")}
          </p>

          <div className="mt-5 space-y-4">
            <Field label={tr("Email")}>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
                <Input type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-9" />
              </div>
            </Field>
            <Field label={tr("Password")}>
              <div className="relative">
                <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
                <Input type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <Checkbox checked={remember} onChange={setRemember} label={tr("Keep me signed in for 30 days")} />
            {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500 anim-pop">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" icon={LogIn} loading={busy}>
              {tr("Sign in")}
            </Button>
          </div>
        </form>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-fg-muted">
          {Object.entries(LOCALES).map(([code, name], i) => (
            <span key={code} className="flex items-center gap-2">
              {i > 0 ? <span className="text-fg-faint">·</span> : null}
              <button type="button" onClick={() => code !== locale && switchLocale(code)} className={cn("hover:text-fg", code === locale && "font-semibold text-fg")}>{name}</button>
            </span>
          ))}
        </p>
        {demo ? (
          <div className="mt-4 rounded-app border border-dashed border-line bg-surface/60 p-3 text-xs text-fg-muted">
            <p className="mb-2 font-medium text-fg">{tr("Demo accounts (development)")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DemoAccount icon={ShieldCheck} role="Admin" email="admin@example.com" pw="admin123" onPick={fill} />
              <DemoAccount icon={User} role="User" email="user@example.com" pw="user123" onPick={fill} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DemoAccount({ icon: Icon, role, email, pw, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(email, pw)}
      className={cn("flex items-start gap-2 rounded-app-sm border border-line bg-surface p-2 text-left transition hover:border-accent hover:bg-accent/5")}
    >
      <Icon size={14} className="mt-0.5 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block font-medium text-fg">{role}</span>
        <span className="block truncate">{email}</span>
        <span className="block font-mono text-[10px] text-fg-faint">{pw}</span>
      </span>
    </button>
  );
}
