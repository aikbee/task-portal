"use client";
import { useEffect } from "react";
import { usePrefs, useUI } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { api } from "@/lib/api";
import { resolveBackground, THREE_STYLES } from "@/lib/backgrounds";
import ThreeBackground from "./ThreeBackground";

const ORBS = [
  { c: "var(--accent)", size: 420, left: "8%", top: "12%", d: "22s", delay: "0s" },
  { c: "#06b6d4", size: 340, left: "70%", top: "8%", d: "26s", delay: "-6s" },
  { c: "#ec4899", size: 300, left: "78%", top: "62%", d: "24s", delay: "-12s" },
  { c: "#f59e0b", size: 260, left: "22%", top: "68%", d: "28s", delay: "-3s" },
  { c: "#8b5cf6", size: 220, left: "48%", top: "40%", d: "30s", delay: "-9s" },
];

const STAR_LAYERS = [
  { s: "90px", r: "0.8px", d: "160s", dx: "-90px", dy: "180px", t: "6s" },
  { s: "150px", r: "1.1px", d: "110s", dx: "-150px", dy: "300px", t: "4.5s" },
  { s: "230px", r: "1.6px", d: "80s", dx: "-230px", dy: "460px", t: "7s", glow: true },
];

const BUBBLES = [
  { x: "8%", size: "70px", d: "26s", delay: "-4s", sway: "4vw", c: "var(--accent)" },
  { x: "20%", size: "40px", d: "19s", delay: "-11s", sway: "-3vw", c: "#06b6d4" },
  { x: "33%", size: "110px", d: "34s", delay: "-2s", sway: "5vw", c: "#ec4899" },
  { x: "47%", size: "55px", d: "22s", delay: "-15s", sway: "-4vw", c: "var(--accent)" },
  { x: "58%", size: "90px", d: "30s", delay: "-8s", sway: "3vw", c: "#f59e0b" },
  { x: "70%", size: "45px", d: "18s", delay: "-1s", sway: "-2vw", c: "#8b5cf6" },
  { x: "81%", size: "130px", d: "38s", delay: "-20s", sway: "4vw", c: "#06b6d4" },
  { x: "92%", size: "60px", d: "24s", delay: "-6s", sway: "-5vw", c: "var(--accent)" },
];

/** A seamless two-period wave (0–1440 repeated at 1440–2880) so translateX(-50%) loops cleanly. */
const WAVE_PATH =
  "M0,160 C240,230 480,90 720,160 C960,230 1200,90 1440,160 C1680,230 1920,90 2160,160 C2400,230 2640,90 2880,160 L2880,320 L0,320 Z";

const CONFETTI = ["#f43f5e", "#f59e0b", "#22c55e", "#06b6d4", "#6366f1", "#ec4899", "#eab308", "#8b5cf6", "#14b8a6", "#f97316", "#3b82f6", "#ef4444"];
const PULSES = [
  { top: "18%", d: "9s", delay: "0s" }, { top: "38%", d: "13s", delay: "-4s" }, { top: "61%", d: "11s", delay: "-7s" }, { top: "82%", d: "15s", delay: "-2s" },
];
const PULSES_V = [
  { left: "22%", d: "12s", delay: "-3s" }, { left: "49%", d: "10s", delay: "-8s" }, { left: "77%", d: "14s", delay: "-5s" },
];

/**
 * The page background. Follows the user's preference within what the admin allows
 * (see /backgrounds); `preview` renders a given style inside a small box instead.
 */
export default function AnimatedBackground({ preview = null }) {
  const pref = usePrefs((s) => s.bgStyle);
  const settings = useUI((s) => s.bgSettings);
  const setBgSettings = useUI((s) => s.setBgSettings);
  const mounted = useMounted();
  useEffect(() => {
    if (preview) return;
    api.get("/api/settings/backgrounds").then(setBgSettings).catch(() => {});
  }, [preview, setBgSettings]);
  const style = preview ?? resolveBackground(pref, settings);
  const cls = preview ? "bg-layer bg-preview-layer" : "bg-layer";
  if (!mounted || style === "none") return <div className={cls} aria-hidden />;
  if (THREE_STYLES.has(style)) {
    return (
      <div className={cls} aria-hidden>
        <ThreeBackground style={style} preview={Boolean(preview)} />
      </div>
    );
  }

  return (
    <div className={cls} aria-hidden>
      {style === "aurora" ? (
        <div className="aurora absolute inset-0">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {style === "orbs" ? (
        <div className="orbs absolute inset-0">
          {ORBS.map((o, i) => (
            <span key={i} style={{ "--c": o.c, "--d": o.d, "--delay": o.delay, width: o.size, height: o.size, left: o.left, top: o.top }} />
          ))}
        </div>
      ) : null}
      {style === "grid" ? (
        <div className="gridbg absolute inset-0">
          <div className="glow" />
          <div className="floor" />
        </div>
      ) : null}
      {style === "mesh" ? (
        <div className="mesh bg-anim">
          <span />
        </div>
      ) : null}
      {style === "stars" ? (
        <div className="stars bg-anim">
          {STAR_LAYERS.map((l, i) => (
            <span key={i} className={l.glow ? "glow" : undefined} style={{ "--s": l.s, "--r": l.r, "--d": l.d, "--dx": l.dx, "--dy": l.dy, "--t": l.t }} />
          ))}
        </div>
      ) : null}
      {style === "waves" ? (
        <div className="bg-anim">
          <div className="waves">
            <svg className="w3" viewBox="0 0 2880 320" preserveAspectRatio="none" style={{ "--d": "38s", height: "100%" }}>
              <path d={WAVE_PATH} />
            </svg>
            <svg className="w2" viewBox="0 0 2880 320" preserveAspectRatio="none" style={{ "--d": "27s", height: "78%" }}>
              <path d={WAVE_PATH} />
            </svg>
            <svg className="w1" viewBox="0 0 2880 320" preserveAspectRatio="none" style={{ "--d": "20s", height: "58%" }}>
              <path d={WAVE_PATH} />
            </svg>
          </div>
        </div>
      ) : null}
      {style === "hexagons" ? (
        <div className="hexes bg-anim">
          <div className="spot" />
          <div className="pattern" />
        </div>
      ) : null}
      {style === "bubbles" ? (
        <div className="bubbles bg-anim">
          {BUBBLES.map((b, i) => (
            <span key={i} style={{ "--x": b.x, "--size": b.size, "--d": b.d, "--delay": b.delay, "--sway": b.sway, "--c": b.c }} />
          ))}
        </div>
      ) : null}
      {style === "sunrise" ? (
        <div className="sunrise bg-anim">
          <div className="rays" />
          <div className="horizon" />
          <div className="sun" />
        </div>
      ) : null}
      {style === "rain" ? (
        <div className="rain bg-anim">
          <span className="far" />
          <span className="near" />
          <div className="mist" />
        </div>
      ) : null}
      {style === "snow" ? (
        <div className="snow bg-anim">
          <span style={{ "--s": "160px", "--r": "1.6px", "--d": "26s", "--o": "0.55" }} />
          <span style={{ "--s": "230px", "--r": "2.4px", "--d": "19s", "--o": "0.7" }} />
          <span style={{ "--s": "320px", "--r": "3.4px", "--d": "14s", "--o": "0.85" }} className="near" />
        </div>
      ) : null}
      {style === "topography" ? (
        <div className="topo bg-anim">
          <span className="a" />
          <span className="b" />
        </div>
      ) : null}
      {style === "circuit" ? (
        <div className="circuit bg-anim">
          <div className="traces" />
          {PULSES.map((p, i) => <i key={`h${i}`} className="h" style={{ top: p.top, "--d": p.d, "--delay": p.delay }} />)}
          {PULSES_V.map((p, i) => <i key={`v${i}`} className="v" style={{ left: p.left, "--d": p.d, "--delay": p.delay }} />)}
        </div>
      ) : null}
      {style === "confetti" ? (
        <div className="confetti bg-anim">
          {CONFETTI.map((c, i) => (
            <span key={i} style={{ "--c": c, "--x": `${(i * 8.3 + 3) % 100}%`, "--d": `${11 + (i % 5) * 2.6}s`, "--delay": `-${(i * 1.7) % 12}s`, "--w": `${8 + (i % 3) * 4}px`, "--h": `${12 + (i % 4) * 4}px`, "--sway": `${(i % 2 ? 1 : -1) * (3 + (i % 3))}vw` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
