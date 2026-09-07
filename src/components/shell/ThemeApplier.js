"use client";
import { useEffect } from "react";
import { usePrefs, ACCENTS, RADII, PREFS_STORAGE_KEY } from "@/lib/store";

/** Mirrors preference state onto <html> as data attributes + CSS variables. */
export default function ThemeApplier() {
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.accent);
  const radius = usePrefs((s) => s.radius);
  const density = usePrefs((s) => s.density);
  const glass = usePrefs((s) => s.glass);
  const bgAnimate = usePrefs((s) => s.bgAnimate);
  const bgIntensity = usePrefs((s) => s.bgIntensity);
  const reduceMotion = usePrefs((s) => s.reduceMotion);

  // keep split-view panes and other tabs in sync with preference changes
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PREFS_STORAGE_KEY) usePrefs.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      el.dataset.theme = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
    };
    apply();
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  useEffect(() => {
    const el = document.documentElement;
    const a = ACCENTS[accent] ?? ACCENTS.indigo;
    el.style.setProperty("--accent", a.value);
    el.style.setProperty("--accent-strong", a.strong);
    el.style.setProperty("--accent-soft", a.soft);
    el.style.setProperty("--radius", RADII[radius] ?? RADII.md);
    el.dataset.density = density;
    el.dataset.glass = glass ? "on" : "off";
    el.dataset.bgAnimate = bgAnimate ? "on" : "off";
    el.style.setProperty("--bg-intensity", { subtle: "0.45", normal: "0.8", vivid: "1" }[bgIntensity] ?? "0.8");
    el.dataset.motion = reduceMotion ? "reduce" : "normal";
  }, [accent, radius, density, glass, bgAnimate, bgIntensity, reduceMotion]);

  return null;
}
