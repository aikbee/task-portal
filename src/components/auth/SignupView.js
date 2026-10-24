"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, Eye, EyeOff, User, UserPlus, Mail, KeyRound, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "./AuthShell";
import Button from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Controls";
import { useT } from "@/lib/i18n";
import { AgreeLine } from "./LegalLinks";

const PASSWORD_MIN = 8; // lib/signup.js SIGNUP_PASSWORD_MIN

/** Open sign-up: name, address and password, then the 6-digit code the portal mails to that address. */
export default function SignupView() {
  return <AuthShell title="Create your account"><Form /></AuthShell>;
}
function Form() {
  const tr = useT();
  const [open, setOpen] = useState(null); // null = asking the portal, then true / false
  const [step, setStep] = useState("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);
  useEffect(() => {
    api.get("/api/auth/methods").then((m) => setOpen(Boolean(m.signup))).catch(() => setOpen(false));
  }, []);

  const ask = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/signup", { name, email, password });
      if (step === "code") setResent(true);
      setStep("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/signup/verify", { email, code });
      // full load on purpose: the server layout must pick up the new session
      window.location.href = new URL("/", window.location.origin).href;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (open === null) return <p className="text-sm text-fg-muted">{tr("One moment…")}</p>;
  if (!open) {
    return (
      <div className="signup-closed space-y-4 text-sm">
        <p className="flex items-start gap-2.5"><TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-500" /> <span>{tr("Creating an account is not open on this portal. Ask an administrator for one.")}</span></p>
        <Link href="/login"><Button variant="secondary" size="lg" className="w-full">{tr("Sign in")}</Button></Link>
      </div>
    );
  }
  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-sm text-fg-muted">{tr("We sent a 6-digit code to {email}. Enter it to finish. It works for 15 minutes.", { email })}</p>
        <Field label={tr("Verification code")}>
          <div className="relative">
            <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
            <Input inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="signup-code pl-9 font-mono tracking-[0.3em]" />
          </div>
        </Field>
        {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
        <Button type="submit" size="lg" className="signup-verify w-full" icon={UserPlus} loading={busy} disabled={code.length !== 6}>{tr("Create my account")}</Button>
        <p className="text-center text-xs text-fg-muted">
          {resent ? tr("A new code is on its way.") : tr("No email? Check the spam folder, or")}{" "}
          {!resent ? <button type="button" onClick={ask} className="text-accent hover:underline">{tr("send a new code")}</button> : null}
          {" · "}
          <button type="button" onClick={() => { setStep("details"); setCode(""); setError(null); setResent(false); }} className="text-accent hover:underline">{tr("change the address")}</button>
        </p>
      </form>
    );
  }
  return (
    <form onSubmit={ask} className="space-y-4">
      <Field label={tr("Your name")}>
        <div className="relative">
          <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input autoComplete="name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="signup-name pl-9" />
        </div>
      </Field>
      <Field label={tr("Email")}>
        <div className="relative">
          <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input type="email" autoComplete="email" required maxLength={190} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="signup-email pl-9" />
        </div>
      </Field>
      <Field label={tr("Password")} hint={tr("At least {n} characters", { n: PASSWORD_MIN })}>
        <div className="relative">
          <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input type={show ? "text" : "password"} autoComplete="new-password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} className="signup-password pl-9 pr-9" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={tr(show ? "Hide password" : "Show password")}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
      </Field>
      {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      <Button type="submit" size="lg" className="signup-send w-full" icon={Mail} loading={busy}>{tr("Send me a code")}</Button>
      <AgreeLine />
      <p className="text-center text-xs text-fg-muted">{tr("Already have an account?")} <Link href="/login" className="text-accent hover:underline">{tr("Sign in")}</Link></p>
    </form>
  );
}
