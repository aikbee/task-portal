"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { moduleOfPath, moduleAllowed, featureAllowed } from "@/lib/access-control";
import { MODULE_MAP } from "@/lib/modules";
import { useT } from "@/lib/i18n";

/** Shows the page, or a plain notice when an administrator turned its module off for this account. */
export default function ModuleGate({ children }) {
  const tr = useT();
  const { user } = useAuth();
  const pathname = usePathname() ?? "/";
  const key = moduleOfPath(pathname);
  const report = /^\/(embed\/)?report(\/|$)/.test(pathname);
  if (moduleAllowed(user, key) && !(report && !featureAllowed(user, "export"))) return children;
  const mod = MODULE_MAP[key] ?? Object.values(MODULE_MAP).find((m) => m.href === `/${pathname.split("/").filter(Boolean)[0]}`);
  return (
    <div className="module-off mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-fg-muted"><Lock size={20} /></span>
      <h1 className="text-lg font-semibold">{tr("{name} is turned off for your account", { name: report && moduleAllowed(user, key) ? tr("Export and reports") : tr(mod?.label ?? "This page") })}</h1>
      <p className="text-sm text-fg-muted">{tr("An administrator decides which modules each person uses. Ask them if you need this one.")}</p>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">{tr("Back to the dashboard")}</Link>
    </div>
  );
}
