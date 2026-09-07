"use client";
import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";

/** true when rendering inside a split-view pane (/embed/*). */
export const EmbedContext = createContext(false);
export const useEmbed = () => useContext(EmbedContext);

/** Router wrapper that keeps programmatic navigation inside /embed when in a pane. */
export function useNav() {
  const router = useRouter();
  const embed = useEmbed();
  return useMemo(() => {
    const prefix = embed ? "/embed" : "";
    const fix = (href) => (href.startsWith("/") && !href.startsWith("/embed") ? prefix + href : href);
    return {
      embed,
      push: (href) => router.push(fix(href)),
      replace: (href) => router.replace(fix(href)),
      back: () => router.back(),
      href: fix,
    };
  }, [router, embed]);
}
