"use client";
import { Bell, BellRing, VolumeX, Volume2 } from "lucide-react";
import { usePrefs } from "@/lib/store";
import { primeAudio, playChime } from "@/lib/audio";
import { Field, Segmented, Toggle } from "@/components/ui/Controls";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

/** What happens when a focus / cooldown session ends. Shared by the timer panel and Preferences. */
export default function TimerAlertSettings() {
  const tr = useT();
  const timerAlert = usePrefs((s) => s.timerAlert);
  const timerSound = usePrefs((s) => s.timerSound);
  const timerNotify = usePrefs((s) => s.timerNotify);
  const timerAutoNext = usePrefs((s) => s.timerAutoNext);
  const set = usePrefs((s) => s.set);
  const toast = useToast();

  const enableNotify = async (v) => {
    if (!v) return set({ timerNotify: false });
    if (typeof Notification === "undefined") return toast.error("Desktop notifications are not supported here");
    let perm = Notification.permission;
    if (perm !== "granted") perm = await Notification.requestPermission();
    if (perm === "granted") set({ timerNotify: true });
    else toast.error("Notification permission was not granted");
  };

  const testSound = async () => {
    primeAudio();
    const ok = await playChime("work");
    if (!ok) toast.error("Sound is not available in this browser");
  };

  return (
    <div className="space-y-3">
      <Field label={tr("When a session ends")}>
        <Segmented
          size="sm"
          className="w-full"
          value={timerAlert}
          onChange={(v) => set({ timerAlert: v })}
          options={[
            { value: "modal", label: tr("Pop-up"), icon: BellRing },
            { value: "toast", label: tr("Toast"), icon: Bell },
            { value: "none", label: tr("Silent"), icon: VolumeX },
          ]}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Toggle className="flex-1" checked={timerSound} onChange={(v) => set({ timerSound: v })} label={tr("Play a chime")} description={tr("Short sound when time is up")} />
        <Button size="xs" variant="outline" icon={Volume2} onClick={testSound}>{tr("Test")}</Button>
      </div>
      <Toggle checked={timerNotify} onChange={enableNotify} label={tr("Desktop notification")} description={tr("Also alerts when this tab is in the background")} />
      <Toggle checked={timerAutoNext} onChange={(v) => set({ timerAutoNext: v })} label={tr("Auto-start next session")} description={tr("Cooldown follows focus automatically, and vice versa")} />
    </div>
  );
}
