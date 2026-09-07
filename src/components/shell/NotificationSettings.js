"use client";
import { useState } from "react";
import { Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { usePrefs } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { NOTIFICATION_CATEGORIES } from "@/lib/modules";
import { primeAudio, playChime } from "@/lib/audio";
import { Toggle } from "@/components/ui/Controls";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** Which categories reach you (saved on your account) + how they are announced (this browser). */
export default function NotificationSettings() {
  const tr = useT();
  const { user, setUser } = useAuth();
  const notifySound = usePrefs((s) => s.notifySound);
  const notifyDesktop = usePrefs((s) => s.notifyDesktop);
  const setPrefs = usePrefs((s) => s.set);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const prefs = typeof user?.notification_prefs === "string" ? JSON.parse(user.notification_prefs) : user?.notification_prefs;
  const muted = new Set(prefs?.muted ?? []);

  const toggleCategory = async (key, on) => {
    const next = new Set(muted);
    if (on) next.delete(key);
    else next.add(key);
    setBusy(true);
    try {
      const saved = await api.put("/api/auth/profile", { notification_prefs: { muted: [...next] } });
      setUser((u) => ({ ...u, notification_prefs: saved.notification_prefs }));
    } catch (e) {
      toast.error("Could not save notification settings", e.message);
    } finally {
      setBusy(false);
    }
  };

  const enableDesktop = async (v) => {
    if (!v) return setPrefs({ notifyDesktop: false });
    if (typeof Notification === "undefined") return toast.error("Desktop notifications are not supported here");
    let perm = Notification.permission;
    if (perm !== "granted") perm = await Notification.requestPermission();
    if (perm === "granted") setPrefs({ notifyDesktop: true });
    else toast.error("Notification permission was not granted");
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Receive")}</p>
      {Object.entries(NOTIFICATION_CATEGORIES).map(([key, cat]) => (
        <Toggle key={key} checked={!muted.has(key)} onChange={(v) => toggleCategory(key, v)} label={tr(cat.label)} description={tr(cat.description)} className={busy ? "opacity-70" : ""} />
      ))}
      <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Announce (this browser)")}</p>
      <div className="flex items-center gap-3">
        <Toggle className="flex-1" checked={notifySound} onChange={(v) => setPrefs({ notifySound: v })} label={tr("Play a chime")} description={tr("When a new notification arrives")} />
        <Button size="xs" variant="outline" icon={Volume2} onClick={async () => { primeAudio(); if (!(await playChime("work"))) toast.error("Sound is not available"); }}>{tr("Test")}</Button>
      </div>
      <Toggle checked={notifyDesktop} onChange={enableDesktop} label={tr("Desktop notification")} description={tr("When this tab is in the background")} />
    </div>
  );
}
