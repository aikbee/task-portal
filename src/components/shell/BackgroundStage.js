"use client";
import { useEffect } from "react";
import { usePrefs, ACCENTS } from "@/lib/store";
import { BG_KEYS } from "@/lib/backgrounds";
import ThemeApplier from "./ThemeApplier";
import AnimatedBackground from "./AnimatedBackground";

const THEMES = ["light", "dark", "system"];
const INTENSITIES = ["subtle", "normal", "vivid"];
const truthy = (v) => v === true || v === 1 || v === "1" || v === "true" || v === "on";

/** What the host asked for, as a preferences patch; anything unknown is dropped rather than stored. */
function patchOf(input) {
  const patch = {};
  if (BG_KEYS.includes(input.style)) patch.bgStyle = input.style;
  if (THEMES.includes(input.theme)) patch.theme = input.theme;
  if (Object.hasOwn(ACCENTS, String(input.accent))) patch.accent = input.accent;
  if (INTENSITIES.includes(input.intensity)) patch.bgIntensity = input.intensity;
  if (input.animate !== undefined) patch.bgAnimate = truthy(input.animate);
  if (input.motion !== undefined) patch.reduceMotion = input.motion === "reduce";
  return patch;
}

/**
 * The background on its own, driven by the page's query string and, afterwards, by
 * `window.TaskPortalBg.set({ style, theme, accent, intensity, animate, motion })` so the host
 * (the Android app's WebView) can change the look without reloading. The admin's background
 * settings still apply: a style that is switched off, or a locked default, wins as it does on the web.
 */
export default function BackgroundStage() {
  useEffect(() => {
    const apply = (input) => usePrefs.getState().set(patchOf(input && typeof input === "object" ? input : {}));
    apply(Object.fromEntries(new URLSearchParams(window.location.search)));
    window.TaskPortalBg = { set: apply };
    return () => { delete window.TaskPortalBg; };
  }, []);
  return (
    <>
      <ThemeApplier />
      <AnimatedBackground />
    </>
  );
}
