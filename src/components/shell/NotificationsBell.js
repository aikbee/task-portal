"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { usePrefs, useUI } from "@/lib/store";
import { playChime } from "@/lib/audio";
import { notificationMeta } from "@/lib/notification-ui";
import { cn, relativeTime } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

const POLL_MS = 30_000;

/** Top-bar bell: unread badge, recent list, toast/chime/desktop alert for new arrivals. */
export default function NotificationsBell() {
  const tr = useT();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const unread = useUI((s) => s.unread);
  const setUnread = useUI((s) => s.setUnread);
  const notifySound = usePrefs((s) => s.notifySound);
  const notifyDesktop = usePrefs((s) => s.notifyDesktop);
  const lastTopId = useRef(null);
  const { user, switchProfile } = useAuth();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.get("/api/notifications?limit=15");
        if (!alive) return;
        setItems(r.items);
        setUnread(r.unread);
        const top = r.items[0];
        const prefs = usePrefs.getState();
        if (top && lastTopId.current !== null && top.id !== lastTopId.current && !top.read_at) {
          toast.info(top.title, top.body || undefined);
          if (prefs.notifySound) playChime("work");
          if (prefs.notifyDesktop && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
            try {
              new Notification(top.title, { body: top.body || "", silent: true });
            } catch {}
          }
        }
        lastTopId.current = top?.id ?? 0;
      } catch {}
    };
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [setUnread, toast, notifySound, notifyDesktop]);

  const markAllRead = async () => {
    try {
      await api.post("/api/notifications/read-all");
      setItems((l) => l.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnread(0);
    } catch (e) {
      toast.error("Could not update notifications", e.message);
    }
  };
  const open = async (n, close) => {
    close();
    if (!n.read_at) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread(Math.max(0, unread - 1));
      api.put(`/api/notifications/${n.id}`, { read: true }).catch(() => {});
    }
    if (!n.href) return;
    if (n.profile_id && user?.profile_id && n.profile_id !== user.profile_id) return switchProfile(n.profile_id, n.href);
    router.push(n.href);
  };

  return (
    <Popover
      width={380}
      trigger={({ toggle, open: isOpen }) => (
        <Button variant={isOpen ? "secondary" : "ghost"} size="icon" onClick={toggle} aria-label={tr("Notifications")} data-tip={tr("Notifications")} data-tip-pos="bottom" className="relative">
          <Bell size={16} />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface anim-pop">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Notifications{unread ? ` · ${unread} new` : ""}</span>
            <div className="flex items-center gap-1">
              {unread ? (
                <button onClick={markAllRead} className="flex items-center gap-1 rounded-app-sm px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <CheckCheck size={12} /> Mark all read
                </button>
              ) : null}
              <Link href="/notifications" onClick={close} className="rounded-app-sm px-2 py-1 text-[11px] text-accent hover:bg-surface-2">
                {tr("View all")}
              </Link>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Inbox size={22} className="mb-2 text-fg-faint" />
              <p className="text-sm font-medium">You&rsquo;re all caught up</p>
              <p className="text-xs text-fg-muted">{tr("Changes, reminders and sign-ins will show up here.")}</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {items.map((n) => {
                const m = notificationMeta(n.type);
                return (
                  <li key={n.id}>
                    <button onClick={() => open(n, close)} className={cn("flex w-full items-start gap-3 rounded-app-sm px-2.5 py-2 text-left hover:bg-surface-2", !n.read_at && "bg-accent/5")}>
                      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-app-sm", m.toneClass)}>
                        <m.Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", !n.read_at ? "font-semibold" : "font-medium")}>{n.title}</span>
                        {n.body ? <span className="block truncate text-xs text-fg-muted">{n.body}</span> : null}
                        <span className="block text-[11px] text-fg-faint">{relativeTime(n.created_at)}{n.actor_name ? ` · ${n.actor_name}` : ""}</span>
                      </span>
                      {!n.read_at ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
