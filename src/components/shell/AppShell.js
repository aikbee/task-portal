"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import ThemeApplier from "./ThemeApplier";
import AnimatedBackground from "./AnimatedBackground";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import PinBar from "./PinBar";
import WorkspaceBanner from "./WorkspaceBanner";
import BottomBar from "./BottomBar";
import PreferencesDrawer from "./PreferencesDrawer";
import LockScreen from "./LockScreen";
import SplitView from "./SplitView";
import ToolWorkspace from "./ToolWorkspace";
import TimerEngine from "./TimerEngine";
import { usePrefs, useUI } from "@/lib/store";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/hooks";
import { AuthProvider } from "@/lib/auth-context";

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export default function AppShell({ user, children }) {
  const pathname = usePathname();
  const toggleSidebar = usePrefs((s) => s.toggleSidebar);
  const lock = usePrefs((s) => s.lock);
  const togglePrefs = useUI((s) => s.togglePrefs);
  const toggleTool = useUI((s) => s.toggleTool);
  const closeTool = useUI((s) => s.closeTool);
  const setCounts = useUI((s) => s.setCounts);
  const setPrefsOpen = useUI((s) => s.setPrefsOpen);
  const mounted = useMounted();
  const lockedPref = usePrefs((s) => s.locked && Boolean(s.pinHash));
  // While locked the whole app (pages, panes, bars) is unmounted, not just hidden.
  const locked = mounted && lockedPref;

  useEffect(() => {
    if (!locked) return;
    setPrefsOpen(false);
    closeTool();
  }, [locked, setPrefsOpen, closeTool]);

  // refresh sidebar counts whenever the route changes (cheap, local DB)
  useEffect(() => {
    api.get("/api/stats").then((s) => setCounts({ projects: s.counts.projects, requirements: s.counts.requirements, employees: s.counts.employees, tasks: s.counts.tasks, info: s.counts.info, drawboards: s.counts.drawboards })).catch(() => {});
  }, [pathname, setCounts]);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (usePrefs.getState().locked) return; // the lock screen owns the keyboard
      if (meta && e.shiftKey && e.key.toLowerCase() === "l") { e.preventDefault(); lock(); }
      else if (meta && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
      else if (meta && e.key === ",") { e.preventDefault(); togglePrefs(); }
      else if (meta && e.key.toLowerCase() === "j") { e.preventDefault(); toggleTool("notes"); }
      else if (e.key === "?" && !isTyping(e)) { e.preventDefault(); toggleTool("shortcuts"); }
      else if (e.key === "Escape") { closeTool(); setPrefsOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, togglePrefs, toggleTool, closeTool, setPrefsOpen, lock]);

  return (
    <AuthProvider user={user}>
    <ToastProvider>
      <ThemeApplier />
      <AnimatedBackground />
      {locked ? null : (
        <div className="app-shell relative z-10 flex h-dvh overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <PinBar />
            <WorkspaceBanner />
            <SplitView>{children}</SplitView>
            <BottomBar />
          </div>
        </div>
      )}
      {locked ? null : <PreferencesDrawer />}
      {locked ? null : <ToolWorkspace />}
      <TimerEngine />
      <LockScreen />
    </ToastProvider>
    </AuthProvider>
  );
}
