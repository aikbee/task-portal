"use client";
import { useId } from "react";

/**
 * Brand mark: a "portal" ring with a check passing out through its opening.
 * Follows the user's accent colour in-app; the favicon uses the fixed indigo→violet.
 * Keep the paths in sync with src/app/icon.svg.
 */
export default function Logo({ size = 40, className, title = "Task Portal" }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent, #6366f1)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent-strong, #7c3aed)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path d="M48.94 30.52 A17 17 0 1 1 37.81 16.03" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="6.5" strokeLinecap="round" />
      <polyline points="21 33 29.5 41.5 47.5 19" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
