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
  { value: "galaxy", label: "Galaxy", desc: "3D particle spiral slowly turning", three: true },
  { value: "terrain", label: "Terrain", desc: "3D wireframe landscape rippling", three: true },
  { value: "crystals", label: "Crystals", desc: "3D low-poly shapes drifting in light", three: true },
  { value: "earth", label: "Earth links", desc: "3D globe with a web of connections", three: true },
  { value: "neon", label: "Neon energy", desc: "3D glowing beams pulsing with energy", three: true },
  { value: "island", label: "Island", desc: "3D low-poly island floating on water", three: true },
  { value: "bloodmoon", label: "Blood moon", desc: "3D crimson moon, drifting clouds and embers", three: true },
  { value: "ocean", label: "Ocean", desc: "3D rolling sea under a low sun", three: true },
  { value: "balloons", label: "Balloons", desc: "3D party balloons floating up", three: true },
  { value: "hearts", label: "Hearts", desc: "3D glossy hearts bobbing about", three: true },
  { value: "jellyfish", label: "Jellyfish", desc: "3D glowing jellies pulsing in deep water", three: true },
  { value: "ghosts", label: "Ghosts", desc: "3D friendly ghosts drifting through mist", three: true },
  { value: "portal", label: "Portal", desc: "3D arcane vortex pulling in sparks", three: true },
  { value: "wisps", label: "Wisps", desc: "3D spirit lights over a misty forest", three: true },
  { value: "saturn", label: "Ringed planet", desc: "3D gas giant with rings and moons", three: true },
  { value: "nebula", label: "Nebula", desc: "3D star nursery glowing in deep space", three: true },
  { value: "orbits", label: "Solar system", desc: "3D planets circling a bright sun", three: true },
  { value: "meadow", label: "Grassland", desc: "3D quiet prairie: wind in the grass, cows grazing and wandering", three: true },
  { value: "citydrive", label: "City drive", desc: "3D driver's view cruising through a city at an easy pace", three: true },
  { value: "neural", label: "Neural network", desc: "3D web of glowing nodes: links come and go, signals hop between them", three: true },
  { value: "frostpeaks", label: "Frozen peaks", desc: "3D ice mountains: falling snow, valley mist, aurora and a lone climber", three: true },
  { value: "luckycat", label: "Lucky cat", desc: "3D beckoning cat among gold, with coins and notes raining down", three: true },
  { value: "campsite", label: "Campsite", desc: "3D forest campsite: crackling fire, a tent lit from inside, fireflies under the stars", three: true },
  { value: "koipond", label: "Koi pond", desc: "3D koi gliding under real ripples, lotus and petals on the water", three: true },
  { value: "inkwash", label: "Ink landscape", desc: "3D Chinese ink painting: misty mountains, a boat on the river, cranes and a poem", three: true },
  { value: "rainwindow", label: "Rainy window", desc: "3D rain on a window: drops bend the city lights and slide down the glass", three: true },
  { value: "skylanterns", label: "Sky lanterns", desc: "3D lantern festival: glowing lanterns rise over a lake town, mirrored in the water", three: true },
  { value: "snowglobe", label: "Snow globe", desc: "3D snow globe with a tiny winter village: move the mouse and the snow swirls up", three: true },
  { value: "lighthouse", label: "Lighthouse", desc: "3D lighthouse in a storm: the beam sweeps the rain, waves crash on the rocks; calm with gulls by day", three: true },
  { value: "clockwork", label: "Clockwork", desc: "3D clock tower: brass gears tick through a real escapement, the pendulum swings, the dial shows the real time", three: true },
  { value: "sakura", label: "Sakura and Fuji", desc: "3D Mount Fuji behind a pagoda in cherry blossom, petals drifting onto a mirror lake; lanterns and a full moon at night", three: true },
  { value: "observatory", label: "Observatory", desc: "3D domed observatory: the telescope tracks the sky, the moon in today's real phase, stars turning with the real time", three: true },
  { value: "hotair", label: "Hot-air balloons", desc: "3D sunrise over a fairy-chimney valley: dozens of balloons drift up it, burners flaring, their shadows sliding over the rock; at night they glow like lanterns", three: true },
  { value: "reef", label: "Coral reef", desc: "3D sunlit reef seen from the sand: rays and caustics, corals and sea fans swaying, a turtle gliding past, a school of fish that swirls round the mouse", three: true },
  { value: "northernlights", label: "Northern lights lake", desc: "3D aurora over a still Lapland lake, mirrored in the water: snowy pines, a lit cabin and a canoe on the shore; low winter sun, mist and snow by day", three: true },
  { value: "none", label: "None", desc: "Plain background" },
];
export const BG_KEYS = BG_STYLES.map((b) => b.value);
export const THREE_STYLES = new Set(BG_STYLES.filter((b) => b.three).map((b) => b.value));

/** Admin settings: which styles users may pick, the default, and whether the default is forced on everyone. */
export const DEFAULT_BG_SETTINGS = { enabled: BG_KEYS.slice(), default: "aurora", locked: false };

export function normaliseBgSettings(raw) {
  const s = { ...DEFAULT_BG_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  // styles added after the admin last saved (not in `known`) stay enabled until the admin decides
  const known = Array.isArray(s.known) ? s.known : null;
  let enabled = Array.isArray(s.enabled) ? BG_KEYS.filter((k) => s.enabled.includes(k) || (known && !known.includes(k))) : BG_KEYS.slice();
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
