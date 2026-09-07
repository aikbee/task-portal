"use client";
import { useEffect, useState } from "react";
import { PartyPopper, Coffee, Play } from "lucide-react";
import { useUI, usePrefs } from "@/lib/store";
import { playChime, primeAudio } from "@/lib/audio";
import { timerTotalSeconds } from "./tools/TimerTool";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

function messages(finished, nextMin) {
  return finished === "work"
    ? { title: "Focus session complete", body: `Nice work — time for a ${nextMin}-minute cooldown.` }
    : { title: "Cooldown finished", body: `Break's over. Ready for a ${nextMin}-minute focus session?` };
}

/**
 * Runs the timer regardless of whether the timer panel is open, and raises the
 * configured alert (pop-up / toast / chime / desktop notification) when a session ends.
 */
export default function TimerEngine() {
  const running = useUI((s) => s.timer.running);
  const setTimer = useUI((s) => s.setTimer);
  const toast = useToast();
  const [done, setDone] = useState(null); // { finished, next, nextMin, autoStarted }

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const cur = useUI.getState().timer;
      if (!cur.running) return;
      const left = Math.max(0, Math.round((cur.endsAt - Date.now()) / 1000));
      if (left > 0) {
        if (left !== cur.remaining) setTimer({ remaining: left });
        return;
      }
      const finished = cur.mode;
      const next = finished === "work" ? "break" : "work";
      const p = usePrefs.getState();
      const nextMin = next === "work" ? p.timerFocusMin : p.timerBreakMin;
      const nextTotal = timerTotalSeconds(next, p.timerFocusMin, p.timerBreakMin);
      const autoStarted = Boolean(p.timerAutoNext);
      setTimer(
        autoStarted
          ? { running: true, endsAt: Date.now() + nextTotal * 1000, remaining: nextTotal, mode: next }
          : { running: false, endsAt: null, remaining: null, mode: next }
      );

      const msg = messages(finished, nextMin);
      if (p.timerSound) playChime(finished);
      if (p.timerNotify && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(msg.title, { body: msg.body, silent: true });
        } catch {}
      }
      if (p.timerAlert === "modal") setDone({ finished, next, nextMin, autoStarted });
      else if (p.timerAlert === "toast") toast.info(msg.title, autoStarted ? `${msg.body} (started automatically)` : msg.body);
    };
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [running, setTimer, toast]);

  const dismiss = () => setDone(null);
  const startNext = () => {
    if (!done) return;
    primeAudio();
    const total = done.nextMin * 60;
    setTimer({ running: true, endsAt: Date.now() + total * 1000, remaining: total, mode: done.next });
    setDone(null);
  };

  const msg = done ? messages(done.finished, done.nextMin) : null;
  const nextLabel = done?.next === "work" ? "focus" : "cooldown";

  return (
    <Modal open={!!done} onClose={dismiss} size="sm">
      {done ? (
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-strong text-white shadow-[0_12px_28px_-10px_var(--accent)] anim-pop">
            {done.finished === "work" ? <PartyPopper size={28} /> : <Coffee size={28} />}
          </span>
          <h2 className="mt-4 text-lg font-semibold">{msg.title}</h2>
          <p className="mt-1 text-sm text-fg-muted">{done.autoStarted ? `The ${nextLabel} session (${done.nextMin} min) started automatically.` : msg.body}</p>
          <div className="mt-6 flex justify-center gap-2">
            {done.autoStarted ? (
              <Button onClick={dismiss}>Got it</Button>
            ) : (
              <>
                <Button icon={Play} onClick={startNext}>
                  Start {nextLabel} · {done.nextMin} min
                </Button>
                <Button variant="secondary" onClick={dismiss}>Dismiss</Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
