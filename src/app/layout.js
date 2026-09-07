import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n-config";
import PwaRegister from "@/components/shell/PwaRegister";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: { default: "Task Portal", template: "%s · Task Portal" },
  description: "Projects, employees and tasks control center.",
  applicationName: "Task Portal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Task Portal", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4fa" },
    { media: "(prefers-color-scheme: dark)", color: "#090c15" },
  ],
};

/**
 * Applies persisted preferences before React hydrates so there is no theme
 * flash. Mirrors the logic in components/shell/ThemeApplier.js.
 */
const bootScript = `
(function(){
  try {
    var raw = localStorage.getItem('admin-portal-prefs');
    var p = raw ? (JSON.parse(raw).state || {}) : {};
    var theme = p.theme || 'system';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.density = p.density || 'comfortable';
    el.dataset.glass = p.glass === false ? 'off' : 'on';
    el.dataset.locked = p.locked && p.pinHash && location.pathname !== '/login' ? 'true' : 'false';
    var accents = ${JSON.stringify(
      Object.fromEntries(
        Object.entries({
          indigo: ["#6366f1", "#4f46e5", "#c7d2fe"], violet: ["#8b5cf6", "#7c3aed", "#ddd6fe"],
          cyan: ["#06b6d4", "#0891b2", "#a5f3fc"], emerald: ["#10b981", "#059669", "#a7f3d0"],
          rose: ["#f43f5e", "#e11d48", "#fecdd3"], amber: ["#f59e0b", "#d97706", "#fde68a"],
          sky: ["#0ea5e9", "#0284c7", "#bae6fd"], pink: ["#ec4899", "#db2777", "#fbcfe8"],
        })
      )
    )};
    var a = accents[p.accent || 'indigo'] || accents.indigo;
    el.style.setProperty('--accent', a[0]);
    el.style.setProperty('--accent-strong', a[1]);
    el.style.setProperty('--accent-soft', a[2]);
    var radii = { sm: '8px', md: '14px', lg: '20px' };
    el.style.setProperty('--radius', radii[p.radius || 'md'] || '14px');
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }) {
  const store = await cookies();
  const wanted = store.get(LOCALE_COOKIE)?.value;
  const locale = wanted && LOCALES[wanted] ? wanted : "en";
  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-full bg-bg text-fg font-sans">
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
