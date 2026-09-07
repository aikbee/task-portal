"use client";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, SlidersHorizontal, StickyNote, X } from "lucide-react";
import { USER_ROLES } from "@/lib/modules";
import { useAuth, useVisibleModules } from "@/lib/auth-context";
import Avatar from "@/components/ui/Avatar";
import ProfileSwitcher from "./ProfileSwitcher";
import { usePrefs, useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

export default function Sidebar() {
  const tr = useT();
  const pathname = usePathname();
  const mounted = useMounted();
  const collapsedPref = usePrefs((s) => s.sidebarCollapsed);
  const toggleSidebar = usePrefs((s) => s.toggleSidebar);
  const promoDismissed = usePrefs((s) => s.promoDismissed);
  const setPrefs = usePrefs((s) => s.set);
  const counts = useUI((s) => s.counts);
  const unread = useUI((s) => s.unread);
  const notes = useUI((s) => s.notes);
  const setPrefsOpen = useUI((s) => s.setPrefsOpen);
  const { user } = useAuth();
  const modules = useVisibleModules();
  const collapsed = mounted && collapsedPref;

  return (
    <aside
      className={cn(
        "relative z-20 flex h-screen shrink-0 flex-col glass border-r transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]"
      )}
    >
      {/* brand banner */}
      <div className={cn("relative overflow-hidden border-b border-line", collapsed ? "px-3 py-3" : "px-4 py-4")}>
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <span className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/40 blur-2xl" />
          <span className="absolute -right-6 top-4 h-20 w-20 rounded-full bg-cyan-400/30 blur-2xl" />
        </div>
        <Link href="/" className="relative flex items-center gap-3">
          <Logo size={40} className="shrink-0 rounded-app shadow-[0_8px_20px_-8px_var(--accent)]" />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">{tr("Task Portal")}</span>
              <span className="block truncate text-[11px] text-fg-muted">{tr("Control center")}</span>
            </span>
          ) : null}
        </Link>
      </div>

      <div className={cn("border-b border-line", collapsed ? "px-2.5 py-2" : "px-3 py-2.5")}>
        <ProfileSwitcher collapsed={collapsed} />
      </div>

      {/* nav */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2.5" : "px-3")}>
        {!collapsed ? <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">{tr("Modules")}</p> : null}
        <ul className="space-y-1">
          {modules.map((m) => {
            const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
            const Icon = m.icon;
            const count = m.key === "notifications" ? unread || null : counts?.[m.key];
            return (
              <li key={m.key}>
                <Link
                  href={m.href}
                  data-tip={collapsed ? tr(m.label) : undefined}
                  data-tip-pos="right"
                  className={cn(
                    "group relative flex items-center gap-3 rounded-app-sm py-2 text-sm font-medium transition-all",
                    collapsed ? "justify-center px-0" : "px-2.5",
                    active ? "bg-accent/12 text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                  )}
                >
                  {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" /> : null}
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-app-sm transition",
                      active ? "bg-accent text-white shadow-[0_6px_14px_-6px_var(--accent)]" : "bg-surface-2 text-fg-muted group-hover:text-fg"
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  {!collapsed ? (
                    <>
                      <span className="flex-1 truncate">{tr(m.label)}</span>
                      {count != null ? (
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", m.key === "notifications" ? "bg-amber-500 text-white" : active ? "bg-accent/15 text-accent" : "bg-surface-3 text-fg-muted")}>
                          {count}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* bottom banner */}
      <div className={cn("border-t border-line", collapsed ? "p-2.5" : "p-3")}>
        {!collapsed && !promoDismissed ? (
          <div className="relative overflow-hidden rounded-app bg-gradient-to-br from-accent to-accent-strong p-3.5 text-white shadow-app anim-pop">
            <span className="pointer-events-none absolute -right-6 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-xl" />
            <button
              onClick={() => setPrefs({ promoDismissed: true })}
              className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-white/70 transition hover:bg-white/20 hover:text-white"
              aria-label={tr("Dismiss")}
              data-tip={tr("Hide this card")}
            >
              <X size={13} />
            </button>
            <p className="pr-6 text-xs font-semibold">{tr("Make it yours")}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/80">{tr("Theme, accent, background and layout live in Preferences.")}</p>
            <button
              onClick={() => setPrefsOpen(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-medium backdrop-blur hover:bg-white/30"
            >
              <SlidersHorizontal size={12} /> {tr("Open preferences")}
            </button>
            {notes?.length ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/75">
                <StickyNote size={11} /> {tr(notes.length === 1 ? "{n} sticky note saved" : "{n} sticky notes saved", { n: notes.length })}
              </p>
            ) : null}
          </div>
        ) : null}
        {user ? (
          <div
            className={cn("mt-2 flex items-center gap-2.5 rounded-app-sm px-1.5 py-1.5", collapsed ? "justify-center" : "")}
            data-tip={collapsed ? `${user.name} · ${USER_ROLES[user.role]?.label ?? user.role}` : undefined}
            data-tip-pos="right"
          >
            <Avatar name={user.name} color={user.avatar_color} size="sm" />
            {!collapsed ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-xs font-medium">{user.name}</span>
                <span className="block truncate text-[10px] text-fg-muted">{USER_ROLES[user.role]?.label ?? user.role} · {user.email}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <button
          onClick={toggleSidebar}
          className={cn(
            "mt-1 flex w-full items-center justify-center gap-2 rounded-app-sm py-2 text-xs text-fg-muted transition hover:bg-surface-2 hover:text-fg",
            collapsed && "mt-0"
          )}
          data-tip={collapsed ? "Expand" : undefined}
          data-tip-pos="right"
        >
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} />{tr("Collapse")}</>}
        </button>
      </div>
    </aside>
  );
}
