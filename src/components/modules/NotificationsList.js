"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, Trash2, MailOpen, Mail, Inbox, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useUI } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useNav } from "@/lib/nav";
import { NOTIFICATION_CATEGORIES, MODULE_MAP } from "@/lib/modules";
import { notificationMeta } from "@/lib/notification-ui";
import { cn, relativeTime, formatDateTime } from "@/lib/utils";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

function dayLabel(iso) {
  const d = new Date(iso.replace(" ", "T"));
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function NotificationsList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const setUnread = useUI((s) => s.setUnread);
  const { user, switchProfile } = useAuth();
  const { data, loading, error, setData } = useFetch("/api/notifications?limit=200");
  const [tab, setTab] = useState("all");
  const [category, setCategory] = useState("");
  const items = useMemo(() => data?.items ?? [], [data]);
  const mod = MODULE_MAP.notifications;

  const shown = useMemo(
    () => items.filter((n) => (tab === "unread" ? !n.read_at : true)).filter((n) => (category ? notificationMeta(n.type).category === category : true)),
    [items, tab, category]
  );
  const groups = useMemo(() => {
    const map = new Map();
    for (const n of shown) {
      const k = dayLabel(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(n);
    }
    return [...map.entries()];
  }, [shown]);
  const unreadCount = items.filter((n) => !n.read_at).length;

  const patchLocal = (fn) => setData((d) => ({ ...d, items: fn(d?.items ?? []) }));
  const setRead = async (n, read) => {
    patchLocal((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: read ? x.read_at || new Date().toISOString() : null } : x)));
    setUnread(Math.max(0, unreadCount + (read ? -1 : 1)));
    try {
      await api.put(`/api/notifications/${n.id}`, { read });
    } catch (e) {
      toast.error("Could not update notification", e.message);
    }
  };
  const remove = async (n) => {
    patchLocal((l) => l.filter((x) => x.id !== n.id));
    if (!n.read_at) setUnread(Math.max(0, unreadCount - 1));
    try {
      await api.del(`/api/notifications/${n.id}`);
    } catch (e) {
      toast.error("Could not delete notification", e.message);
    }
  };
  const markAll = async () => {
    try {
      await api.post("/api/notifications/read-all");
      patchLocal((l) => l.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
      setUnread(0);
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error("Could not update notifications", e.message);
    }
  };
  const clearRead = async () => {
    try {
      const r = await api.del("/api/notifications");
      patchLocal((l) => l.filter((x) => !x.read_at));
      toast.success(`${r.deleted} read notification${r.deleted === 1 ? "" : "s"} cleared`);
    } catch (e) {
      toast.error("Could not clear notifications", e.message);
    }
  };
  const open = (n) => {
    if (!n.read_at) setRead(n, true);
    if (!n.href) return;
    if (n.profile_id && user?.profile_id && n.profile_id !== user.profile_id) return switchProfile(n.profile_id, n.href);
    router.push(n.href);
  };

  return (
    <>
      <PageHeader
        title={tr("Notifications")}
        description={tr(mod.description)}
        icon={mod.icon}
        color={mod.color}
        crumbs={[]}
        actions={
          <>
            <Button variant="outline" icon={CheckCheck} onClick={markAll} disabled={!unreadCount}>{tr("Mark all read")}</Button>
            <Button variant="outline" icon={Trash2} onClick={clearRead} disabled={items.every((n) => !n.read_at)}>{tr("Clear read")}</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: tr("All"), count: items.length },
            { key: "unread", label: tr("Unread"), count: unreadCount },
          ]}
          className="border-0"
        />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setCategory("")} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", !category ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:text-fg")}>{tr("All types")}</button>
          {Object.entries(NOTIFICATION_CATEGORIES).map(([k, v]) => (
            <button key={k} onClick={() => setCategory(k === category ? "" : k)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", category === k ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:text-fg")}>{tr(v.label)}</button>
          ))}
        </div>
      </div>

      {error ? <EmptyState title="Could not load notifications" description={error.message} /> : null}
      {loading && !data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div> : null}
      {data && shown.length === 0 ? (
        <Card><EmptyState icon={Inbox} title={tab === "unread" ? "No unread notifications" : "Nothing here yet"} description="Task, requirement and project changes, due-date reminders and sign-ins will appear here." /></Card>
      ) : null}
      <div className="space-y-5">
        {groups.map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">{day}</h2>
            <Card padding={false} className="divide-y divide-line">
              {list.map((n) => {
                const m = notificationMeta(n.type);
                return (
                  <div key={n.id} className={cn("group flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2/60", !n.read_at && "bg-accent/5")}>
                    <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-app-sm", m.toneClass)}>
                      <m.Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => open(n)} className="block max-w-full text-left">
                        <span className={cn("block truncate text-sm", !n.read_at ? "font-semibold" : "font-medium")}>{n.title}</span>
                        {n.body ? <span className="block truncate text-xs text-fg-muted">{n.body}</span> : null}
                      </button>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-faint">
                        <span className="rounded-full bg-surface-3 px-1.5 py-px">{tr(m.label)}</span>
                        <span title={formatDateTime(n.created_at)}>{relativeTime(n.created_at)}</span>
                        {n.actor_name ? <span>· by {n.actor_name}</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                      {n.href ? <Link href={n.href}><Button variant="ghost" size="iconXs" icon={ExternalLink} aria-label={tr("Open")} data-tip={tr("Open")} /></Link> : null}
                      <Button variant="ghost" size="iconXs" icon={n.read_at ? Mail : MailOpen} onClick={() => setRead(n, !n.read_at)} aria-label={n.read_at ? "Mark unread" : "Mark read"} data-tip={n.read_at ? "Mark unread" : "Mark read"} />
                      <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={() => remove(n)} aria-label={tr("Delete")} data-tip={tr("Delete")} />
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
