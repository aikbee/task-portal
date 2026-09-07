"use client";
import { usePrefs } from "@/lib/store";
import { useMounted } from "@/lib/hooks";

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

export default function AnimatedBackground() {
  const style = usePrefs((s) => s.bgStyle);
  const mounted = useMounted();
  if (!mounted || style === "none") return <div className="bg-layer" aria-hidden />;

  return (
    <div className="bg-layer" aria-hidden>
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
    </div>
  );
}
