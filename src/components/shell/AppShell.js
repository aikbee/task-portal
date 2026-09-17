"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import ThemeApplier from "./ThemeApplier";
import AnimatedBackground from "./AnimatedBackground";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import PinBar from "./PinBar";
import WorkspaceBanner from "./WorkspaceBanner";
import BottomBar from "./BottomBar";
import PreferencesDrawer from "./PreferencesDrawer";
import LockScreen from "./LockScreen";
import BackgroundOnly from "./BackgroundOnly";
import SplitView from "./SplitView";
import ToolWorkspace from "./ToolWorkspace";
import TimerEngine from "./TimerEngine";
import { usePrefs, useUI } from "@/lib/store";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/hooks";
import { AuthProvider } from "@/lib/auth-context";
import { ChatLiveProvider } from "./ChatLive";

/** The Google callback lands on /?google=linked|taken after connecting an account: show the result once. */
function GoogleLinkNotice() {
  const result = useSearchParams().get("google");
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  useEffect(() => {
    if (!result) return;
    if (result === "linked") toastRef.current.success("Google account connected", "You can now sign in with Google.");
    else if (result === "taken") toastRef.current.error("Google account not connected", "That Google account is already linked to another user.");
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [result]);
  return null;
}

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
    api.get("/api/stats").then((s) => setCounts({ projects: s.counts.projects, requirements: s.counts.requirements, employees: s.counts.employees, tasks: s.counts.tasks, info: s.counts.info, drawboards: s.counts.drawboards, chat: s.counts.chat || null, moderation: s.counts.moderation || null, backups: s.counts.backups || null })).catch(() => {});
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
    <ChatLiveProvider locked={locked}>
      <ThemeApplier />
      <AnimatedBackground />
      {locked ? null : (
        <div className="app-shell relative z-10 flex h-dvh overflow-clip" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
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
      <BackgroundOnly />
      <Suspense fallback={null}>
        <GoogleLinkNotice />
      </Suspense>
    </ChatLiveProvider>
    </ToastProvider>
    </AuthProvider>
  );
}
