"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Users, Copy, RefreshCw, UserPlus, Check, X, Send, ArrowLeft, Ban, UserMinus, Link2, Image as ImageIcon, ChevronLeft, ChevronRight, Download, Settings2, LogOut, Crown, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { Input, Checkbox, Field } from "@/components/ui/Controls";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { cn, relativeTime, formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
function dayLabel(iso, tr) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return tr("Today");
  if (same(d, yesterday)) return tr("Yesterday");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Text for a system line in a group ("Ann added Bob", "Ann renamed the group…"). */
function systemText(m, tr) {
  let ev = {};
  try {
    ev = JSON.parse(m.body);
  } catch {}
  const name = m.sender_name || tr("Someone");
  const names = (ev.names ?? []).join(", ");
  switch (ev.event) {
    case "created":
      return tr("{name} created the group", { name });
    case "added":
      return tr("{name} added {names}", { name, names });
    case "removed":
      return tr("{name} removed {names}", { name, names });
    case "left":
      return tr("{name} left the group", { name });
    case "renamed":
      return tr("{name} renamed the group to “{title}”", { name, title: ev.title ?? "" });
    case "owner":
      return tr("{names} is now the group owner", { names });
    default:
      return m.body;
  }
}
const isGroup = (c) => c?.kind === "group";
const TYPING_TTL = 6000; // a typer is forgotten after this unless they ping again
/** "Ann is typing" / "Ann and Bob are typing" / "3 people are typing". */
function typingText(typers, tr) {
  const names = typers.map((t) => t.name);
  if (!names.length) return "";
  if (names.length === 1) return tr("{name} is typing", { name: names[0] });
  if (names.length === 2) return tr("{a} and {b} are typing", { a: names[0], b: names[1] });
  return tr("{n} people are typing", { n: names.length });
}
const Dots = () => (
  <span className="chat-dots" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);
const memberCount = (n, tr) => (n === 1 ? tr("1 member") : tr("{n} members", { n }));
/** Avatar for a conversation row: the person, or a coloured group badge. */
function ConvoAvatar({ convo, size = "md" }) {
  if (!isGroup(convo)) return <Avatar name={convo.name} color={convo.avatar_color} size={size} />;
  const px = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <span className={cn("chat-group-avatar inline-grid shrink-0 place-items-center rounded-full text-white", px)} style={{ background: `linear-gradient(135deg, ${convo.avatar_color}, color-mix(in oklab, ${convo.avatar_color} 70%, black))` }} title={convo.name}>
      <Users size={size === "sm" ? 13 : 16} />
    </span>
  );
}

/** Friends (add by QR / code, requests, block), one-to-one and group chat with live updates. */
export default function ChatModule() {
  const tr = useT();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const setCounts = useUI((s) => s.setCounts);
  const mod = MODULE_MAP.chat;
  const [tab, setTab] = useState(sp.get("add") || sp.get("tab") === "friends" ? "friends" : "chats");
  const [convos, setConvos] = useState(null);
  const [friends, setFriends] = useState(null);
  const [active, setActive] = useState(() => Number(sp.get("c")) || null);
  const [threads, setThreads] = useState({});
  const [pendingAdd, setPendingAdd] = useState(null); // { code, user, relation } from a scanned QR link
  const [newGroup, setNewGroup] = useState(false);
  const [typing, setTyping] = useState({}); // conversation id -> { user id: { name, avatar_color, until } }
  const activeRef = useRef(active);
  const toastRef = useRef(toast);
  useEffect(() => {
    activeRef.current = active;
    toastRef.current = toast;
  }, [active, toast]);

  const loadConvos = useCallback(async () => {
    try {
      setConvos(await api.get("/api/chat/conversations"));
    } catch {}
  }, []);
  const loadFriends = useCallback(async () => {
    try {
      setFriends(await api.get("/api/chat/friends"));
    } catch {}
  }, []);
  const loadThread = useCallback(async (id) => {
    try {
      const list = await api.get(`/api/chat/conversations/${id}/messages`);
      setThreads((t) => ({ ...t, [id]: list }));
      return list;
    } catch {
      return null;
    }
  }, []);
  const markRead = useCallback(async (id, messageId) => {
    if (!messageId) return;
    try {
      const c = await api.post(`/api/chat/conversations/${id}/read`, { message_id: messageId });
      setConvos((list) => (list ?? []).map((x) => (x.id === id ? { ...x, unread: 0, last_read_message_id: c.last_read_message_id } : x)));
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    api.get("/api/chat/conversations").then((d) => alive && setConvos(d)).catch(() => {});
    api.get("/api/chat/friends").then((d) => alive && setFriends(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // sidebar badge: unread messages + requests waiting for me
  useEffect(() => {
    if (!convos && !friends) return;
    const n = (convos ?? []).reduce((s, c) => s + (c.unread || 0), 0) + (friends?.incoming?.length ?? 0);
    setCounts({ ...(useUI.getState().counts ?? {}), chat: n || null });
  }, [convos, friends, setCounts]);

  // typers who stop pinging fade out after TYPING_TTL
  const anyTyping = Object.values(typing).some((m) => Object.keys(m).length > 0);
  useEffect(() => {
    if (!anyTyping) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTyping((t) => {
        let changed = false;
        const next = {};
        for (const [cid, users] of Object.entries(t)) {
          const keep = Object.fromEntries(Object.entries(users).filter(([, u]) => u.until > now));
          if (Object.keys(keep).length !== Object.keys(users).length) changed = true;
          if (Object.keys(keep).length) next[cid] = keep;
        }
        return changed ? next : t;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [anyTyping]);

  // opening a thread loads it and marks it read
  useEffect(() => {
    if (!active) return;
    let alive = true;
    api
      .get(`/api/chat/conversations/${active}/messages`)
      .then((list) => {
        if (!alive) return;
        setThreads((t) => ({ ...t, [active]: list }));
        if (list.length) markRead(active, list[list.length - 1].id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, markRead]);

  // a scanned QR link lands here as ?add=CODE
  useEffect(() => {
    const code = sp.get("add");
    if (!code) return;
    api
      .get(`/api/chat/friends/lookup?code=${encodeURIComponent(code)}`)
      .then((r) => setPendingAdd({ code, ...r }))
      .catch((e) => toastRef.current.error("Could not read that friend code", e.message));
    router.replace("/chat?tab=friends");
  }, [sp, router]);

  // live updates: server-sent events, polling if the stream cannot connect
  useEffect(() => {
    let es = null;
    let poll = null;
    let stopped = false;
    const startPolling = () => {
      if (poll || stopped) return;
      poll = setInterval(() => {
        loadConvos();
        loadFriends();
        if (activeRef.current) loadThread(activeRef.current);
      }, 5000);
    };
    const onTyping = (ev) => {
      if (ev.user_id === user?.id) return;
      setTyping((t) => {
        const cur = { ...(t[ev.conversation_id] ?? {}) };
        if (ev.typing) cur[ev.user_id] = { name: ev.name, avatar_color: ev.avatar_color, until: Date.now() + TYPING_TTL };
        else delete cur[ev.user_id];
        const next = { ...t };
        if (Object.keys(cur).length) next[ev.conversation_id] = cur;
        else delete next[ev.conversation_id];
        return next;
      });
    };
    const onMessage = (ev) => {
      const { conversation_id, message } = ev;
      onTyping({ conversation_id, user_id: message.sender_id, typing: false });
      setThreads((t) => {
        const list = t[conversation_id];
        if (!list || list.some((m) => m.id === message.id)) return t;
        return { ...t, [conversation_id]: [...list, message] };
      });
      if (message.sender_id !== user?.id && activeRef.current === conversation_id && document.visibilityState === "visible") markRead(conversation_id, message.id);
      loadConvos();
    };
    const onRead = (ev) =>
      setConvos((list) =>
        (list ?? []).map((c) => {
          if (c.id !== ev.conversation_id || ev.user_id === user?.id) return c;
          const members = (c.members ?? []).map((m) => (m.id === ev.user_id ? { ...m, last_read_message_id: Math.max(Number(m.last_read_message_id) || 0, ev.last_read_message_id) } : m));
          return { ...c, members, peer_last_read: c.kind === "direct" ? Math.max(Number(c.peer_last_read) || 0, ev.last_read_message_id) : c.peer_last_read };
        })
      );
    const onConversation = (ev) => {
      if (ev.action === "removed") {
        setConvos((list) => (list ?? []).filter((c) => c.id !== ev.conversation_id));
        if (activeRef.current === ev.conversation_id) {
          setActive(null);
          toastRef.current.info?.(tr("You were removed from “{title}”", { title: ev.title ?? "" })) ?? toastRef.current.success(tr("You were removed from “{title}”", { title: ev.title ?? "" }));
        }
        return;
      }
      loadConvos();
    };
    try {
      es = new EventSource("/api/chat/stream");
      es.addEventListener("message", (e) => onMessage(JSON.parse(e.data)));
      es.addEventListener("read", (e) => onRead(JSON.parse(e.data)));
      es.addEventListener("conversation", (e) => onConversation(JSON.parse(e.data)));
      es.addEventListener("typing", (e) => onTyping(JSON.parse(e.data)));
      es.addEventListener("friends", () => {
        loadFriends();
        loadConvos();
      });
      es.onopen = () => {
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      };
      es.onerror = () => startPolling();
    } catch {
      startPolling();
    }
    return () => {
      stopped = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [user?.id, loadConvos, loadFriends, loadThread, markRead, tr]);

  const openWith = async (friend) => {
    try {
      const c = await api.post("/api/chat/conversations", { user_id: friend.id });
      setConvos((list) => (list && list.some((x) => x.id === c.id) ? list : [{ ...c, unread: 0, last_body: null }, ...(list ?? [])]));
      setActive(c.id);
      setTab("chats");
    } catch (e) {
      toast.error(tr("Could not open the chat"), e.message);
    }
  };
  const upsertConvo = (c) => setConvos((list) => (list && list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [{ unread: 0, ...c }, ...(list ?? [])]));
  const sendRequest = async (code) => {
    const r = await api.post("/api/chat/friends", { code });
    toast.success(r.status === "friends" ? tr("You are now friends with {name}", { name: r.user.name }) : tr("Friend request sent to {name}", { name: r.user.name }));
    loadFriends();
  };

  const activeConvo = (convos ?? []).find((c) => c.id === active) ?? null;
  const unreadTotal = (convos ?? []).reduce((s, c) => s + (c.unread || 0), 0);
  const pendingIn = friends?.incoming?.length ?? 0;

  return (
    <>
      <PageHeader title={tr("Chat")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} />
      <div className="chat-shell ui-card card flex min-h-[520px] overflow-hidden p-0" style={{ height: "calc(100dvh - var(--topbar-h) - var(--bottombar-h) - 150px)" }}>
        <aside className={cn("chat-side flex w-full shrink-0 flex-col border-r border-line md:w-[340px]", active && "hidden md:flex")}>
          <div className="chat-tabs flex gap-1 border-b border-line p-2">
            <TabButton active={tab === "chats"} icon={MessageCircle} label={tr("Chats")} count={unreadTotal} onClick={() => setTab("chats")} />
            <TabButton active={tab === "friends"} icon={Users} label={tr("Friends")} count={pendingIn} onClick={() => setTab("friends")} />
          </div>
          {tab === "chats" ? (
            <ConversationList tr={tr} me={user} convos={convos} typing={typing} active={active} onOpen={(id) => setActive(id)} onFindFriends={() => setTab("friends")} onNewGroup={() => setNewGroup(true)} />
          ) : (
            <FriendsPanel tr={tr} toast={toast} data={friends} reload={loadFriends} onMessage={openWith} onSendRequest={sendRequest} />
          )}
        </aside>
        <section className={cn("chat-main flex min-w-0 flex-1 flex-col", !active && "hidden md:flex")}>
          {activeConvo ? (
            <Thread
              tr={tr}
              me={user}
              convo={activeConvo}
              messages={threads[active]}
              onBack={() => setActive(null)}
              onSent={(m) => {
                // the live stream may already have delivered our own message
                setThreads((t) => (t[active]?.some((x) => x.id === m.id) ? t : { ...t, [active]: [...(t[active] ?? []), m] }));
                loadConvos();
              }}
              onLoadEarlier={async () => {
                const list = threads[active];
                if (!list?.length) return;
                const older = await api.get(`/api/chat/conversations/${active}/messages?before=${list[0].id}`);
                setThreads((t) => ({ ...t, [active]: [...older, ...(t[active] ?? [])] }));
              }}
              friends={friends?.friends ?? []}
              typers={Object.values(typing[active] ?? {})}
              onConvoChange={upsertConvo}
              onLeft={(id) => {
                setConvos((list) => (list ?? []).filter((c) => c.id !== id));
                setActive(null);
              }}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState icon={MessageCircle} title={tr("Pick a conversation")} description={tr("Choose a chat on the left, or add a friend with their QR code to start one.")} />
            </div>
          )}
        </section>
      </div>
      <GroupCreateModal
        tr={tr}
        open={newGroup}
        friends={friends?.friends ?? []}
        onClose={() => setNewGroup(false)}
        onCreated={(c) => {
          setNewGroup(false);
          upsertConvo(c);
          setActive(c.id);
          setTab("chats");
        }}
      />
      <ConfirmDialog
        open={!!pendingAdd}
        onClose={() => setPendingAdd(null)}
        danger={false}
        loading={false}
        title={pendingAdd?.relation === "self" ? tr("That is your own code") : pendingAdd?.relation === "friends" ? tr("Already friends") : tr("Send a friend request?")}
        confirmText={pendingAdd?.relation === "none" || pendingAdd?.relation === "incoming" ? tr("Send request") : tr("OK")}
        description={
          !pendingAdd
            ? ""
            : pendingAdd.relation === "none"
              ? tr("{name} ({email}) will be asked to accept. You can message each other once they do.", { name: pendingAdd.user.name, email: pendingAdd.user.email })
              : pendingAdd.relation === "incoming"
                ? tr("{name} already asked to be your friend. Accepting connects you right away.", { name: pendingAdd.user.name })
                : pendingAdd.relation === "outgoing"
                  ? tr("Your request to {name} is still waiting for their answer.", { name: pendingAdd.user.name })
                  : pendingAdd.relation === "friends"
                    ? tr("You and {name} are already friends.", { name: pendingAdd.user.name })
                    : tr("This person is not available.")
        }
        onConfirm={async () => {
          const p = pendingAdd;
          setPendingAdd(null);
          if (p?.relation === "none" || p?.relation === "incoming") {
            try {
              await sendRequest(p.code);
            } catch (e) {
              toast.error(tr("Could not send the request"), e.message);
            }
          }
        }}
      />
    </>
  );
}

function TabButton({ active, icon: Icon, label, count, onClick }) {
  return (
    <button type="button" onClick={onClick} className={cn("chat-tab flex flex-1 items-center justify-center gap-2 rounded-app-sm px-3 py-2 text-sm font-medium transition", active ? "is-active bg-accent/12 text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
      <Icon size={15} /> {label}
      {count ? <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums", active ? "bg-accent text-white" : "bg-surface-3 text-fg-muted")}>{count}</span> : null}
    </button>
  );
}

function ConversationList({ tr, me, convos, typing, active, onOpen, onFindFriends, onNewGroup }) {
  if (!convos) return <div className="grid flex-1 place-items-center"><Spinner className="text-fg-muted" /></div>;
  const preview = (c) => {
    const typers = Object.values(typing?.[c.id] ?? {});
    if (typers.length) {
      return (
        <span className="chat-typing-preview flex items-center text-accent">
          {isGroup(c) ? typingText(typers, tr) : tr("typing")}
          <Dots />
        </span>
      );
    }
    if (!c.last_id) return tr("No messages yet");
    if (c.last_kind === "system") return systemText({ body: c.last_body, sender_name: c.last_sender_name }, tr);
    const who = c.last_sender_id === me?.id ? tr("You") : isGroup(c) ? c.last_sender_name : null;
    const what = c.last_body ? <span className="truncate">{c.last_body}</span> : <><ImageIcon size={12} className="shrink-0" /> {c.last_photos > 1 ? tr("{n} photos", { n: c.last_photos }) : tr("Photo")}</>;
    return (
      <>
        {who ? `${who}: ` : ""}
        {what}
      </>
    );
  };
  return (
    <>
      <div className="chat-list-head flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("Chats")}</span>
        <Button size="xs" variant="outline" icon={Users} onClick={onNewGroup}>{tr("New group")}</Button>
      </div>
      {!convos.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <EmptyState compact icon={MessageCircle} title={tr("No chats yet")} description={tr("Add a friend, then press Message to start.")} />
          <Button variant="secondary" size="sm" icon={Users} onClick={onFindFriends}>{tr("Find friends")}</Button>
        </div>
      ) : (
        <ul className="chat-list min-h-0 flex-1 overflow-y-auto p-2">
          {convos.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className={cn("chat-list-item flex w-full items-center gap-3 rounded-app-sm px-2.5 py-2 text-left transition", active === c.id ? "is-active bg-accent/12" : "hover:bg-surface-2")}>
                <ConvoAvatar convo={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold text-fg" : "font-medium")}>{c.name}</span>
                    {isGroup(c) ? <span className="shrink-0 text-[10px] text-fg-faint">{memberCount(c.member_count, tr)}</span> : null}
                    {c.last_at ? <span className="ml-auto shrink-0 text-[11px] text-fg-faint">{relativeTime(c.last_at)}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("flex min-w-0 items-center gap-1 truncate text-xs", c.unread ? "text-fg" : "text-fg-muted")}>{preview(c)}</span>
                    {c.unread ? <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">{c.unread}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Pick friends for a group: a searchable checklist with avatars. */
function FriendPicker({ tr, friends, selected, onChange, exclude = [] }) {
  const [q, setQ] = useState("");
  const list = friends.filter((f) => !exclude.includes(f.id) && (!q || `${f.name} ${f.email}`.toLowerCase().includes(q.toLowerCase())));
  if (!friends.filter((f) => !exclude.includes(f.id)).length) return <p className="rounded-app border border-dashed border-line px-3 py-4 text-center text-xs text-fg-muted">{tr("Everyone you are friends with is already here. Add more friends on the Friends tab.")}</p>;
  return (
    <div className="chat-picker">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search friends…")} className="mb-2" />
      <ul className="max-h-64 space-y-0.5 overflow-y-auto">
        {list.map((f) => {
          const on = selected.includes(f.id);
          return (
            <li key={f.id}>
              <label className={cn("chat-person flex cursor-pointer items-center gap-2.5 rounded-app-sm px-2 py-1.5", on && "bg-accent/10")}>
                <Checkbox checked={on} onChange={(v) => onChange(v ? [...selected, f.id] : selected.filter((x) => x !== f.id))} />
                <Avatar name={f.name} color={f.avatar_color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{f.email}</span>
                </span>
              </label>
            </li>
          );
        })}
        {!list.length ? <li className="px-2 py-3 text-center text-xs text-fg-faint">{tr("No matches")}</li> : null}
      </ul>
    </div>
  );
}

function GroupCreateModal({ tr, open, friends, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setTitle("");
    setIds([]);
  };
  const create = async (e) => {
    e?.preventDefault();
    if (!title.trim() || !ids.length || busy) return;
    setBusy(true);
    try {
      const c = await api.post("/api/chat/groups", { title: title.trim(), member_ids: ids });
      toast.success(tr("Group “{title}” created", { title: c.title }));
      reset();
      onCreated(c);
    } catch (err) {
      toast.error(tr("Could not create the group"), err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="sm"
      title={tr("New group")}
      description={tr("Name the group and pick friends to start with. Members can add their own friends later.")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{tr("Cancel")}</Button>
          <Button icon={Users} onClick={create} loading={busy} disabled={!title.trim() || !ids.length}>{tr("Create group")}</Button>
        </>
      }
    >
      <form onSubmit={create} className="space-y-4">
        <Field label={tr("Group name")} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={tr("e.g. Weekend plans")} autoFocus />
        </Field>
        <Field label={tr("Members")} hint={ids.length ? tr("{n} selected", { n: ids.length }) : undefined}>
          <FriendPicker tr={tr} friends={friends} selected={ids} onChange={setIds} />
        </Field>
      </form>
    </Modal>
  );
}

/** Group details: rename (owner), members with remove (owner), add friends (anyone), leave. */
function GroupPanel({ tr, me, convo, friends, open, onClose, onChange, onLeft }) {
  const toast = useToast();
  const owner = convo.my_role === "owner";
  const [title, setTitle] = useState(convo.title ?? "");
  const [adding, setAdding] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "leave" } | { kind: "remove", member }
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast.success(okMsg);
      return r;
    } catch (e) {
      toast.error(tr("Something went wrong"), e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const rename = async () => {
    const t = title.trim();
    if (!t || t === convo.title) return;
    const c = await run(() => api.put(`/api/chat/conversations/${convo.id}`, { title: t }), tr("Group renamed"));
    if (c) onChange(c);
  };
  const addMembers = async () => {
    if (!adding.length) return;
    const c = await run(() => api.post(`/api/chat/conversations/${convo.id}/members`, { user_ids: adding }), tr("{n} added", { n: adding.length }));
    if (c) {
      setAdding([]);
      onChange(c);
    }
  };
  const runConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "remove") {
      const r = await run(() => api.del(`/api/chat/conversations/${convo.id}/members/${c.member.id}`), tr("Removed {name}", { name: c.member.name }));
      if (r) onChange(r);
    } else if (c.kind === "leave") {
      const r = await run(() => api.del(`/api/chat/conversations/${convo.id}`), tr("You left “{title}”", { title: convo.title }));
      if (r) onLeft(convo.id);
    }
  };
  const memberIds = convo.members.map((m) => m.id);
  return (
    <Modal open={open} onClose={onClose} size="sm" title={convo.title} description={memberCount(convo.member_count, tr)}>
      <div className="space-y-5">
        {owner ? (
          <Field label={tr("Group name")}>
            <div className="flex gap-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="flex-1" />
              <Button variant="secondary" icon={Pencil} onClick={rename} loading={busy} disabled={!title.trim() || title.trim() === convo.title}>{tr("Rename")}</Button>
            </div>
          </Field>
        ) : null}
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("Members")}</p>
          <ul className="space-y-0.5">
            {convo.members.map((m) => (
              <li key={m.id} className="chat-person flex items-center gap-2.5 rounded-app-sm px-2 py-1.5">
                <Avatar name={m.name} color={m.avatar_color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{m.id === me?.id ? tr("You") : m.name}</span>
                    {m.role === "owner" ? <Badge tone="amber" size="xs"><Crown size={10} /> {tr("Owner")}</Badge> : null}
                  </span>
                  <span className="block truncate text-[11px] text-fg-muted">{m.email}</span>
                </span>
                {owner && m.id !== me?.id ? <Button size="iconXs" variant="ghost" icon={UserMinus} aria-label={tr("Remove")} data-tip={tr("Remove from group")} onClick={() => setConfirm({ kind: "remove", member: m })} /> : null}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("Add friends")}</p>
          <FriendPicker tr={tr} friends={friends} selected={adding} onChange={setAdding} exclude={memberIds} />
          {adding.length ? <Button size="sm" icon={UserPlus} className="mt-2" onClick={addMembers} loading={busy}>{tr("Add {n} to the group", { n: adding.length })}</Button> : null}
        </section>
        <div className="ui-divider border-t border-line pt-4">
          <Button variant="dangerGhost" icon={LogOut} onClick={() => setConfirm({ kind: "leave" })} disabled={busy}>{tr("Leave group")}</Button>
          {owner && convo.member_count > 1 ? <p className="mt-1 text-[11px] text-fg-muted">{tr("As the owner, leaving hands the group to its longest-standing member.")}</p> : null}
          {convo.member_count === 1 ? <p className="mt-1 text-[11px] text-fg-muted">{tr("You are the last member, so leaving deletes the group and its messages.")}</p> : null}
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        title={confirm?.kind === "remove" ? tr("Remove {name}?", { name: confirm.member.name }) : tr("Leave “{title}”?", { title: convo.title })}
        confirmText={confirm?.kind === "remove" ? tr("Remove") : tr("Leave")}
        description={confirm?.kind === "remove" ? tr("They will stop seeing new messages. A member can add them again.") : convo.member_count === 1 ? tr("The group and its messages will be deleted.") : tr("You will stop receiving messages from this group.")}
      />
    </Modal>
  );
}

const MAX_EDGE = 1920;
const KEEP_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS = 8;

/** Downscale big photos in the browser (JPEG, longest edge 1920 px); GIFs and small images are sent as they are. */
async function prepareImage(file) {
  if (file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("unsupported");
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  if (scale === 1 && file.size <= KEEP_BYTES && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    bitmap.close?.();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("unsupported");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
}

function Thread({ tr, me, convo, messages, onBack, onSent, onLoadEarlier, friends, typers = [], onConvoChange, onLeft }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]); // photos waiting in the composer: { key, file, url }
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { photos, index }
  const [panel, setPanel] = useState(false);
  const group = isGroup(convo);
  // "typing" pings: at most one every 2.5 s while the draft changes, "stopped" after 4 s of quiet or when leaving
  const typingRef = useRef({ on: false, sentAt: 0, timer: null, id: convo.id });
  const signalTyping = (on) => {
    const st = typingRef.current;
    st.on = on;
    st.sentAt = Date.now();
    fetch(`/api/chat/conversations/${st.id}/typing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ typing: on }), keepalive: true }).catch(() => {});
  };
  const onDraftChange = (value) => {
    setDraft(value);
    const st = typingRef.current;
    clearTimeout(st.timer);
    if (value.trim()) {
      if (!st.on || Date.now() - st.sentAt > 2500) signalTyping(true);
      st.timer = setTimeout(() => signalTyping(false), 4000);
    } else if (st.on) signalTyping(false);
  };
  useEffect(() => {
    const st = typingRef.current;
    st.id = convo.id;
    return () => {
      clearTimeout(st.timer);
      if (st.on) signalTyping(false);
    };
  }, [convo.id]);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  // a photo that finishes loading while we sit near the bottom keeps the latest message in view
  const stickToBottom = () => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 480) bottomRef.current?.scrollIntoView({ block: "end" });
  };
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // release preview URLs when leaving the thread
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const count = messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [convo.id, count]);
  const canChat = group || !convo.friend_status || convo.friend_status === "accepted";

  const addFiles = async (list) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    if (pendingRef.current.length + files.length > MAX_PHOTOS) {
      toast.error(tr("Up to {n} photos per message", { n: MAX_PHOTOS }));
      return;
    }
    const prepared = [];
    for (const f of files) {
      try {
        const file = await prepareImage(f);
        prepared.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) });
      } catch {
        toast.error(tr("Could not read {name}", { name: f.name }));
      }
    }
    if (prepared.length) setPending((cur) => [...cur, ...prepared]);
  };
  const removePending = (key) =>
    setPending((cur) => {
      cur.filter((p) => p.key === key).forEach((p) => URL.revokeObjectURL(p.url));
      return cur.filter((p) => p.key !== key);
    });

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    try {
      let m;
      if (pending.length) {
        const fd = new FormData();
        fd.append("body", body);
        for (const p of pending) fd.append("files", p.file, p.file.name);
        m = await api.upload(`/api/chat/conversations/${convo.id}/messages`, fd);
      } else {
        m = await api.post(`/api/chat/conversations/${convo.id}/messages`, { body });
      }
      setDraft("");
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      clearTimeout(typingRef.current.timer);
      typingRef.current.on = false; // the message itself tells the others we stopped
      onSent(m);
    } catch (e) {
      toast.error(tr("Could not send"), e.message);
    } finally {
      setSending(false);
    }
  };
  const lastMine = messages ? [...messages].reverse().find((m) => m.sender_id === me?.id && m.kind !== "system") : null;
  const seenBy = lastMine ? (convo.members ?? []).filter((m) => m.id !== me?.id && Number(m.last_read_message_id) >= lastMine.id) : [];
  const seen = lastMine && (group ? seenBy.length > 0 : Number(convo.peer_last_read) >= lastMine.id);
  const seenLabel = !group ? tr("Seen") : seenBy.length === (convo.members?.length ?? 1) - 1 ? tr("Seen by everyone") : tr("Seen by {names}", { names: seenBy.map((m) => m.name).join(", ") });
  const dropProps = canChat
    ? {
        onDragOver: (e) => {
          if ([...e.dataTransfer.types].includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        },
        onDrop: (e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <>
      <header className="chat-head flex items-center gap-3 border-b border-line px-4 py-3">
        <Button variant="ghost" size="iconSm" icon={ArrowLeft} className="md:hidden" onClick={onBack} aria-label={tr("Back")} />
        <ConvoAvatar convo={convo} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{convo.name}</span>
          <span className="block truncate text-[11px] text-fg-muted">{group ? `${memberCount(convo.member_count, tr)} · ${convo.members.map((m) => (m.id === me?.id ? tr("You") : m.name)).join(", ")}` : convo.email}</span>
        </span>
        {group ? <Button variant="ghost" size="iconSm" icon={Settings2} onClick={() => setPanel(true)} aria-label={tr("Group settings")} data-tip={tr("Group settings")} /> : null}
      </header>
      {group && panel ? <GroupPanel tr={tr} me={me} convo={convo} friends={friends ?? []} open={panel} onClose={() => setPanel(false)} onChange={onConvoChange} onLeft={(id) => { setPanel(false); onLeft(id); }} /> : null}
      <div className="relative flex min-h-0 flex-1 flex-col" {...dropProps}>
        {dragging ? (
          <div className="chat-drop pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-app border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
            <span className="flex items-center gap-2"><ImageIcon size={18} /> {tr("Drop photos to send")}</span>
          </div>
        ) : null}
        <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!messages ? (
            <div className="grid h-full place-items-center"><Spinner className="text-fg-muted" /></div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
              {messages.length >= 50 ? (
                <button type="button" onClick={onLoadEarlier} className="mx-auto mb-2 rounded-full border border-line px-3 py-1 text-[11px] text-fg-muted hover:text-fg">{tr("Load earlier messages")}</button>
              ) : null}
              {messages.length === 0 ? <p className="py-10 text-center text-xs text-fg-faint">{tr("Say hello — this is the start of your conversation.")}</p> : null}
              {messages.map((m, i) => {
                const mine = m.sender_id === me?.id;
                const photos = m.attachments ?? [];
                const prev = messages[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                if (m.kind === "system") {
                  return (
                    <div key={m.id}>
                      {newDay ? <p className="chat-day my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{dayLabel(m.created_at, tr)}</p> : null}
                      <p className="chat-system my-1.5 text-center text-[11px] text-fg-muted" title={formatDateTime(m.created_at)}>{systemText(m, tr)}</p>
                    </div>
                  );
                }
                const grouped = prev && prev.kind !== "system" && prev.sender_id === m.sender_id && !newDay && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60_000;
                const showSender = group && !mine && !grouped;
                const time = <span className={cn("inline-block shrink-0 whitespace-nowrap align-bottom text-[10px] tabular-nums", mine ? "text-white/70" : "text-fg-faint", photos.length ? "ml-auto" : "ml-2")}>{timeOf(m.created_at)}</span>;
                // photo bubbles take their width from the picture (longest edge 360 px), so a caption wraps under it
                const single = photos.length === 1 ? photos[0] : null;
                const imgW = single?.width && single?.height ? Math.round(Math.min(single.width, 360, (360 * single.width) / single.height)) : null;
                const bubbleW = photos.length > 1 ? 372 : imgW ? (m.body ? Math.max(imgW, 240) : imgW) + 12 : undefined;
                return (
                  <div key={m.id}>
                    {newDay ? <p className="chat-day my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{dayLabel(m.created_at, tr)}</p> : null}
                    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
                      {group && !mine ? <span className="w-6 shrink-0">{grouped ? null : <Avatar name={m.sender_name ?? "?"} color={m.sender_color ?? "#94a3b8"} size="xs" />}</span> : null}
                      <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")} style={{ maxWidth: "78%" }}>
                      {showSender ? <span className="chat-sender mb-0.5 ml-1 text-[11px] font-semibold" style={{ color: m.sender_color ?? undefined }}>{m.sender_name}</span> : null}
                      <div
                        className={cn(
                          "chat-bubble max-w-full whitespace-pre-wrap break-words rounded-app text-sm leading-relaxed",
                          photos.length ? "chat-has-photos p-1.5" : "px-3 py-2",
                          mine ? "chat-mine bg-accent text-white" : "chat-theirs bg-surface-2 text-fg"
                        )}
                        title={formatDateTime(m.created_at)}
                        style={bubbleW ? { width: bubbleW } : undefined}
                      >
                        {photos.length ? (
                          <div className={cn("chat-photos", photos.length > 1 && "grid grid-cols-2 gap-1")}>
                            {photos.map((p, pi) => (
                              <button type="button" key={p.id} onClick={() => setLightbox({ photos, index: pi })} className={cn("chat-photo block overflow-hidden rounded-[10px] focus-ring", photos.length > 1 && "aspect-square")} aria-label={p.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.url}
                                  alt={p.name}
                                  width={p.width || undefined}
                                  height={p.height || undefined}
                                  loading="lazy"
                                  onLoad={stickToBottom}
                                  className={photos.length > 1 ? "aspect-square h-full w-full object-cover" : "mx-auto h-auto max-w-full object-contain"}
                                  // reserve the final box before the bytes arrive
                                  style={imgW ? { width: imgW, aspectRatio: `${p.width} / ${p.height}` } : undefined}
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {photos.length ? (
                          <span className="flex items-end gap-2 px-1.5 pt-1">
                            {m.body ? <span className="min-w-0">{m.body}</span> : null}
                            {time}
                          </span>
                        ) : (
                          <>
                            {m.body}
                            {time}
                          </>
                        )}
                      </div>
                      </div>
                    </div>
                    {mine && lastMine?.id === m.id && seen ? <p className="mt-0.5 text-right text-[10px] text-fg-faint">{seenLabel}</p> : null}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <div className="chat-typing flex min-h-6 items-center gap-1.5 px-4 text-[11px] text-fg-muted" aria-live="polite">
          {typers.length ? (
            <>
              <span className="flex -space-x-1.5">
                {typers.slice(0, 3).map((t) => (
                  <Avatar key={t.name} name={t.name} color={t.avatar_color} size="xs" ring />
                ))}
              </span>
              <span>{typingText(typers, tr)}</span>
              <Dots />
            </>
          ) : null}
        </div>
        <div className="chat-composer border-t border-line p-3">
          {canChat ? (
            <div className="mx-auto max-w-3xl">
              {pending.length ? (
                <div className="chat-pending mb-2 flex flex-wrap items-center gap-2">
                  {pending.map((p) => (
                    <span key={p.key} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-16 w-16 rounded-app-sm border border-line object-cover" />
                      <button type="button" aria-label={tr("Remove photo")} onClick={() => removePending(p.key)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fg text-bg shadow focus-ring">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <span className="text-[11px] text-fg-muted">{pending.length > 1 ? tr("{n} photos", { n: pending.length }) : tr("Photo")}</span>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button variant="ghost" size="icon" icon={ImageIcon} onClick={() => fileRef.current?.click()} aria-label={tr("Add photos")} data-tip={tr("Add photos")} disabled={sending} />
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  onPaste={(e) => {
                    if (e.clipboardData?.files?.length) {
                      e.preventDefault();
                      addFiles(e.clipboardData.files);
                    }
                  }}
                  rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                  placeholder={pending.length ? tr("Add a caption (optional)") : tr("Write a message… (Enter to send, Shift+Enter for a new line)")}
                  className="control min-h-[42px] flex-1 resize-none py-2.5"
                  maxLength={4000}
                />
                <Button icon={Send} onClick={send} loading={sending} disabled={!draft.trim() && !pending.length} aria-label={tr("Send")}>{tr("Send")}</Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-fg-muted">{tr("You are no longer friends, so new messages are off. Send a new friend request to reconnect.")}</p>
          )}
        </div>
      </div>
      {lightbox ? <Lightbox tr={tr} photos={lightbox.photos} index={lightbox.index} onIndex={(index) => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} /> : null}
    </>
  );
}

/** Full-screen photo viewer with keyboard navigation and download. */
function Lightbox({ tr, photos, index, onIndex, onClose }) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onIndex]);
  if (!photo) return null;
  const navBtn = "absolute top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-ring";
  return createPortal(
    <div className="chat-lightbox fixed inset-0 z-[110] flex flex-col bg-black/92 text-white" role="dialog" aria-modal="true" aria-label={photo.name} onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-sm">{photo.name}</span>
        <span className="shrink-0 text-xs text-white/60 tabular-nums">{index + 1} / {photos.length}</span>
        <a href={`${photo.url}?download=1`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 focus-ring" aria-label={tr("Download")} data-tip={tr("Download")}>
          <Download size={18} />
        </a>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 focus-ring" aria-label={tr("Close")}>
          <X size={20} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        {hasPrev ? (
          <button type="button" className={`${navBtn} left-3`} aria-label={tr("Previous")} onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}>
            <ChevronLeft size={22} />
          </button>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.name} className="max-h-full max-w-full rounded-app object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        {hasNext ? (
          <button type="button" className={`${navBtn} right-3`} aria-label={tr("Next")} onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}>
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function FriendsPanel({ tr, toast, data, reload, onMessage, onSendRequest }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "rotate" | "remove" | "block", user }
  if (!data) return <div className="grid flex-1 place-items-center"><Spinner className="text-fg-muted" /></div>;

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error(tr("Could not copy"));
    }
  };
  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await reload();
    } catch (e) {
      toast.error(tr("Something went wrong"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const submitCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await onSendRequest(code.trim());
      setCode("");
    } catch (err) {
      toast.error(tr("Could not send the request"), err.message);
    } finally {
      setBusy(false);
    }
  };
  const runConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "rotate") return act(() => api.post("/api/chat/friends/code"), tr("New friend code created"));
    if (c.kind === "remove") return act(() => api.del(`/api/chat/friends/${c.user.id}`), tr("Removed {name} from your friends", { name: c.user.name }));
    if (c.kind === "block") return act(() => api.post(`/api/chat/friends/${c.user.id}/block`), tr("Blocked {name}", { name: c.user.name }));
  };

  const Person = ({ u, children }) => (
    <li className="chat-person flex items-center gap-2.5 rounded-app-sm px-2 py-2">
      <Avatar name={u.name} color={u.avatar_color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{u.name}</span>
        <span className="block truncate text-[11px] text-fg-muted">{u.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
  );

  return (
    <div className="chat-friends min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <div className="chat-qr-card rounded-app border border-line bg-surface-2/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("My friend code")}</p>
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qr} alt={tr("My friend code")} width={112} height={112} className="chat-qr shrink-0 rounded-app bg-white p-1" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-base font-semibold tracking-wider">{data.code}</p>
            <p className="mt-1 text-[11px] leading-snug text-fg-muted">{tr("Let a friend scan this with their phone camera, or send them the code. Their request lands here for you to accept.")}</p>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          <Button size="xs" variant="outline" icon={Copy} onClick={() => copy(data.code, tr("Code copied"))}>{tr("Copy code")}</Button>
          <Button size="xs" variant="outline" icon={Link2} onClick={() => copy(data.link, tr("Link copied"))}>{tr("Copy link")}</Button>
          <Button size="xs" variant="ghost" icon={RefreshCw} className="ml-auto" onClick={() => setConfirm({ kind: "rotate" })}>{tr("New code")}</Button>
        </div>
      </div>

      <form onSubmit={submitCode} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={tr("Enter a friend code")} className="flex-1 font-mono" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <Button type="submit" icon={UserPlus} loading={busy} disabled={!code.trim()}>{tr("Add")}</Button>
      </form>

      {data.incoming.length ? (
        <Section title={tr("Requests for you")} count={data.incoming.length}>
          {data.incoming.map((u) => (
            <Person key={u.id} u={u}>
              <Button size="xs" icon={Check} loading={busy} onClick={() => act(() => api.post(`/api/chat/friends/requests/${u.id}/accept`), tr("You are now friends with {name}", { name: u.name }))}>{tr("Accept")}</Button>
              <Button size="iconXs" variant="ghost" icon={X} aria-label={tr("Decline")} data-tip={tr("Decline")} onClick={() => act(() => api.del(`/api/chat/friends/requests/${u.id}`))} />
            </Person>
          ))}
        </Section>
      ) : null}
      {data.outgoing.length ? (
        <Section title={tr("Waiting for their answer")} count={data.outgoing.length}>
          {data.outgoing.map((u) => (
            <Person key={u.id} u={u}>
              <Button size="xs" variant="ghost" icon={X} onClick={() => act(() => api.del(`/api/chat/friends/requests/${u.id}`), tr("Request cancelled"))}>{tr("Cancel")}</Button>
            </Person>
          ))}
        </Section>
      ) : null}
      <Section title={tr("Friends")} count={data.friends.length}>
        {data.friends.length === 0 ? <li className="px-2 py-3 text-xs text-fg-faint">{tr("No friends yet. Share your code or scan theirs.")}</li> : null}
        {data.friends.map((u) => (
          <Person key={u.id} u={u}>
            <Button size="xs" icon={MessageCircle} onClick={() => onMessage(u)}>{tr("Message")}</Button>
            <Button size="iconXs" variant="ghost" icon={UserMinus} aria-label={tr("Remove")} data-tip={tr("Remove friend")} onClick={() => setConfirm({ kind: "remove", user: u })} />
            <Button size="iconXs" variant="ghost" icon={Ban} aria-label={tr("Block")} data-tip={tr("Block")} onClick={() => setConfirm({ kind: "block", user: u })} />
          </Person>
        ))}
      </Section>
      {data.blocked.length ? (
        <Section title={tr("Blocked")} count={data.blocked.length}>
          {data.blocked.map((u) => (
            <Person key={u.id} u={u}>
              <Button size="xs" variant="ghost" onClick={() => act(() => api.del(`/api/chat/friends/${u.id}/block`), tr("Unblocked {name}", { name: u.name }))}>{tr("Unblock")}</Button>
            </Person>
          ))}
        </Section>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        danger={confirm?.kind !== "rotate"}
        title={confirm?.kind === "rotate" ? tr("Create a new friend code?") : confirm?.kind === "block" ? tr("Block {name}?", { name: confirm.user.name }) : confirm ? tr("Remove {name}?", { name: confirm.user.name }) : ""}
        confirmText={confirm?.kind === "rotate" ? tr("New code") : confirm?.kind === "block" ? tr("Block") : tr("Remove")}
        description={
          confirm?.kind === "rotate"
            ? tr("QR codes and links you shared before will stop working.")
            : confirm?.kind === "block"
              ? tr("They will not be able to message you or send you requests until you unblock them.")
              : confirm
                ? tr("You keep the conversation history, but neither of you can send new messages unless you become friends again.")
                : ""
        }
      />
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section>
      <p className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        {title}
        {count ? <Badge tone="slate">{count}</Badge> : null}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}
