"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Undo2 } from "lucide-react";
import { useUI } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const HIDDEN = { opacity: 0, transform: "scale(0.98) translateY(12px)" };
const SHOWN = { opacity: 1, transform: "none" };

/** Every top-level layer except the background and this component's own catcher. */
function layers() {
  const out = [];
  for (const el of document.body.children) {
    if (el.matches("script, style, link, template, .bg-layer, [data-bg-keep]")) continue;
    if (el.hasAttribute("data-lock-screen")) {
      // the lock overlay itself stays (it is the container); its scrim and content fade
      for (const child of el.children) if (!child.hasAttribute("data-bg-keep")) out.push(child);
      continue;
    }
    out.push(el);
  }
  return out;
}

function play(el, from, to, duration) {
  if (typeof el.animate !== "function") return;
  const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.animate([from, to], { duration: reduce ? 1 : duration, easing: EASE });
}

/**
 * "Show background only": hides every layer (app, drawers, modals, the lock screen's clock and
 * keypad) so just the animated background is visible, then brings everything back with a short
 * animation on the first click or key press. Works both in the app and on the lock screen.
 * The hidden state is held by CSS (`html[data-bg-only="true"]`, see globals.css); this component
 * only plays the out / in movement and catches the click that ends the view.
 */
export default function BackgroundOnly() {
  const tr = useT();
  const mounted = useMounted();
  const on = useUI((s) => s.bgOnly);
  const setBgOnly = useUI((s) => s.setBgOnly);
  const wasOn = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (on) {
      wasOn.current = true;
      root.dataset.bgOnly = "true";
      layers().forEach((el) => play(el, SHOWN, HIDDEN, 450));
      const exit = () => setBgOnly(false);
      const onKey = (e) => {
        if (e.repeat) return;
        e.preventDefault();
        e.stopPropagation(); // the lock screen must not read this key as a PIN digit
        exit();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }
    if (!wasOn.current) return; // first mount: nothing to bring back
    wasOn.current = false;
    delete root.dataset.bgOnly;
    layers().forEach((el) => play(el, HIDDEN, SHOWN, 550));
  }, [on, setBgOnly]);

  if (!mounted || !on) return null;
  return createPortal(
    <div
      data-bg-keep
      className="fixed inset-0 z-[400] cursor-pointer"
      onClick={() => setBgOnly(false)}
      role="button"
      tabIndex={-1}
      aria-label={tr("Click anywhere or press any key to return")}
    >
      <span className="bg-only-hint inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-black/35 px-4 py-2 text-xs font-medium text-white shadow-app-lg backdrop-blur-md">
        <Undo2 size={13} /> {tr("Click anywhere or press any key to return")}
      </span>
    </div>,
    document.body
  );
}
