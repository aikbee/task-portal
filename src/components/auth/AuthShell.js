"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThemeApplier from "@/components/shell/ThemeApplier";
import AnimatedBackground from "@/components/shell/AnimatedBackground";
import { ToastProvider } from "@/components/ui/Toast";
import Logo from "@/components/ui/Logo";
import { useT } from "@/lib/i18n";

/** The signed-out frame shared by "forgot password", "reset password" and "join": background, logo, one glass card. */
export default function AuthShell({ title, description, children, back = true }) {
  return (
    <ToastProvider>
      <ThemeApplier />
      <AnimatedBackground />
      <Frame title={title} description={description} back={back}>{children}</Frame>
    </ToastProvider>
  );
}
function Frame({ title, description, children, back }) {
  const tr = useT();
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
        <div className="auth-card glass rounded-app-lg p-6 shadow-app-lg">
          <h1 className="text-xl font-semibold tracking-tight">{tr(title)}</h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        {back ? (
          <p className="mt-4 text-center text-xs text-fg-muted">
            <Link href="/login" className="inline-flex items-center gap-1 hover:text-fg"><ArrowLeft size={12} /> {tr("Back to sign in")}</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
