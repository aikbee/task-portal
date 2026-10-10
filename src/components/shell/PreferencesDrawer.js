"use client";
import { Sun, Moon, Monitor, Check, RotateCcw, Sparkles, Rows3, LayoutGrid, Waves, CircleDashed, Grid3x3, Ban, Timer, Lock, PenLine, Bell, Wind, Blend, Star, Hexagon, Droplets, Sunrise, Shuffle, Gauge, CloudRain, Snowflake, Mountain, Cpu, PartyPopper, ShieldCheck, Orbit, MountainSnow, Gem, Globe, Zap, TreePalm, Sailboat, Wallpaper, Lollipop, Heart, Fish, Ghost, Aperture, Flame, Eclipse, Table2, Sprout, Car, BrainCircuit, CloudSnow, Cat, TentTree, FishSymbol, Scroll, Umbrella, LampCeiling, TreePine, TowerControl, Cog, Flower, Telescope, Balloon, Turtle, MoonStar, Ship, Sunset, Building2, Factory, Bot, Rocket, Container, PlaneLanding, TrainFrontTunnel, Fan, FerrisWheel, Flag, LeafyGreen, Tent, CableCar, createLucideIcon } from "lucide-react";
import { normaliseBgSettings, orderedStyles, bgText } from "@/lib/backgrounds";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import { Toggle, Segmented, Select, Field, Input } from "@/components/ui/Controls";
import { Divider } from "@/components/ui/Misc";
import { usePrefs, useUI, ACCENTS } from "@/lib/store";
import {LOCALES, switchLocale, useLocale, useT } from "@/lib/i18n";
import PinSettings from "./PinSettings";
import TimerAlertSettings from "./tools/TimerSettings";
import NotificationSettings from "./NotificationSettings";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

// lucide has no volcano: a cone, lava down its flank, a plume drifting off the crater (drawn on its 24 × 24 grid, stroke 2)
const Volcano = createLucideIcon("volcano", [["path", { d: "m2 21 7-12h6l7 12Z", key: "vi-cone" }], ["path", { d: "M12 9v4.5l-2 3", key: "vi-lava" }], ["path", { d: "M8.5 6a3 3 0 0 1 5.2-2.5 3 3 0 0 1 5.3 1.7", key: "vi-plume" }]]);
// nor a waterfall: a cliff, water arcing off its ledge into a splash, two drops of spray
const Waterfall = createLucideIcon("waterfall", [["path", { d: "M3 21V4h8", key: "wf-cliff" }], ["path", { d: "M11 4c3 0 5 2 5 6v8", key: "wf-fall" }], ["path", { d: "M8 21c2-1 4-1 6 0s4 1 6 0", key: "wf-pool" }], ["path", { d: "M19 13v.01", key: "wf-d1" }], ["path", { d: "M21 16v.01", key: "wf-d2" }]]);
// nor a dinosaur: a long-necked sauropod, tail to head, two legs
const Dinosaur = createLucideIcon("dinosaur", [["path", { d: "M2 17c3-1 4-3 5-5 2-3 6-3 8-1 1.5-3 2-6 4-7h2", key: "dv-back" }], ["path", { d: "M8 14h6", key: "dv-belly" }], ["path", { d: "M8 14v6", key: "dv-leg1" }], ["path", { d: "M14 14v6", key: "dv-leg2" }]]);
// nor a city of the future: pointed towers on a skyline, two flying cars passing
const FutureCity = createLucideIcon("future-city", [["path", { d: "M3 21h18", key: "fc-ground" }], ["path", { d: "M5 21V12l3-2v11", key: "fc-t1" }], ["path", { d: "M10 21V6l2-3 2 3v15", key: "fc-t2" }], ["path", { d: "M16 21v-9h3v9", key: "fc-t3" }], ["path", { d: "M2 8h4", key: "fc-car1" }], ["path", { d: "M18 6h4", key: "fc-car2" }]]);
// nor a floating island: a flat top with two pines on it, its underside tapering to a jagged point
const FloatIsland = createLucideIcon("float-island", [["path", { d: "M3 10h18l-4 4-2 1-3 5-3-5-2-1Z", key: "fi-isle" }], ["path", { d: "M8 10V8", key: "fi-t1" }], ["path", { d: "M8 3 5.5 8h5Z", key: "fi-c1" }], ["path", { d: "M15 10V7.5", key: "fi-t2" }], ["path", { d: "M15 4.5 13 7.5h4Z", key: "fi-c2" }]]);
const BG_ICONS = { aurora: Wind, mesh: Blend, orbs: CircleDashed, bubbles: Droplets, stars: Star, waves: Waves, hexagons: Hexagon, sunrise: Sunrise, grid: Grid3x3, rain: CloudRain, snow: Snowflake, topography: Mountain, circuit: Cpu, confetti: PartyPopper, galaxy: Orbit, terrain: MountainSnow, crystals: Gem, earth: Globe, neon: Zap, island: TreePalm, bloodmoon: Moon, ocean: Sailboat, balloons: Lollipop, hearts: Heart, jellyfish: Fish, ghosts: Ghost, portal: Aperture, wisps: Flame, saturn: Eclipse, nebula: Sparkles, orbits: Sun, meadow: Sprout, citydrive: Car, neural: BrainCircuit, frostpeaks: CloudSnow, luckycat: Cat, campsite: TentTree, koipond: FishSymbol, inkwash: Scroll, rainwindow: Umbrella, skylanterns: LampCeiling, snowglobe: TreePine, lighthouse: TowerControl, clockwork: Cog, sakura: Flower, observatory: Telescope, hotair: Balloon, reef: Turtle, northernlights: MoonStar, venice: Ship, santorini: Sunset, paris: Building2, steamengine: Factory, robotfactory: Bot, v8engine: Gauge, rocketlaunch: Rocket, containerport: Container, airport: PlaneLanding, mountainrailway: TrainFrontTunnel, windfarm: Fan, fairground: FerrisWheel, racecircuit: Flag, bambooforest: LeafyGreen, desertcaravan: Tent, skiresort: CableCar, volcanoisland: Volcano, waterfall: Waterfall, dinovalley: Dinosaur, futurecity: FutureCity, floatislands: FloatIsland, none: Ban };

export default function PreferencesDrawer() {
  const tr = useT();
  const open = useUI((s) => s.prefsOpen);
  const setOpen = useUI((s) => s.setPrefsOpen);
  const setBgOnly = useUI((s) => s.setBgOnly);
  const prefs = usePrefs();
  const toast = useToast();
  const locale = useLocale();
  const bgRaw = useUI((s) => s.bgSettings);
  const bg = normaliseBgSettings(bgRaw);
  // in the admin's order, with the admin's titles and descriptions where there are any
  const bgChoices = orderedStyles(bg).filter((b) => bg.enabled.includes(b.value));

  return (
    <Drawer open={open} onClose={() => setOpen(false)} title={tr("Preferences")} description={tr("Personalise the workspace. Saved in this browser.")}>
      <div className="space-y-6">
        <Section title={tr("Appearance")} icon={Sparkles}>
          <Field label={tr("Language")}>
            <Segmented
              value={locale}
              onChange={(v) => v !== locale && switchLocale(v)}
              options={Object.entries(LOCALES).map(([value, label]) => ({ value, label }))}
              className="w-full"
            />
          </Field>
          <Field label={tr("Theme")}>
            <Segmented
              value={prefs.theme}
              onChange={(v) => prefs.set({ theme: v })}
              options={[
                { value: "light", label: tr("Light"), icon: Sun },
                { value: "dark", label: tr("Dark"), icon: Moon },
                { value: "system", label: tr("System"), icon: Monitor },
              ]}
              className="w-full"
            />
          </Field>
          <Field label={tr("Accent colour")}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCENTS).map(([key, a]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => prefs.set({ accent: key })}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-white transition hover:scale-110",
                    prefs.accent === key && "ring-2 ring-offset-2 ring-offset-surface"
                  )}
                  style={{ background: `linear-gradient(135deg, ${a.value}, ${a.strong})`, "--tw-ring-color": a.value }}
                  data-tip={tr(a.label)}
                >
                  {prefs.accent === key ? <Check size={14} strokeWidth={3} /> : null}
                </button>
              ))}
            </div>
          </Field>
          <Field label={tr("Corner radius")}>
            <Segmented
              value={prefs.radius}
              onChange={(v) => prefs.set({ radius: v })}
              options={[
                { value: "sm", label: tr("Sharp") },
                { value: "md", label: tr("Rounded") },
                { value: "lg", label: tr("Soft") },
              ]}
              className="w-full"
            />
          </Field>
          <Toggle checked={prefs.glass} onChange={(v) => prefs.set({ glass: v })} label={tr("Frosted glass panels")} description={tr("Translucent, blurred surfaces")} />
        </Section>

        <Divider />

        <Section title={tr("Background")} icon={Waves}>
          {bg.locked ? (
            <p className="pref-note flex items-start gap-2 rounded-app border border-line bg-surface-2/60 p-3 text-xs text-fg-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" /> {tr("Your administrator has set the background for everyone.")}</p>
          ) : null}
          <div className={cn("grid grid-cols-2 gap-2", bg.locked && "hidden")}>
            {bgChoices.map((b) => {
              const Icon = BG_ICONS[b.value] ?? Ban;
              const active = prefs.bgStyle === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => prefs.set({ bgStyle: b.value })}
                  className={cn(
                    "pref-choice flex items-start gap-2.5 rounded-app border p-3 text-left transition",
                    active ? "is-active border-accent bg-accent/8 ring-1 ring-accent/40" : "border-line hover:bg-surface-2"
                  )}
                >
                  <Icon size={16} className={cn("mt-px shrink-0", active ? "text-accent" : "text-fg-muted")} />
                  <span>
                    <span className="block text-xs font-medium">{bgText(b, bg, locale, tr).title}</span>
                    <span className="block text-[11px] text-fg-muted">{bgText(b, bg, locale, tr).desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Field label={tr("Intensity")} className="flex-1">
              <Segmented
                size="sm"
                value={prefs.bgIntensity}
                onChange={(v) => prefs.set({ bgIntensity: v })}
                options={[
                  { value: "subtle", label: tr("Subtle") },
                  { value: "normal", label: tr("Normal") },
                  { value: "vivid", label: tr("Vivid") },
                ]}
                className="w-full"
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              icon={Shuffle}
              className={cn("mt-5", bg.locked && "hidden")}
              onClick={() => {
                const pool = bgChoices.filter((b) => b.value !== "none" && b.value !== prefs.bgStyle);
                if (pool.length) prefs.set({ bgStyle: pool[Math.floor(Math.random() * pool.length)].value });
              }}
            >
              {tr("Shuffle")}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={Wallpaper}
            className="w-full"
            onClick={() => {
              setOpen(false);
              setBgOnly(true);
            }}
          >
            {tr("Show background only")}
          </Button>
          <p className="-mt-1 text-[11px] text-fg-muted">{tr("Hides everything except the background; click or press any key to return.")}</p>
          <Toggle checked={prefs.bgAnimate} onChange={(v) => prefs.set({ bgAnimate: v })} label={tr("Animate background")} description={tr("Pause to save battery")} />
          <Toggle checked={prefs.reduceMotion} onChange={(v) => prefs.set({ reduceMotion: v })} label={tr("Reduce motion")} description={tr("Disable UI transitions")} />
        </Section>

        <Divider />

        <Section title={tr("Layout")} icon={LayoutGrid}>
          <Field label="Density">
            <Segmented
              value={prefs.density}
              onChange={(v) => prefs.set({ density: v })}
              options={[
                { value: "comfortable", label: tr("Comfortable"), icon: LayoutGrid },
                { value: "compact", label: tr("Compact"), icon: Rows3 },
              ]}
              className="w-full"
            />
          </Field>
          <Field label={tr("Table style")} hint={tr(prefs.tableTheme === "modern" ? "Floating rows, pill filters and a bigger search field" : "Compact bordered rows with the search and filters in one bar")}>
            <Segmented
              value={prefs.tableTheme === "modern" ? "modern" : "classic"}
              onChange={(v) => prefs.set({ tableTheme: v })}
              options={[
                { value: "classic", label: tr("Classic"), icon: Table2 },
                { value: "modern", label: tr("Modern"), icon: Sparkles },
              ]}
              className="w-full"
            />
          </Field>
          <Toggle checked={prefs.sidebarCollapsed} onChange={(v) => prefs.set({ sidebarCollapsed: v })} label={tr("Collapse sidebar")} description={tr("Icons only")} />
          <Toggle checked={prefs.showBottomBar} onChange={(v) => prefs.set({ showBottomBar: v })} label={tr("Show bottom bar")} description={tr("Sticky notes and utilities")} />
          <Field label={tr("Split view")} hint={tr("Show other pages beside the main one; drag the dividers to resize")}>
            <Segmented
              value={prefs.splitCount}
              onChange={(v) => prefs.setSplitCount(v)}
              options={[
                { value: 1, label: tr("1 page") },
                { value: 2, label: tr("2 pages") },
                { value: 3, label: tr("3 pages") },
              ]}
              className="w-full"
            />
          </Field>
          <Toggle checked={prefs.showPinBar} onChange={(v) => prefs.set({ showPinBar: v })} label={tr("Show pinned pages bar")} description={tr("Quick-switch strip under the header")} />
          <Toggle checked={!prefs.promoDismissed} onChange={(v) => prefs.set({ promoDismissed: !v })} label={tr("Show sidebar tip card")} description={tr("The “Make it yours” card")} />
          <Field label={tr("Default rows per page")}>
            <Select value={prefs.pageSize} onChange={(e) => prefs.set({ pageSize: Number(e.target.value) })}>
              {[5, 10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} rows</option>
              ))}
            </Select>
          </Field>
        </Section>

        <Divider />

        <Section title={tr("Notifications")} icon={Bell}>
          <NotificationSettings />
        </Section>

        <Divider />

        <Section title={tr("Editing")} icon={PenLine}>
          <Field label={tr("Autosave delay")} hint={tr("Task outputs and sticky notes save this long after you stop typing. Blur, ⌘S or the Save button save immediately.")}>
            <Select value={prefs.autosaveSeconds} onChange={(e) => prefs.set({ autosaveSeconds: Number(e.target.value) })}>
              {[[0, "Manual only (no autosave)"], [1, "1 second"], [2, "2 seconds"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </Section>

        <Divider />

        <Section title={tr("Lock screen")} icon={Lock}>
          <PinSettings />
        </Section>

        <Divider />

        <Section title={tr("Timer")} icon={Timer}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Focus (minutes)")}>
              <Input type="number" min={1} max={180} value={prefs.timerFocusMin} onChange={(e) => prefs.set({ timerFocusMin: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label={tr("Cooldown (minutes)")}>
              <Input type="number" min={1} max={180} value={prefs.timerBreakMin} onChange={(e) => prefs.set({ timerBreakMin: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} />
            </Field>
          </div>
          <TimerAlertSettings />
        </Section>

        <Divider />

        <Section title={tr("Reset")}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                prefs.reset();
                toast.success("Preferences reset");
              }}
            >
              {tr("Reset preferences")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                prefs.clearTables();
                toast.success("Table layouts cleared", "Columns and default sorts");
              }}
            >
              {tr("Clear table layouts")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                prefs.clearPins();
                toast.success("Pinned pages cleared");
              }}
            >
              {tr("Clear pinned pages")}
            </Button>
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="pref-section space-y-3.5">
      <h3 className="pref-title flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        {Icon ? <span className="pref-title-icon inline-grid place-items-center"><Icon size={13} /></span> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The icon of each background style (the admin's Backgrounds page lists them too). */
export { BG_ICONS };
