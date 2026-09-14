"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Users, Copy, RefreshCw, UserPlus, Check, X, Send, ArrowLeft, Ban, UserMinus, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Controls";
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

/** Friends (add by QR / code, requests, block) and one-to-one chat with live updates. */
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
    const onMessage = (ev) => {
      const { conversation_id, message } = ev;
      setThreads((t) => {
        const list = t[conversation_id];
        if (!list || list.some((m) => m.id === message.id)) return t;
        return { ...t, [conversation_id]: [...list, message] };
      });
      if (message.sender_id !== user?.id && activeRef.current === conversation_id && document.visibilityState === "visible") markRead(conversation_id, message.id);
      loadConvos();
    };
    const onRead = (ev) =>
      setConvos((list) => (list ?? []).map((c) => (c.id === ev.conversation_id && ev.user_id !== user?.id ? { ...c, peer_last_read: Math.max(Number(c.peer_last_read) || 0, ev.last_read_message_id) } : c)));
    try {
      es = new EventSource("/api/chat/stream");
      es.addEventListener("message", (e) => onMessage(JSON.parse(e.data)));
      es.addEventListener("read", (e) => onRead(JSON.parse(e.data)));
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
  }, [user?.id, loadConvos, loadFriends, loadThread, markRead]);

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
            <ConversationList tr={tr} me={user} convos={convos} active={active} onOpen={(id) => setActive(id)} onFindFriends={() => setTab("friends")} />
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
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState icon={MessageCircle} title={tr("Pick a conversation")} description={tr("Choose a chat on the left, or add a friend with their QR code to start one.")} />
            </div>
          )}
        </section>
      </div>
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

function ConversationList({ tr, me, convos, active, onOpen, onFindFriends }) {
  if (!convos) return <div className="grid flex-1 place-items-center"><Spinner className="text-fg-muted" /></div>;
  if (!convos.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <EmptyState compact icon={MessageCircle} title={tr("No chats yet")} description={tr("Add a friend, then press Message to start.")} />
        <Button variant="secondary" size="sm" icon={Users} onClick={onFindFriends}>{tr("Find friends")}</Button>
      </div>
    );
  }
  return (
    <ul className="chat-list min-h-0 flex-1 overflow-y-auto p-2">
      {convos.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onOpen(c.id)} className={cn("chat-list-item flex w-full items-center gap-3 rounded-app-sm px-2.5 py-2 text-left transition", active === c.id ? "is-active bg-accent/12" : "hover:bg-surface-2")}>
            <Avatar name={c.name} color={c.avatar_color} size="md" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={cn("truncate text-sm", c.unread ? "font-semibold text-fg" : "font-medium")}>{c.name}</span>
                {c.last_at ? <span className="ml-auto shrink-0 text-[11px] text-fg-faint">{relativeTime(c.last_at)}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className={cn("truncate text-xs", c.unread ? "text-fg" : "text-fg-muted")}>{c.last_body ? `${c.last_sender_id === me?.id ? `${tr("You")}: ` : ""}${c.last_body}` : tr("No messages yet")}</span>
                {c.unread ? <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">{c.unread}</span> : null}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thread({ tr, me, convo, messages, onBack, onSent, onLoadEarlier }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const count = messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [convo.id, count]);
  const canChat = !convo.friend_status || convo.friend_status === "accepted";

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.post(`/api/chat/conversations/${convo.id}/messages`, { body });
      setDraft("");
      onSent(m);
    } catch (e) {
      toast.error(tr("Could not send"), e.message);
    } finally {
      setSending(false);
    }
  };
  const lastMine = messages ? [...messages].reverse().find((m) => m.sender_id === me?.id) : null;
  const seen = lastMine && Number(convo.peer_last_read) >= lastMine.id;

  return (
    <>
      <header className="chat-head flex items-center gap-3 border-b border-line px-4 py-3">
        <Button variant="ghost" size="iconSm" icon={ArrowLeft} className="md:hidden" onClick={onBack} aria-label={tr("Back")} />
        <Avatar name={convo.name} color={convo.avatar_color} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{convo.name}</span>
          <span className="block truncate text-[11px] text-fg-muted">{convo.email}</span>
        </span>
      </header>
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const grouped = prev && prev.sender_id === m.sender_id && !newDay && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60_000;
              return (
                <div key={m.id}>
                  {newDay ? <p className="chat-day my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{dayLabel(m.created_at, tr)}</p> : null}
                  <div className={cn("flex", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
                    <div
                      className={cn(
                        "chat-bubble max-w-[78%] whitespace-pre-wrap break-words rounded-app px-3 py-2 text-sm leading-relaxed",
                        mine ? "chat-mine bg-accent text-white" : "chat-theirs bg-surface-2 text-fg"
                      )}
                      title={formatDateTime(m.created_at)}
                    >
                      {m.body}
                      <span className={cn("ml-2 inline-block align-bottom text-[10px] tabular-nums", mine ? "text-white/70" : "text-fg-faint")}>{timeOf(m.created_at)}</span>
                    </div>
                  </div>
                  {mine && lastMine?.id === m.id && seen ? <p className="mt-0.5 text-right text-[10px] text-fg-faint">{tr("Seen")}</p> : null}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div className="chat-composer border-t border-line p-3">
        {canChat ? (
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={Math.min(6, Math.max(1, draft.split("\n").length))}
              placeholder={tr("Write a message… (Enter to send, Shift+Enter for a new line)")}
              className="control min-h-[42px] flex-1 resize-none py-2.5"
              maxLength={4000}
            />
            <Button icon={Send} onClick={send} loading={sending} disabled={!draft.trim()} aria-label={tr("Send")}>{tr("Send")}</Button>
          </div>
        ) : (
          <p className="text-center text-xs text-fg-muted">{tr("You are no longer friends, so new messages are off. Send a new friend request to reconnect.")}</p>
        )}
      </div>
    </>
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
