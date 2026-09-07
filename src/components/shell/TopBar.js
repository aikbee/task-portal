"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth, useVisibleModules } from "@/lib/auth-context";
import ProfileModal from "./ProfileModal";
import {LOCALES, switchLocale, useLocale, useT } from "@/lib/i18n";
import NotificationsBell from "./NotificationsBell";
import { USER_ROLES } from "@/lib/modules";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PanelLeft, Search, Plus, Sun, Moon, Monitor, SlidersHorizontal, ChevronRight, ArrowLeft, ArrowRight,
  FolderKanban, Users, CheckSquare, Home, User, LogOut, Command, Pin, PinOff, Lock, Columns2, Columns3, LayoutPanelLeft, PanelRightOpen, Check, Briefcase, ClipboardList, BookOpen, Languages, Download, X,
} from "lucide-react";
import { moduleFromPath, TASK_STATUS } from "@/lib/modules";
import { usePrefs, useUI } from "@/lib/store";
import { api } from "@/lib/api";
import { cn, fullName } from "@/lib/utils";
import { useDebouncedValue, useClickOutside, useMounted, useFetch } from "@/lib/hooks";
import Button from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/Popover";
import { Kbd } from "@/components/ui/Misc";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { useCurrentPin } from "./PinBar";

export default function TopBar() {
  const tr = useT();
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const toggleSidebar = usePrefs((s) => s.toggleSidebar);
  const toggleMobileNav = useUI((s) => s.toggleMobileNav);
  const installPrompt = useUI((s) => s.installPrompt);
  const setInstallPrompt = useUI((s) => s.setInstallPrompt);
  const promptInstall = async () => {
    const ev = installPrompt;
    setInstallPrompt(null);
    try { await ev.prompt(); } catch {}
  };
  const theme = usePrefs((s) => s.theme);
  const setPrefs = usePrefs((s) => s.set);
  const pageMeta = useUI((s) => s.pageMeta);
  const togglePrefs = useUI((s) => s.togglePrefs);
  const { user, logout, isAdmin } = useAuth();
  const visibleModules = useVisibleModules();
  const { data: allUsers } = useFetch(isAdmin ? "/api/users" : null);
  const switchWorkspace = async (id) => {
    try {
      await api.put("/api/auth/workspace", { user_id: id });
      window.location.reload();
    } catch {}
  };
  const [profileOpen, setProfileOpen] = useState(false);
  const locale = useLocale();
  const current = useCurrentPin();
  const pinned = usePrefs((s) => s.pins.some((p) => p.href === current.href));
  const togglePin = usePrefs((s) => s.togglePin);
  const isPinned = mounted && pinned;
  const canLock = usePrefs((s) => Boolean(s.pinHash) && s.lockEnabled);
  const lock = usePrefs((s) => s.lock);
  const splitCount = usePrefs((s) => s.splitCount);
  const setSplitCount = usePrefs((s) => s.setSplitCount);
  const openInPane = usePrefs((s) => s.openInPane);
  const split = mounted ? splitCount : 1;

  const mod = moduleFromPath(pathname);
  const crumbs = pageMeta.crumbs?.length || pageMeta.title ? pageMeta.crumbs : mod.key === "dashboard" ? [] : [{ label: tr(mod.label), href: mod.href }];
  const title = pageMeta.title || (mod.key === "dashboard" ? "Dashboard" : "");

  const cycleTheme = () => setPrefs({ theme: theme === "light" ? "dark" : theme === "dark" ? "system" : "light" });
  const ThemeIcon = !mounted ? Monitor : theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="relative z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 glass border-b px-4">
      <Button variant="ghost" size="icon" icon={PanelLeft} onClick={() => (window.matchMedia("(max-width: 767px)").matches ? toggleMobileNav() : toggleSidebar())} aria-label={tr("Toggle sidebar")} data-tip="Toggle sidebar ⌘B" data-tip-pos="bottom" />
      <div className="hidden items-center gap-0.5 sm:flex">
        <Button variant="ghost" size="iconSm" icon={ArrowLeft} onClick={() => router.back()} aria-label={tr("Back")} />
        <Button variant="ghost" size="iconSm" icon={ArrowRight} onClick={() => router.forward()} aria-label={tr("Forward")} />
      </div>

      {/* breadcrumbs */}
      <nav className="flex min-w-0 shrink items-center gap-1 overflow-hidden text-sm">
        <Link href="/" className="rounded-app-sm p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={tr("Dashboard")}>
          <Home size={15} />
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-fg-faint" />
            {c.href ? (
              <Link href={c.href} className="block max-w-[160px] truncate rounded-app-sm px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className="px-1.5 py-1 text-fg-muted">{tr(c.label)}</span>
            )}
          </span>
        ))}
        {title ? (
          <span className="flex items-center gap-1 min-w-0">
            <ChevronRight size={14} className="text-fg-faint" />
            <span className="max-w-[260px] truncate px-1.5 py-1 font-medium text-fg xl:max-w-[360px]">{title}</span>
          </span>
        ) : null}
      </nav>
      <Button
        variant="ghost"
        size="iconSm"
        icon={isPinned ? PinOff : Pin}
        onClick={() => togglePin({ href: current.href, label: current.label, module: current.module })}
        aria-label={isPinned ? "Unpin page" : "Pin page"}
        data-tip={isPinned ? "Unpin page (P)" : "Pin page (P)"}
        data-tip-pos="bottom"
        className={cn("hidden sm:inline-flex", isPinned && "text-accent")}
      />

      <div className="flex-1" />

      <GlobalSearch />

      <DropdownMenu
        width="w-48"
        trigger={({ toggle }) => (
          <>
            <Button variant="primary" size="sm" icon={Plus} onClick={toggle} className="hidden sm:inline-flex">
              {tr("New")}
            </Button>
            <Button variant="primary" size="icon" icon={Plus} onClick={toggle} className="sm:hidden" aria-label={tr("New")} />
          </>
        )}
        items={visibleModules.filter((m) => m.creatable).map((m) => ({
          label: tr("New {x}", { x: tr(m.singular) }),
          icon: m.icon,
          href: `${m.href}?new=1`,
        }))}
      />

      {isAdmin ? (
        <DropdownMenu
          width="w-64"
          trigger={({ toggle }) => (
            <Button
              variant={user?.workspace ? "subtle" : "ghost"}
              size="sm"
              icon={Briefcase}
              onClick={toggle}
              aria-label={tr("Workspace")}
              data-tip={tr("Switch workspace (admin)")}
              data-tip-pos="bottom"
              className="hidden md:inline-flex"
            >
              <span className="max-w-[120px] truncate">{user?.workspace ? user.workspace.name : tr("My workspace")}</span>
            </Button>
          )}
          items={[
            { label: tr("My workspace"), icon: !user?.workspace ? Check : User, onClick: () => switchWorkspace(null) },
            { divider: true },
            ...(allUsers ?? [])
              .filter((u) => u.id !== user?.id)
              .map((u) => ({
                label: `${u.name} · ${u.project_count ?? 0}p / ${u.employee_count ?? 0}e / ${u.task_count ?? 0}t`,
                icon: user?.workspace?.id === u.id ? Check : Briefcase,
                onClick: () => switchWorkspace(u.id),
              })),
            (allUsers ?? []).length <= 1 ? { label: tr("No other users yet"), icon: Users, disabled: true } : null,
          ]}
        />
      ) : null}

      <DropdownMenu
        width="w-60"
        trigger={({ toggle }) => (
          <Button
            variant="ghost"
            size="icon"
            icon={split > 2 ? Columns3 : Columns2}
            onClick={toggle}
            aria-label={tr("Split view")}
            data-tip={`Split view: ${split} page${split > 1 ? "s" : ""}`}
            data-tip-pos="bottom"
            className={cn("hidden lg:inline-flex", split > 1 && "text-accent")}
          />
        )}
        items={[
          { label: tr("Single page"), icon: split === 1 ? Check : LayoutPanelLeft, onClick: () => setSplitCount(1) },
          { label: tr("Two pages side by side"), icon: split === 2 ? Check : Columns2, onClick: () => setSplitCount(2) },
          { label: tr("Three pages side by side"), icon: split === 3 ? Check : Columns3, onClick: () => setSplitCount(3) },
          { divider: true },
          { label: tr("Open this page in a pane"), icon: PanelRightOpen, onClick: () => openInPane(pathname), disabled: pathname.startsWith("/embed") },
        ]}
      />

      <DropdownMenu
        width="w-44"
        trigger={({ toggle }) => (
          <Button className="hidden sm:inline-flex" variant="ghost" size="icon" icon={Languages} onClick={toggle} aria-label={tr("Language")} data-tip={LOCALES[locale]} data-tip-pos="bottom" />
        )}
        items={Object.entries(LOCALES).map(([code, name]) => ({ label: name, icon: code === locale ? Check : Languages, onClick: () => code !== locale && switchLocale(code) }))}
      />

      <NotificationsBell />

      <Button
        className="hidden sm:inline-flex"
        variant="ghost"
        size="icon"
        icon={ThemeIcon}
        onClick={cycleTheme}
        aria-label={tr("Toggle theme")}
        data-tip={`Theme: ${mounted ? theme : "system"}`}
        data-tip-pos="bottom"
      />
      <Button variant="ghost" size="icon" icon={SlidersHorizontal} onClick={togglePrefs} aria-label={tr("Preferences")} data-tip="Preferences ⌘," data-tip-pos="bottom" />

      <DropdownMenu
        width="w-52"
        trigger={({ toggle }) => (
          <button onClick={toggle} className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-surface-2" aria-label={tr("Account menu")}>
            <Avatar name={user?.name ?? "?"} color={user?.avatar_color ?? "var(--accent)"} size="sm" />
            <span className="hidden max-w-[140px] text-left leading-tight md:block">
              <span className="block truncate text-xs font-medium">{user?.name ?? "Account"}</span>
              <span className="block text-[10px] text-fg-muted">{USER_ROLES[user?.role]?.label ?? ""}</span>
            </span>
          </button>
        )}
        items={[
          { label: user?.email ?? "", icon: User, disabled: true },
          { divider: true },
          { label: tr("Profile & password"), icon: User, onClick: () => setProfileOpen(true) },
          { label: tr("Preferences"), icon: SlidersHorizontal, onClick: togglePrefs, hint: "⌘," },
          ...(installPrompt ? [{ label: tr("Install app"), icon: Download, onClick: promptInstall }] : []),
          mounted && canLock ? { label: tr("Lock screen"), icon: Lock, onClick: lock, hint: "⌘⇧L" } : { label: tr("Set up lock screen"), icon: Lock, onClick: togglePrefs },
          { divider: true },
          { label: tr("Sign out"), icon: LogOut, onClick: logout, danger: true },
        ]}
      />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}

function GlobalSearch() {
  const tr = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false); // full-screen search on phones
  const [results, setResults] = useState(null); // { q, projects, employees, tasks }
  const [cursor, setCursor] = useState(0);
  const dq = useDebouncedValue(q, 220);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (usePrefs.getState().locked) return;
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = dq.trim();
  useEffect(() => {
    if (!active) return;
    let alive = true;
    api
      .get(`/api/search?q=${encodeURIComponent(active)}`)
      .then((r) => {
        if (!alive) return;
        setResults({ q: active, ...r });
        setCursor(0);
      })
      .catch(() => alive && setResults({ q: active, projects: [], employees: [], tasks: [] }));
    return () => {
      alive = false;
    };
  }, [active]);

  const shown = active && results?.q === active ? results : null;
  const loading = Boolean(active) && !shown;
  const flat = shown
    ? [
        ...shown.projects.map((p) => ({ kind: "project", href: `/projects/${p.id}`, label: p.name, sub: p.code, color: p.color, icon: FolderKanban })),
        ...shown.employees.map((e) => ({ kind: "employee", href: `/employees/${e.id}`, label: fullName(e), sub: e.job_title || e.email, color: e.avatar_color, icon: Users })),
        ...shown.tasks.map((t) => ({ kind: "task", href: `/tasks/${t.id}`, label: t.title, sub: t.project_name, status: t.status, icon: CheckSquare })),
        ...(shown.requirements ?? []).map((r) => ({ kind: "requirement", href: `/requirements/${r.id}`, label: `${r.code} · ${r.title}`, sub: r.project_name, color: r.project_color, icon: ClipboardList })),
        ...(shown.info ?? []).map((i) => ({ kind: "info", href: `/info/${i.id}`, label: i.title, sub: [i.category, i.tags].filter(Boolean).join(" · "), color: i.color, icon: BookOpen })),
      ]
    : [];

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    setMobile(false);
    setQ("");
    router.push(item.href);
  };
  const inputProps = {
    value: q,
    onChange: (e) => {
      setQ(e.target.value);
      setCursor(0);
      setOpen(true);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === "Enter") go(flat[cursor]);
      if (e.key === "Escape") { setOpen(false); setMobile(false); inputRef.current?.blur(); }
    },
    placeholder: tr("Search projects, people, tasks…"),
  };

  const resultList = (
    <>
          {loading ? (
            <p className="px-4 py-6 text-center text-xs text-fg-muted">{tr("Searching…")}</p>
          ) : flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-fg-muted">No results for “{q}”.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {["project", "requirement", "employee", "task", "info"].map((kind) => {
                const group = flat.filter((f) => f.kind === kind);
                if (!group.length) return null;
                return (
                  <li key={kind}>
                    <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{kind}s</p>
                    {group.map((item) => {
                      const idx = flat.indexOf(item);
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.href}
                          onMouseEnter={() => setCursor(idx)}
                          onClick={() => go(item)}
                          className={cn("flex w-full items-center gap-3 rounded-app-sm px-2.5 py-2 text-left text-sm", idx === cursor ? "bg-accent/10" : "hover:bg-surface-2")}
                        >
                          {item.kind === "employee" ? (
                            <Avatar name={item.label} color={item.color} size="xs" />
                          ) : (
                            <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ background: item.color || "var(--accent)" }}>
                              <Icon size={13} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{tr(item.label)}</span>
                            {item.sub ? <span className="block truncate text-xs text-fg-muted">{item.sub}</span> : null}
                          </span>
                          {item.status ? <StatusBadge map={TASK_STATUS} value={item.status} dot={false} /> : null}
                        </button>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="hidden items-center gap-3 border-t border-line px-3 py-1.5 text-[10px] text-fg-faint md:flex">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{tr("navigate")}</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd>{tr("open")}</span>
            <span className="flex items-center gap-1"><Kbd>esc</Kbd>{tr("close")}</span>
          </div>
    </>
  );

  return (
    <>
      <Button variant="ghost" size="icon" icon={Search} className="md:hidden" onClick={() => { setMobile(true); setOpen(true); }} aria-label={tr("Search")} />
      {mobile ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-bg md:hidden">
          <div className="flex items-center gap-2 border-b border-line p-3" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input autoFocus {...inputProps} className="control h-10 w-full pl-9" />
            </div>
            <Button variant="ghost" size="icon" icon={X} onClick={() => setMobile(false)} aria-label={tr("Close")} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{q.trim() ? resultList : <p className="px-4 py-8 text-center text-xs text-fg-muted">{tr("Search projects, people, tasks…")}</p>}</div>
        </div>
      ) : null}
    <div ref={wrapRef} className="relative hidden md:block">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
        <input ref={inputRef} {...inputProps} onFocus={() => setOpen(true)} className="control h-9 w-64 pl-9 pr-16 lg:w-80" />
        <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          <Kbd><Command size={9} /></Kbd>
          <Kbd>K</Kbd>
        </span>
      </div>
      {open && q.trim() ? (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[420px] overflow-hidden rounded-app border border-line bg-surface shadow-app-lg anim-pop">
          {resultList}
        </div>
      ) : null}
    </div>
    </>
  );
}
