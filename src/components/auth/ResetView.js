"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LockKeyhole, Eye, EyeOff, KeyRound, CircleCheckBig, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "./AuthShell";
import Button from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Controls";
import { useT } from "@/lib/i18n";

export default function ResetView() {
  return <AuthShell title="Choose a new password"><Form /></AuthShell>;
}
function Form() {
  const tr = useT();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState(null); // { valid, email_hint, min_length }
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/api/auth/reset?token=${encodeURIComponent(token)}`).then(setState).catch(() => setState({ valid: false }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== again) return setError(tr("The two passwords are not the same."));
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!state) return <p className="text-sm text-fg-muted">{tr("Checking the link…")}</p>;
  if (done) {
    return (
      <div className="reset-done space-y-4 text-sm">
        <p className="flex items-start gap-2.5"><CircleCheckBig size={18} className="mt-0.5 shrink-0 text-emerald-500" /> <span>{tr("Your password is changed and every device was signed out. Sign in with the new one.")}</span></p>
        <Link href="/login"><Button size="lg" className="w-full">{tr("Sign in")}</Button></Link>
      </div>
    );
  }
  if (!state.valid) {
    return (
      <div className="reset-invalid space-y-4 text-sm">
        <p className="flex items-start gap-2.5"><TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-500" /> <span>{tr("This link is no longer valid. Links work once and for one hour.")}</span></p>
        <Link href="/forgot"><Button variant="secondary" size="lg" className="w-full">{tr("Ask for a new link")}</Button></Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-fg-muted">{tr("For the account {email}.", { email: state.email_hint })}</p>
      <Field label={tr("New password")} hint={tr("At least {n} characters", { n: state.min_length })}>
        <div className="relative">
          <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input type={show ? "text" : "password"} autoComplete="new-password" autoFocus required minLength={state.min_length} value={password} onChange={(e) => setPassword(e.target.value)} className="reset-password pl-9 pr-9" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={tr(show ? "Hide password" : "Show password")}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
      </Field>
      <Field label={tr("Repeat it")}>
        <Input type={show ? "text" : "password"} autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className="reset-again" />
      </Field>
      {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      <Button type="submit" size="lg" className="reset-save w-full" icon={KeyRound} loading={busy}>{tr("Save the new password")}</Button>
    </form>
  );
}
