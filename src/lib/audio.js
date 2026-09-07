"use client";
/** Tiny Web Audio chime for the timer — no audio assets needed. */
let ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

/** Call from a user gesture (e.g. the Start button) so playback is allowed later. */
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

/** kind: "work" (rising chime) | "break" (falling chime) */
export async function playChime(kind = "work") {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  const now = c.currentTime;
  const notes = kind === "work" ? [523.25, 659.25, 783.99, 1046.5] : [783.99, 659.25, 523.25];
  notes.forEach((freq, i) => {
    const t = now + i * 0.16;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.75);
  });
  return true;
}
