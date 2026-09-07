/** Web app manifest (served at /manifest.webmanifest) so the portal can be installed as a PWA. */
export default function manifest() {
  return {
    id: "/",
    name: "Task Portal",
    short_name: "Task Portal",
    description: "Projects, employees, tasks and requirements in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#090c15",
    theme_color: "#6366f1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
