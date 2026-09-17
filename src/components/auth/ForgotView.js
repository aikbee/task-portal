"use client";
import { useState } from "react";
import { Mail, Send, MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import AuthShell from "./AuthShell";
import Button from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Controls";
import { useT } from "@/lib/i18n";

export default function ForgotView() {
  return <AuthShell title="Forgot your password?"><Form /></AuthShell>;
}
function Form() {
  const tr = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div className="forgot-sent space-y-3 text-sm">
        <p className="flex items-start gap-2.5"><MailCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" /> <span>{tr("If {email} has an account here, a link to choose a new password is on its way. It works once and for one hour.", { email })}</span></p>
        <p className="text-xs text-fg-muted">{tr("Nothing after a few minutes? Check the spam folder, or ask an administrator to reset the password for you.")}</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-fg-muted">{tr("Enter the email address of your account and we will send you a link to choose a new one.")}</p>
      <Field label={tr("Email")}>
        <div className="relative">
          <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <Input type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="forgot-email pl-9" />
        </div>
      </Field>
      {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      <Button type="submit" size="lg" className="forgot-send w-full" icon={Send} loading={busy}>{tr("Send the link")}</Button>
    </form>
  );
}
