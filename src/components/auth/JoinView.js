"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LockKeyhole, Eye, EyeOff, User, UserPlus, TriangleAlert, Mail } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "./AuthShell";
import Button from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Controls";
import { useT } from "@/lib/i18n";

export default function JoinView() {
  return <AuthShell title="You are invited"><Form /></AuthShell>;
}
function Form() {
  const tr = useT();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/api/auth/join?token=${encodeURIComponent(token)}`).then(setState).catch(() => setState({ valid: false }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/join", { token, name, password });
      // full load on purpose: the server layout must pick up the new session
      window.location.href = new URL("/", window.location.origin).href;
    } catch (err) {
      setError(err.message);
      if (err.status === 409) setState((s) => ({ ...s, has_account: true }));
      setBusy(false);
    }
  };
  if (!state) return <p className="text-sm text-fg-muted">{tr("Checking the link…")}</p>;
  if (!state.valid) {
    return (
      <div className="join-invalid space-y-4 text-sm">
        <p className="flex items-start gap-2.5"><TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-500" /> <span>{tr("This invitation is no longer valid. It was used, withdrawn, or is older than 7 days. Ask the person who invited you for a new one.")}</span></p>
        <Link href="/login"><Button variant="secondary" size="lg" className="w-full">{tr("Sign in")}</Button></Link>
      </div>
    );
  }
  if (state.has_account) {
    return (
      <div className="join-existing space-y-4 text-sm">
        <p>{tr("An account with {email} exists already. Sign in: the invitation to “{profile}” is waiting under Profiles.", { email: state.email, profile: state.profile_name })}</p>
        <Link href="/login?next=/profiles"><Button size="lg" className="w-full">{tr("Sign in")}</Button></Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-fg-muted">{tr("{name} shares the workspace “{profile}” with you as {role}. Create your account to open it.", { name: state.inviter_name, profile: state.profile_name, role: tr(`${state.role[0].toUpperCase()}${state.role.slice(1)}`) })}</p>
      <p className="join-email flex items-center gap-2 rounded-app-sm border border-line bg-surface-2/60 px-3 py-2 text-sm"><Mail size={15} className="text-fg-faint" /> {state.email}</p>
      <Field label={tr("Your name")}>
        <div className="relative">
          <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input autoComplete="name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="join-name pl-9" />
        </div>
      </Field>
      <Field label={tr("Password")} hint={tr("At least {n} characters", { n: state.min_length })}>
        <div className="relative">
          <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input type={show ? "text" : "password"} autoComplete="new-password" required minLength={state.min_length} value={password} onChange={(e) => setPassword(e.target.value)} className="join-password pl-9 pr-9" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={tr(show ? "Hide password" : "Show password")}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
      </Field>
      {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      <Button type="submit" size="lg" className="join-create w-full" icon={UserPlus} loading={busy}>{tr("Create my account")}</Button>
    </form>
  );
}
