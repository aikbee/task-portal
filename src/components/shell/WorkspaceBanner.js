"use client";
import { useState } from "react";
import { Briefcase, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** Shown to admins while they are inside another user's workspace. */
export default function WorkspaceBanner() {
  const tr = useT();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const ws = user?.workspace;
  if (!ws) return null;

  const leave = async () => {
    setBusy(true);
    try {
      await api.put("/api/auth/workspace", { user_id: null });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/12 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200 anim-fade">
      <Briefcase size={14} className="shrink-0" />
      <Avatar name={ws.name} color={ws.avatar_color} size="xs" />
      <span className="min-w-0 truncate">
        Viewing <b>{ws.name}</b>&rsquo;s workspace ({ws.email}). Projects, employees and tasks you create or change here belong to them.
      </span>
      <span className="flex-1" />
      <Button size="xs" variant="outline" icon={Undo2} loading={busy} onClick={leave} className="border-amber-500/40 bg-surface/60">
        {tr("Back to my workspace")}
      </Button>
    </div>
  );
}
