"use client";
import { WifiOff, RotateCw } from "lucide-react";
import Logo from "@/components/ui/Logo";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** Shown by the service worker when a page cannot be reached. Public, no data. */
export default function OfflinePage() {
  const tr = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo size={56} className="rounded-app shadow-app" />
      <div className="space-y-1">
        <h1 className="flex items-center justify-center gap-2 text-lg font-semibold">
          <WifiOff size={18} className="text-fg-muted" /> {tr("You're offline")}
        </h1>
        <p className="max-w-sm text-sm text-fg-muted">{tr("This page needs a connection. Check your network and try again.")}</p>
      </div>
      <Button icon={RotateCw} onClick={() => window.location.reload()}>{tr("Retry")}</Button>
    </div>
  );
}
