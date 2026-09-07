"use client";
import { useEffect } from "react";
import { useUI } from "@/lib/store";

/**
 * Registers the service worker (production only, so dev never serves stale chunks)
 * and keeps the browser's install prompt around for the "Install app" menu item.
 */
export default function PwaRegister() {
  const setInstallPrompt = useUI((s) => s.setInstallPrompt);
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setInstallPrompt]);
  return null;
}
