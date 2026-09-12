/** Every background style the app can render. Icons live in the UI (see BG_ICONS in PreferencesDrawer). */
export const BG_STYLES = [
  { value: "aurora", label: "Aurora", desc: "Soft drifting ribbons" },
  { value: "mesh", label: "Mesh", desc: "Colour-shifting gradient" },
  { value: "orbs", label: "Orbs", desc: "Floating glowing balls" },
  { value: "bubbles", label: "Bubbles", desc: "Rising soap bubbles" },
  { value: "stars", label: "Stars", desc: "Twinkling starfield" },
  { value: "waves", label: "Waves", desc: "Ribbons rolling along the bottom" },
  { value: "hexagons", label: "Hexagons", desc: "Honeycomb with a roaming light" },
  { value: "sunrise", label: "Sunrise", desc: "Horizon glow and a breathing sun" },
  { value: "grid", label: "Grid", desc: "Perspective floor" },
  { value: "rain", label: "Rain", desc: "Fine streaks falling at an angle" },
  { value: "snow", label: "Snow", desc: "Soft flakes drifting down" },
  { value: "topography", label: "Topography", desc: "Contour lines slowly breathing" },
  { value: "circuit", label: "Circuit", desc: "Traces with light pulses" },
  { value: "confetti", label: "Confetti", desc: "Colourful pieces tumbling down" },
  { value: "none", label: "None", desc: "Plain background" },
];
export const BG_KEYS = BG_STYLES.map((b) => b.value);

/** Admin settings: which styles users may pick, the default, and whether the default is forced on everyone. */
export const DEFAULT_BG_SETTINGS = { enabled: BG_KEYS.slice(), default: "aurora", locked: false };

export function normaliseBgSettings(raw) {
  const s = { ...DEFAULT_BG_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  let enabled = Array.isArray(s.enabled) ? BG_KEYS.filter((k) => s.enabled.includes(k)) : BG_KEYS.slice();
  if (!enabled.length) enabled = ["none"];
  const def = enabled.includes(s.default) ? s.default : enabled[0];
  return { enabled, default: def, locked: Boolean(s.locked) };
}

/** The style a browser should actually show, given the user's preference and the admin settings. */
export function resolveBackground(pref, settings) {
  const s = settings ? normaliseBgSettings(settings) : DEFAULT_BG_SETTINGS;
  if (s.locked) return s.default;
  return s.enabled.includes(pref) ? pref : s.default;
}
