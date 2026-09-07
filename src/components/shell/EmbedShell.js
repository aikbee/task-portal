"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EmbedContext } from "@/lib/nav";
import { AuthProvider } from "@/lib/auth-context";
import { useUI } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";
import ThemeApplier from "./ThemeApplier";

/**
 * Minimal shell for split-view panes (rendered inside an iframe at /embed/*).
 * - keeps internal links inside /embed
 * - reports its current page to the parent window (pane header + persistence)
 * - relays user activity so the parent's auto-lock timer stays accurate
 */
export default function EmbedShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = useUI((s) => s.pageMeta.title);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.embed = "true";
    el.dataset.locked = "false"; // the parent window owns the lock screen and covers this frame
  }, []);

  useEffect(() => {
    const path = pathname.replace(/^\/embed/, "") || "/";
    window.parent?.postMessage({ type: "task-portal:pane", path, title }, window.location.origin);
  }, [pathname, title]);

  // Rewrite in-app links (<Link href="/tasks/8">) to stay inside the pane.
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("/embed") || href.startsWith("/api")) return;
      e.preventDefault();
      e.stopPropagation();
      router.push("/embed" + (href === "/" ? "" : href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  useEffect(() => {
    let last = 0;
    const bump = () => {
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      window.parent?.postMessage({ type: "task-portal:activity" }, window.location.origin);
    };
    const events = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, bump, { capture: true }));
  }, []);

  return (
    <EmbedContext.Provider value={true}>
      <AuthProvider user={user}>
      <ToastProvider>
        <ThemeApplier />
        <div className="embed-bg" aria-hidden />
        <div className="relative z-10 min-h-screen px-4 py-4">{children}</div>
      </ToastProvider>
      </AuthProvider>
    </EmbedContext.Provider>
  );
}
