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
  { value: "venice", label: "Venice canal", desc: "3D Venetian canal: palazzi mirrored in the water, gondolas gliding under a stone bridge; golden hour by day, lamplit at night", three: true },
  { value: "santorini", label: "Santorini sunset", desc: "3D Santorini at sunset: whitewashed houses and blue domes cascading down the caldera cliff, windmills turning, sailboats on a glittering sea; the village lights up at night", three: true },
  { value: "paris", label: "Paris rooftops", desc: "3D Paris at dusk from a high balcony: zinc rooftops and chimney pots, a boulevard leading to the Eiffel Tower; at night the windows glow and the Tower sparkles", three: true },
  { value: "steamengine", label: "Steam engine room", desc: "3D Victorian engine house: a great steam engine at work, flywheel turning, crosshead sliding, governor spinning; sunbeams through tall windows by day, gas light at night", three: true },
  { value: "robotfactory", label: "Robot factory", desc: "3D car body shop: robot arms weld the bodies on a moving line, sparks flying, robot carts gliding past; LED lines and welding flashes at night", three: true },
  { value: "v8engine", label: "V8 engine", desc: "3D cutaway V8 on an engine stand: pistons pumping, crank and camshafts turning, valves opening, coils firing 1-8-4-3-6-5-7-2; workshop light by day, a work lamp at night", three: true },
  { value: "rocketlaunch", label: "Rocket launch", desc: "3D seaside launch pad: the next rocket rolls out and is raised, the clock counts down, liftoff on fire and billowing smoke; floodlit at night", three: true },
  { value: "containerport", label: "Container port", desc: "3D container terminal at golden hour: cranes unload and load a big ship, trucks shuttle the boxes, a tug passes; floodlit and mirrored in the harbour at night", three: true },
  { value: "airport", label: "Airport at dusk", desc: "3D airport from the tower at dusk: airliners land out of the sunset and take off, runway lights shining on wet tarmac; every lamp and landing light at night", three: true },
  { value: "mountainrailway", label: "Mountain railway", desc: "3D alpine valley at sunset: a train in your colour crosses a stone viaduct, disappears into a tunnel and stops at the station; at night lit windows, the village and the floodlit viaduct", three: true },
  { value: "windfarm", label: "Offshore wind farm", desc: "3D wind farm at sea at sunset: turbines turning over the glittering water, a service boat in your colour between the towers; at night their red lights blink in sync and shine in the sea", three: true },
  { value: "fairground", label: "Fairground at dusk", desc: "3D seaside fair at dusk: a Ferris wheel turning, a roller coaster racing through its loop, a carousel and swings; at night every bulb lights up in your colour and shines on the wet promenade", three: true },
  { value: "racecircuit", label: "Night race circuit", desc: "3D street circuit by the harbour: race cars in your colour brake into the hairpin and roar down the straights, one dives into the pits; golden hour by day, floodlights and a glittering bay at night", three: true },
  { value: "bambooforest", label: "Bamboo forest", desc: "3D bamboo grove: tall stalks swaying in the wind, light shafts and mist along a stone path up to a shrine gate in your colour; at night stone lanterns glow and fireflies drift", three: true },
  { value: "desertcaravan", label: "Desert caravan", desc: "3D golden dunes at sunset: a camel caravan in your colour walks a dune crest above an oasis, sand blowing off the ridges; at night the Milky Way arches over the dunes and a campfire glows", three: true },
  { value: "none", label: "None", desc: "Plain background" },
];
export const BG_KEYS = BG_STYLES.map((b) => b.value);
export const THREE_STYLES = new Set(BG_STYLES.filter((b) => b.three).map((b) => b.value));

/**
 * Admin settings: which styles users may pick, the default, whether the default is forced on everyone, the order
 * the styles are listed in, and the admin's own titles and descriptions (English and Chinese).
 */
export const DEFAULT_BG_SETTINGS = { enabled: BG_KEYS.slice(), default: "aurora", locked: false };

/** Lengths the admin's texts may have. */
export const BG_TITLE_MAX = 60;
export const BG_DESC_MAX = 160;
/** The languages the admin writes in: "en" and "zh" (the site's zh-CN). */
export const BG_LANGS = ["en", "zh"];

/**
 * The admin's look for every background, for everyone: animation speed (×1 = as built), one colour instead of each
 * user's accent colour (null: follow the user), and brightness (×1 = as built).
 */
export const BG_LOOK_DEFAULT = { speed: 1, color: null, brightness: 1 };
export const BG_SPEED = { min: 0.25, max: 2, step: 0.25 };
export const BG_BRIGHTNESS = { min: 0.5, max: 1.5, step: 0.05 };
export const isHexColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

function cleanLook(raw) {
  const l = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const num = (v, range) => (typeof v === "number" && Number.isFinite(v) ? Math.min(range.max, Math.max(range.min, v)) : 1);
  return { speed: num(l.speed, BG_SPEED), color: isHexColor(l.color) ? l.color.toLowerCase() : null, brightness: num(l.brightness, BG_BRIGHTNESS) };
}

/** A value inside a range (the per-style values are dropped rather than clamped when they are not). */
export const inBgRange = (v, range) => typeof v === "number" && Number.isFinite(v) && v >= range.min && v <= range.max;

/**
 * One style's own values: only the ones it has; the others follow the look for all backgrounds.
 * `color` null (present) means each user's accent colour even when all backgrounds have one colour.
 */
function cleanOwnLook(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const own = {};
  if (inBgRange(raw.speed, BG_SPEED)) own.speed = raw.speed;
  if (inBgRange(raw.brightness, BG_BRIGHTNESS)) own.brightness = raw.brightness;
  if (raw.color === null) own.color = null;
  else if (isHexColor(raw.color)) own.color = raw.color.toLowerCase();
  return Object.keys(own).length ? own : null;
}

function cleanLooks(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of BG_KEYS) {
    const own = cleanOwnLook(raw[key]);
    if (own) out[key] = own;
  }
  return out;
}

/** The look a style is shown with: its own values where it has them, the look for all backgrounds for the rest. */
export function effectiveLook(settings, style) {
  const base = settings?.look ?? BG_LOOK_DEFAULT;
  const own = settings?.looks?.[style];
  if (!own) return base;
  return {
    speed: own.speed ?? base.speed,
    brightness: own.brightness ?? base.brightness,
    color: Object.hasOwn(own, "color") ? own.color : base.color,
  };
}

/** "#rrggbb" mixed towards black (t < 0) or white (t > 0). */
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const target = t < 0 ? 0 : 255;
  const mix = (c) => Math.round(c + (target - c) * Math.abs(t));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("");
}

/**
 * The look as styles on a background layer: a brightness filter, and the accent variables the backgrounds colour
 * themselves with (the rest of the app keeps each user's accent). Speed is applied by the components themselves.
 */
export function bgLookStyle(look) {
  const style = {};
  if (look?.brightness && look.brightness !== 1) style.filter = `brightness(${look.brightness})`;
  if (isHexColor(look?.color)) {
    style["--accent"] = look.color;
    style["--accent-strong"] = shade(look.color, -0.18);
    style["--accent-soft"] = shade(look.color, 0.72);
  }
  return style;
}

/** Every style once, in the admin's order; styles added since the admin last saved come after, in their built-in order. */
function cleanOrder(raw) {
  const seen = new Set();
  const order = [];
  if (Array.isArray(raw)) for (const k of raw) if (BG_KEYS.includes(k) && !seen.has(k)) { seen.add(k); order.push(k); }
  for (const k of BG_KEYS) if (!seen.has(k)) order.push(k);
  return order;
}

/** { key: { title: { en, zh }, desc: { en, zh } } } with only the texts the admin wrote (blank keeps the built-in one). */
function cleanNames(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of BG_KEYS) {
    const n = raw[key];
    if (!n || typeof n !== "object") continue;
    const entry = {};
    for (const [field, max] of [["title", BG_TITLE_MAX], ["desc", BG_DESC_MAX]]) {
      const texts = {};
      for (const lang of BG_LANGS) {
        const v = n[field]?.[lang];
        const text = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
        if (text) texts[lang] = text;
      }
      if (Object.keys(texts).length) entry[field] = texts;
    }
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

export function normaliseBgSettings(raw) {
  const s = { ...DEFAULT_BG_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  const order = cleanOrder(s.order);
  // styles added after the admin last saved (not in `known`) stay enabled until the admin decides
  const known = Array.isArray(s.known) ? s.known : null;
  let enabled = Array.isArray(s.enabled) ? order.filter((k) => s.enabled.includes(k) || (known && !known.includes(k))) : order.slice();
  if (!enabled.length) enabled = ["none"];
  const def = enabled.includes(s.default) ? s.default : enabled[0];
  return { enabled, default: def, locked: Boolean(s.locked), order, names: cleanNames(s.names), look: cleanLook(s.look), looks: cleanLooks(s.looks) };
}

/** The styles in the admin's order. */
export function orderedStyles(settings) {
  return normaliseBgSettings(settings).order.map((k) => BG_STYLES.find((b) => b.value === k)).filter(Boolean);
}

/** A style's title and description: the admin's words for this language, else the built-in text (`tr` translates it). */
export function bgText(style, settings, locale, tr) {
  const b = typeof style === "string" ? BG_STYLES.find((x) => x.value === style) : style;
  if (!b) return { title: String(style ?? ""), desc: "" };
  const n = settings?.names?.[b.value];
  const lang = locale === "zh-CN" ? "zh" : "en";
  return { title: n?.title?.[lang] || tr(b.label), desc: n?.desc?.[lang] || tr(b.desc) };
}

/** The style a browser should actually show, given the user's preference and the admin settings. */
export function resolveBackground(pref, settings) {
  const s = settings ? normaliseBgSettings(settings) : DEFAULT_BG_SETTINGS;
  if (s.locked) return s.default;
  return s.enabled.includes(pref) ? pref : s.default;
}
