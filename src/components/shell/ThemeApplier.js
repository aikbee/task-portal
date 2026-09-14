"use client";
import { useEffect } from "react";
import { usePrefs, ACCENTS, RADII, PREFS_STORAGE_KEY } from "@/lib/store";

/** Mirrors preference state onto <html> as data attributes + CSS variables. */
export default function ThemeApplier() {
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.accent);
  const radius = usePrefs((s) => s.radius);
  const density = usePrefs((s) => s.density);
  const tableTheme = usePrefs((s) => s.tableTheme);
  const glass = usePrefs((s) => s.glass);
  const bgAnimate = usePrefs((s) => s.bgAnimate);
  const bgIntensity = usePrefs((s) => s.bgIntensity);
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const lockTheme = usePrefs((s) => s.lockTheme);
  const locked = usePrefs((s) => s.locked && Boolean(s.pinHash));

  // keep split-view panes and other tabs in sync with preference changes
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PREFS_STORAGE_KEY) usePrefs.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // While locked the page follows the lock-screen appearance, so the animated background behind
  // the lock overlay uses the same palette (the boot script does the same before hydration).
  const effective = locked && lockTheme && lockTheme !== "system" ? lockTheme : theme;
  useEffect(() => {
    const el = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      el.dataset.theme = effective === "system" ? (mq.matches ? "dark" : "light") : effective;
    };
    apply();
    if (effective === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [effective]);

  useEffect(() => {
    const el = document.documentElement;
    const a = ACCENTS[accent] ?? ACCENTS.indigo;
    el.style.setProperty("--accent", a.value);
    el.style.setProperty("--accent-strong", a.strong);
    el.style.setProperty("--accent-soft", a.soft);
    el.style.setProperty("--radius", RADII[radius] ?? RADII.md);
    el.dataset.density = density;
    el.dataset.tableTheme = tableTheme === "modern" ? "modern" : "classic";
    el.dataset.glass = glass ? "on" : "off";
    el.dataset.bgAnimate = bgAnimate ? "on" : "off";
    el.style.setProperty("--bg-intensity", { subtle: "0.45", normal: "0.8", vivid: "1" }[bgIntensity] ?? "0.8");
    el.dataset.motion = reduceMotion ? "reduce" : "normal";
  }, [accent, radius, density, tableTheme, glass, bgAnimate, bgIntensity, reduceMotion]);

  return null;
}
