"use client";
import { useEffect, useState } from "react";
import { Volume2, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { usePrefs } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { NOTIFICATION_CATEGORIES } from "@/lib/modules";
import { primeAudio, playChime } from "@/lib/audio";
import { Toggle } from "@/components/ui/Controls";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";
import { pushSupported, currentPushSubscription, enablePush, disablePush } from "@/lib/push-client";

/** Which categories reach you (saved on your account) + how they are announced (this browser). */
export default function NotificationSettings() {
  const tr = useT();
  const { user, setUser } = useAuth();
  const notifySound = usePrefs((s) => s.notifySound);
  const notifyDesktop = usePrefs((s) => s.notifyDesktop);
  const setPrefs = usePrefs((s) => s.set);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mail = useFetch("/api/auth/methods"); // says whether this portal sends notification emails at all
  // push state for THIS device: unknown | unsupported | off | on | blocked | busy
  const [push, setPush] = useState(() => (pushSupported() ? "unknown" : "unsupported"));
  useEffect(() => {
    if (!pushSupported()) return;
    currentPushSubscription()
      .then((sub) => setPush(sub ? "on" : Notification.permission === "denied" ? "blocked" : "off"))
      .catch(() => setPush("off"));
  }, []);
  const togglePush = async (v) => {
    if (push === "busy" || push === "blocked") return;
    setPush("busy");
    try {
      if (v) {
        await enablePush();
        setPush("on");
        toast.success(tr("Push notifications enabled"));
      } else {
        await disablePush();
        setPush("off");
      }
    } catch (e) {
      setPush(typeof Notification !== "undefined" && Notification.permission === "denied" ? "blocked" : "off");
      toast.error("Could not change push notifications", e.message);
    }
  };
  const sendTest = async () => {
    try {
      await api.post("/api/push/test", {});
      toast.success(tr("Test notification sent"));
    } catch (e) {
      toast.error("Could not send a test notification", e.message);
    }
  };
  const prefs = typeof user?.notification_prefs === "string" ? JSON.parse(user.notification_prefs) : user?.notification_prefs;
  const muted = new Set(prefs?.muted ?? []);
  const emailMode = prefs?.email_mode ?? (prefs?.email === false ? "off" : "instant");
  const digestHour = Number.isInteger(prefs?.digest_hour) ? prefs.digest_hour : 8;

  const saveEmail = async (patch) => {
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const saved = await api.put("/api/auth/profile", { notification_prefs: { ...patch, tz } });
      setUser((u) => ({ ...u, notification_prefs: saved.notification_prefs }));
    } catch (e) {
      toast.error("Could not save notification settings", e.message);
    } finally {
      setBusy(false);
    }
  };
  const [sendingDigest, setSendingDigest] = useState(false);
  const sendDigestNow = async () => {
    setSendingDigest(true);
    try {
      const res = await api.post("/api/auth/digest", {});
      toast.success(tr("Summary sent to {email}", { email: user?.email }), res.summary);
    } catch (e) {
      toast.error(tr("Could not send the summary"), e.message);
    } finally {
      setSendingDigest(false);
    }
  };
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
      {mail.data?.mail?.notifications ? (
        <>
          <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Email")}</p>
          <div className={`notify-email space-y-2 ${busy ? "opacity-70" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm">
                <span className="block font-medium">{tr("Email me")}</span>
                <span className="block text-xs text-fg-muted">{emailMode === "digest" ? tr("One summary a day: new notifications, what is overdue or due today, today's events.") : emailMode === "instant" ? tr("Assignments, mentions, due dates, invitations and security, to {email}", { email: user?.email }) : tr("No emails.")}</span>
              </span>
              <select className="control notify-email-mode h-8 w-auto py-0 text-xs" value={emailMode} onChange={(e) => saveEmail({ email_mode: e.target.value })}>
                <option value="instant">{tr("Right away")}</option>
                <option value="digest">{tr("Once a day")}</option>
                <option value="off">{tr("Off")}</option>
              </select>
            </div>
            {emailMode === "digest" ? (
              <div className="flex flex-wrap items-center gap-2 pl-1 text-xs text-fg-muted">
                <span>{tr("Not before")}</span>
                <select className="control notify-digest-hour h-7 w-auto py-0 text-xs" value={digestHour} onChange={(e) => saveEmail({ digest_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
                <span>{tr("({tz})", { tz: prefs?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone })}</span>
                <Button size="xs" variant="outline" icon={Send} onClick={sendDigestNow} loading={sendingDigest} className="notify-digest-now">{tr("Send it now")}</Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Announce (this browser)")}</p>
      <div className="flex items-center gap-3">
        <Toggle className="flex-1" checked={notifySound} onChange={(v) => setPrefs({ notifySound: v })} label={tr("Play a chime")} description={tr("When a new notification arrives")} />
        <Button size="xs" variant="outline" icon={Volume2} onClick={async () => { primeAudio(); if (!(await playChime("work"))) toast.error("Sound is not available"); }}>{tr("Test")}</Button>
      </div>
      <Toggle checked={notifyDesktop} onChange={enableDesktop} label={tr("Desktop notification")} description={tr("When this tab is in the background")} />
      <p className="pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-faint">{tr("Push (this device)")}</p>
      {push === "unsupported" ? (
        <p className="text-xs text-fg-muted">{tr("Push notifications are not supported in this browser. On iPhone, add the app to the Home Screen first.")}</p>
      ) : (
        <div className={busy || push === "busy" ? "opacity-70" : ""}>
          <div className="flex items-center gap-3">
            <Toggle
              className="flex-1"
              checked={push === "on"}
              onChange={togglePush}
              label={tr("Push notifications")}
              description={push === "blocked" ? tr("Blocked in browser settings") : tr("Task reminders and updates, even when the app is closed")}
            />
            {push === "on" ? <Button size="xs" variant="outline" icon={Send} onClick={sendTest}>{tr("Test")}</Button> : null}
          </div>
        </div>
      )}
    </div>
  );
}
