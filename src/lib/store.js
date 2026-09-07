"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const ACCENTS = {
  indigo: { label: "Indigo", value: "#6366f1", strong: "#4f46e5", soft: "#c7d2fe" },
  violet: { label: "Violet", value: "#8b5cf6", strong: "#7c3aed", soft: "#ddd6fe" },
  cyan: { label: "Cyan", value: "#06b6d4", strong: "#0891b2", soft: "#a5f3fc" },
  emerald: { label: "Emerald", value: "#10b981", strong: "#059669", soft: "#a7f3d0" },
  rose: { label: "Rose", value: "#f43f5e", strong: "#e11d48", soft: "#fecdd3" },
  amber: { label: "Amber", value: "#f59e0b", strong: "#d97706", soft: "#fde68a" },
  sky: { label: "Sky", value: "#0ea5e9", strong: "#0284c7", soft: "#bae6fd" },
  pink: { label: "Pink", value: "#ec4899", strong: "#db2777", soft: "#fbcfe8" },
};

export const RADII = { sm: "8px", md: "14px", lg: "20px" };

export const DEFAULT_PREFS = {
  theme: "system", // light | dark | system
  accent: "indigo",
  bgStyle: "aurora", // aurora | orbs | grid | none
  bgAnimate: true,
  bgIntensity: "normal", // subtle | normal | vivid
  glass: true,
  density: "comfortable", // comfortable | compact
  radius: "md",
  sidebarCollapsed: false,
  pageSize: 10,
  reduceMotion: false,
  showBottomBar: true,
  showPinBar: true,
  promoDismissed: false, // "Make it yours" card in the sidebar
  timerFocusMin: 25, // pomodoro focus length
  timerBreakMin: 5, // pomodoro break / cooldown length
  timerAlert: "modal", // modal | toast | none — what happens when a session ends
  timerSound: true,
  timerNotify: false, // desktop notification (asks permission)
  timerAutoNext: false, // start the next session automatically
  splitCount: 1, // 1 | 2 | 3 pages side by side
  splitPanes: [{ id: "p2", path: "/tasks" }, { id: "p3", path: "/employees" }], // pages shown in pane 2 and 3
  splitSizes: [50, 25, 25], // width % of main pane + pane 2 + pane 3
  lockTheme: "system", // lock screen appearance: system (follow app) | light | dark
  autosaveSeconds: 3, // outputs & sticky notes save this long after you stop typing (0 = manual)
  boardGroupBy: "status", // status | priority | assignee
  boardCompact: false, // compact cards on the board
  calendarView: "month", // month | week | agenda
  calendarHideDone: false,
  calendarShowDeadlines: true, // project end dates on the calendar
  notifySound: true, // chime on new notifications
  notifyDesktop: false, // browser notifications (asks permission)
};

export const MAX_SPLIT = 3;

/** Security settings live outside DEFAULT_PREFS so "Reset preferences" never disables the lock. */
export const SECURITY_DEFAULTS = {
  pinHash: null,
  pinSalt: null,
  pinLength: 0,
  lockEnabled: false,
  autoLockMinutes: 0, // 0 = never
  locked: false,
};

export const MAX_PINS = 12;
export const PREFS_STORAGE_KEY = "admin-portal-prefs";

/** Persisted user preferences (theme, layout, table column visibility, pinned pages). */
export const usePrefs = create(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      ...SECURITY_DEFAULTS,
      tables: {}, // { [tableId]: { [columnKey]: boolean } }
      tableSorts: {}, // { [tableId]: { key, dir } } — user-chosen default sort per table
      pins: [], // [{ href, label, module }]
      set: (patch) => set(patch),
      lock: () => get().pinHash && set({ locked: true }),
      unlock: () => set({ locked: false }),
      setPin: ({ pinHash, pinSalt, pinLength }) => set({ pinHash, pinSalt, pinLength, lockEnabled: true }),
      clearPin: () => set({ ...SECURITY_DEFAULTS }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setColumnVisibility: (tableId, visibility) => set({ tables: { ...get().tables, [tableId]: visibility } }),
      clearTables: () => set({ tables: {}, tableSorts: {} }),
      setTableSort: (tableId, sort) => {
        const next = { ...get().tableSorts };
        if (sort) next[tableId] = sort;
        else delete next[tableId];
        set({ tableSorts: next });
      },
      reset: () => set({ ...DEFAULT_PREFS }),

      isPinned: (href) => get().pins.some((p) => p.href === href),
      togglePin: (pin) => {
        const pins = get().pins;
        if (pins.some((p) => p.href === pin.href)) return set({ pins: pins.filter((p) => p.href !== pin.href) });
        set({ pins: [...pins, pin].slice(-MAX_PINS) });
      },
      removePin: (href) => set({ pins: get().pins.filter((p) => p.href !== href) }),
      updatePinLabel: (href, label) => {
        const pins = get().pins;
        if (!pins.some((p) => p.href === href && p.label !== label)) return;
        set({ pins: pins.map((p) => (p.href === href ? { ...p, label } : p)) });
      },
      movePin: (from, to) => {
        const pins = [...get().pins];
        if (from === to || from < 0 || to < 0 || from >= pins.length || to >= pins.length) return;
        const [x] = pins.splice(from, 1);
        pins.splice(to, 0, x);
        set({ pins });
      },
      clearPins: () => set({ pins: [] }),

      setSplitCount: (n) => set({ splitCount: Math.max(1, Math.min(MAX_SPLIT, n)) }),
      setPanePath: (index, path) => {
        const panes = get().splitPanes.map((p, i) => (i === index ? { ...p, path: path || "/" } : p));
        set({ splitPanes: panes });
      },
      /** Show a page in the next free pane (or replace the last pane when all are in use). */
      openInPane: (path) => {
        const { splitCount, splitPanes } = get();
        const index = Math.min(splitCount - 1, MAX_SPLIT - 2);
        const panes = splitPanes.map((p, i) => (i === index ? { id: `p${Date.now()}`, path } : p));
        set({ splitPanes: panes, splitCount: Math.min(MAX_SPLIT, splitCount + 1) });
      },
      closePane: (index) => {
        const { splitCount, splitPanes } = get();
        const panes = splitPanes.filter((_, i) => i !== index);
        panes.push({ id: `p${Date.now()}`, path: "/tasks" });
        set({ splitPanes: panes, splitCount: Math.max(1, splitCount - 1) });
      },
      setSplitSizes: (sizes) => set({ splitSizes: sizes }),
    }),
    { name: PREFS_STORAGE_KEY }
  )
);

/** Ephemeral UI state (open panels, page metadata for the top bar, shared data). */
export const useUI = create((set, get) => ({
  prefsOpen: false,
  activeTool: null, // notes | timer | calc | shortcuts
  pageMeta: { title: "", crumbs: [] },
  counts: null,
  unread: 0, // unread notifications (kept fresh by the bell)
  secretsUnlockedUntil: null, // ISO time until which secrets reveal without re-verifying
  notes: null, // all sticky notes (loaded once, kept in sync by the notes tool)
  // remaining === null means "full configured duration for the current mode"
  timer: { running: false, endsAt: null, remaining: null, mode: "work" },
  mobileNav: false, // off-canvas sidebar on small screens
  installPrompt: null, // deferred `beforeinstallprompt` event, when the browser offers PWA install

  setMobileNav: (v) => set({ mobileNav: v }),
  toggleMobileNav: () => set({ mobileNav: !get().mobileNav }),
  setInstallPrompt: (e) => set({ installPrompt: e }),
  setPrefsOpen: (v) => set({ prefsOpen: v }),
  togglePrefs: () => set({ prefsOpen: !get().prefsOpen }),
  setActiveTool: (t) => set({ activeTool: t }),
  toggleTool: (t) => set({ activeTool: get().activeTool === t ? null : t }),
  closeTool: () => set({ activeTool: null }),
  setPageMeta: (meta) => set({ pageMeta: meta }),
  setCounts: (counts) => set({ counts }),
  setUnread: (unread) => set({ unread }),
  setSecretsUnlockedUntil: (t) => set({ secretsUnlockedUntil: t }),
  setNotes: (notes) => set({ notes: typeof notes === "function" ? notes(get().notes ?? []) : notes }),
  setTimer: (patch) => set({ timer: { ...get().timer, ...(typeof patch === "function" ? patch(get().timer) : patch) } }),
}));
