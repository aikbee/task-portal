"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Users, Copy, RefreshCw, UserPlus, Check, X, Send, ArrowLeft, Ban, UserMinus, Link2, Image as ImageIcon, ChevronLeft, ChevronRight, Download, Settings2, LogOut, Crown, Pencil, SmilePlus, Mic, Play, Pause, Search, ChevronUp, ChevronDown, ArrowDown, MoreHorizontal, Trash2, CheckCheck, Circle, CircleCheck, Paperclip, File, FileText, FileSpreadsheet, FileArchive, FileCode, FileVideo, FileAudio } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import AvatarPicker, { prepareAvatar } from "@/components/ui/AvatarPicker";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { Input, Checkbox, Field } from "@/components/ui/Controls";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { cn, relativeTime, formatDateTime, formatBytes } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useClickOutside, useDebouncedValue, useMediaQuery } from "@/lib/hooks";

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
    case "image":
      return tr("{name} changed the group picture", { name });
    default:
      return m.body;
  }
}
const isGroup = (c) => c?.kind === "group";
/** Wrap every case-insensitive occurrence of `q` in <mark>. */
function highlight(text, q) {
  if (!q || !text) return text;
  const parts = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = 0;
  let at = lower.indexOf(needle);
  if (at < 0) return text;
  while (at >= 0) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark key={`${at}`} className="chat-mark rounded-sm px-px">{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
    at = lower.indexOf(needle, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts;
}
/** A short window of text around the first match. */
function snippet(text, q, span = 60) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text.slice(0, span * 2);
  const start = Math.max(0, at - span);
  const end = Math.min(text.length, at + q.length + span);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
const TYPING_TTL = 6000; // a typer is forgotten after this unless they ping again
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"];
const VOICE_MAX_MS = 5 * 60 * 1000;
const clock = (ms) => `${Math.floor((ms || 0) / 60000)}:${String(Math.floor(((ms || 0) % 60000) / 1000)).padStart(2, "0")}`;
const RECORD_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);

/** Play / pause, seekable progress, elapsed time and a speed toggle for a voice note. */
function VoicePlayer({ tr, src, duration, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // ms
  const [rate, setRate] = useState(1);
  const total = duration || 0;
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = (ratio * total) / 1000;
    setPos(ratio * total);
  };
  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };
  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const tone = mine ? "text-white" : "text-fg";
  return (
    <div className={cn("chat-voice flex items-center gap-2.5 px-1 py-0.5", tone)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
      />
      <button type="button" onClick={toggle} className={cn("chat-voice-btn grid h-9 w-9 shrink-0 place-items-center rounded-full transition focus-ring", mine ? "bg-white/20 hover:bg-white/30" : "bg-accent text-white hover:bg-accent-strong")} aria-label={playing ? tr("Pause") : tr("Play")}>
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("chat-voice-track relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full", mine ? "bg-white/30" : "bg-fg/15")} onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.round(pos)} aria-label={tr("Position")}>
          <span className={cn("chat-voice-fill absolute inset-y-0 left-0 rounded-full", mine ? "bg-white" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
        <div className={cn("mt-1 flex items-center gap-2 text-[10px] tabular-nums", mine ? "text-white/80" : "text-fg-muted")}>
          <Mic size={10} />
          <span>{playing || pos ? `${clock(pos)} / ${clock(total)}` : clock(total)}</span>
          <button type="button" onClick={cycleRate} className={cn("ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold transition focus-ring", mine ? "bg-white/20 hover:bg-white/30" : "bg-fg/10 hover:bg-fg/15")} aria-label={tr("Playback speed")}>
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}
/** Newest server state wins: a toggle answer that arrives after a later live event is ignored. Optimistic updates carry no stamp. */
function applyReactions(m, reactions, at) {
  if (at && m.reactions_at && at < m.reactions_at) return m;
  return { ...m, reactions, reactions_at: at ?? m.reactions_at };
}

/** Who (other than me and the sender) has read a message: their read pointer is at or past it. */
function readersOf(m, convo, me) {
  const others = (convo.members ?? []).filter((u) => u.id !== me?.id && u.id !== m.sender_id);
  const read = others.filter((u) => Number(u.last_read_message_id) >= m.id);
  return { read, pending: others.filter((u) => !read.includes(u)), others };
}
/** ✓ sent · ✓✓ muted: read by some · ✓✓ accent: read by everyone. */
function Ticks({ tr, state, onClick, mine, label }) {
  const cls = cn("chat-ticks inline-flex shrink-0 items-center", mine ? (state === "all" ? "text-white" : "text-white/60") : state === "all" ? "text-accent" : "text-fg-faint");
  const icon = state === "sent" ? <Check size={12} strokeWidth={2.5} /> : <CheckCheck size={13} strokeWidth={2.5} />;
  if (!onClick) return <span className={cls} title={label} aria-label={label}>{icon}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "rounded-full hover:opacity-100 focus-ring")} title={label} aria-label={tr("Who has read this")}>
      {icon}
    </button>
  );
}
/** Popover listing who has read a group message and who has not yet. */
function ReceiptsPopover({ tr, read, pending, onClose, align }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const Row = ({ u, done }) => (
    <li className="flex items-center gap-2 px-2 py-1 text-xs">
      <Avatar name={u.name} color={u.avatar_color} avatar={u.avatar} size="xs" />
      <span className="min-w-0 flex-1 truncate">{u.name}</span>
      {done ? <CircleCheck size={13} className="shrink-0 text-accent" /> : <Circle size={13} className="shrink-0 text-fg-faint" />}
    </li>
  );
  return (
    <div ref={ref} className={cn("chat-receipts absolute bottom-full z-20 mb-1 w-56 rounded-app border border-line bg-surface p-1.5 text-fg shadow-app-lg anim-pop", align === "right" ? "right-0" : "left-0")} role="dialog" aria-label={tr("Read receipts")}>
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{read.length ? tr("Read by {n} of {m}", { n: read.length, m: read.length + pending.length }) : tr("Not read yet")}</p>
      <ul className="max-h-48 overflow-y-auto">
        {read.map((u) => <Row key={u.id} u={u} done />)}
        {pending.map((u) => <Row key={u.id} u={u} done={false} />)}
      </ul>
    </div>
  );
}

/** Small menu with Edit / Delete for a message. */
function MessageMenu({ tr, canEdit, canDelete, onEdit, onDelete, onClose, align }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div ref={ref} className={cn("chat-menu absolute bottom-full z-20 mb-1 min-w-32 overflow-hidden rounded-app border border-line bg-surface p-1 shadow-app-lg anim-pop", align === "right" ? "right-0" : "left-0")} role="menu">
      {canEdit ? (
        <button type="button" role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2 rounded-app-sm px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 focus-ring">
          <Pencil size={14} /> {tr("Edit")}
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 rounded-app-sm px-2.5 py-1.5 text-left text-sm text-rose-500 hover:bg-rose-500/10 focus-ring">
          <Trash2 size={14} /> {tr("Delete")}
        </button>
      ) : null}
    </div>
  );
}

/** Floating row of quick reactions above a bubble. */
function ReactionPicker({ tr, mine, onPick, onClose, align }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div ref={ref} className={cn("chat-picker-pop absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-app-lg anim-pop", align === "right" ? "right-0" : "left-0")} role="menu" aria-label={tr("Add reaction")}>
      {REACTIONS.map((e) => (
        <button key={e} type="button" role="menuitemcheckbox" onClick={() => onPick(e)} className={cn("chat-picker-emoji grid h-8 w-8 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-surface-2", mine.includes(e) && "is-mine bg-accent/15")} aria-label={e} aria-checked={mine.includes(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}
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
function ConvoAvatar({ convo, size = "md", className }) {
  if (!isGroup(convo)) return <Avatar name={convo.name} color={convo.avatar_color} avatar={convo.avatar ?? "initials"} size={size} className={className} />;
  return <Avatar name={convo.name} color={convo.avatar_color} avatar={convo.avatar ?? null} fallback="group" size={size} className={cn("chat-group-avatar", className)} />;
}

/** Friends (add by QR / code, requests, block), one-to-one and group chat with live updates. */
export default function ChatModule() {
  const tr = useT();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const setCounts = useUI((s) => s.setCounts);
  const [tab, setTab] = useState(sp.get("add") || sp.get("tab") === "friends" ? "friends" : "chats");
  const [convos, setConvos] = useState(null);
  const [friends, setFriends] = useState(null);
  const [active, setActive] = useState(() => Number(sp.get("c")) || null);
  const [threads, setThreads] = useState({});
  const [pendingAdd, setPendingAdd] = useState(null); // { code, user, relation } from a scanned QR link
  const [newGroup, setNewGroup] = useState(false);
  const [typing, setTyping] = useState({}); // conversation id -> { user id: { name, avatar_color, until } }
  const [focusId, setFocusId] = useState(null); // message to scroll to and flash after a search jump
  const [unreadFrom, setUnreadFrom] = useState({}); // conversation id -> first message id that was unread when it was opened
  const [detached, setDetached] = useState({}); // conversation id -> true while the loaded window stops before the newest message
  const jumpRef = useRef(null); // { cid, mid } consumed by the thread-loading effect
  const onFocused = useCallback(() => setFocusId(null), []);
  const activeRef = useRef(active);
  const toastRef = useRef(toast);
  const detachedRef = useRef(detached);
  const convosRef = useRef(convos);
  useEffect(() => {
    activeRef.current = active;
    toastRef.current = toast;
    detachedRef.current = detached;
    convosRef.current = convos;
  }, [active, toast, detached, convos]);
  /** A loaded window is "older" when it stops before the conversation's newest message. */
  const isDetached = (cid, list) => {
    const last = convosRef.current?.find((c) => c.id === cid)?.last_id;
    return list.length > 0 && (last ? list[list.length - 1].id < last : list.length === 61);
  };

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

  // opening a thread loads its newest page (or a window around a searched message) and marks it read
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const jump = jumpRef.current?.cid === active ? jumpRef.current : null;
    jumpRef.current = null;
    api
      .get(`/api/chat/conversations/${active}/messages${jump ? `?around=${jump.mid}` : ""}`)
      .then((list) => {
        if (!alive) return;
        setThreads((t) => ({ ...t, [active]: list }));
        if (jump) {
          setDetached((d) => ({ ...d, [active]: isDetached(active, list) }));
          setFocusId(jump.mid);
          if (list.length) markRead(active, list[list.length - 1].id);
        } else {
          setDetached((d) => (d[active] ? { ...d, [active]: false } : d));
          const lastRead = Number(convosRef.current?.find((c) => c.id === active)?.last_read_message_id) || 0;
          const first = list.find((m) => m.id > lastRead && m.sender_id !== user?.id && m.kind !== "system");
          setUnreadFrom((u) => ({ ...u, [active]: first?.id ?? null }));
          if (list.length) markRead(active, list[list.length - 1].id);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, markRead, user?.id]);
  /** Open a conversation at one message (from search). */
  const jumpTo = (cid, mid) => {
    jumpRef.current = { cid, mid };
    setTab("chats");
    if (active === cid) {
      // same thread: fetch the window directly, the effect will not re-run
      jumpRef.current = null;
      api
        .get(`/api/chat/conversations/${cid}/messages?around=${mid}`)
        .then((list) => {
          setThreads((t) => ({ ...t, [cid]: list }));
          setDetached((d) => ({ ...d, [cid]: isDetached(cid, list) }));
          setFocusId(mid);
        })
        .catch(() => {});
    } else setActive(cid);
  };
  /** Back to the newest page after a jump. */
  const jumpToLatest = async (cid) => {
    const list = await loadThread(cid);
    setDetached((d) => ({ ...d, [cid]: false }));
    if (list?.length) {
      setFocusId(list[list.length - 1].id);
      markRead(cid, list[list.length - 1].id);
    }
  };

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
        if (ev.typing) cur[ev.user_id] = { name: ev.name, avatar_color: ev.avatar_color, avatar: ev.avatar, until: Date.now() + TYPING_TTL };
        else delete cur[ev.user_id];
        const next = { ...t };
        if (Object.keys(cur).length) next[ev.conversation_id] = cur;
        else delete next[ev.conversation_id];
        return next;
      });
    };
    const onMessageUpdated = (ev) => {
      setThreads((t) => {
        const list = t[ev.conversation_id];
        if (!list) return t;
        return { ...t, [ev.conversation_id]: list.map((m) => (m.id === ev.message.id ? { ...m, ...ev.message } : m)) };
      });
      loadConvos();
    };
    const onReaction = (ev) =>
      setThreads((t) => {
        const list = t[ev.conversation_id];
        if (!list) return t;
        return { ...t, [ev.conversation_id]: list.map((m) => (m.id === ev.message_id ? applyReactions(m, ev.reactions, ev.at) : m)) };
      });
    const onMessage = (ev) => {
      const { conversation_id, message } = ev;
      onTyping({ conversation_id, user_id: message.sender_id, typing: false });
      if (detachedRef.current[conversation_id]) {
        // the thread shows an older window: leave it alone, the "newer messages" pill is the way back
        loadConvos();
        return;
      }
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
      es.addEventListener("reaction", (e) => onReaction(JSON.parse(e.data)));
      es.addEventListener("message_updated", (e) => onMessageUpdated(JSON.parse(e.data)));
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
      <PageHeader title={tr("Chat")} crumbs={[]} hideTitle />
      <div className="chat-shell ui-card card flex overflow-hidden p-0 max-md:-mx-4 max-md:-my-5 max-md:h-[calc(100dvh-var(--topbar-h)-var(--bottombar-h)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:rounded-none max-md:border-x-0 max-md:border-t-0 md:h-[calc(100dvh-var(--topbar-h)-var(--bottombar-h)-40px)] md:min-h-[520px]">
        <aside className={cn("chat-side flex w-full shrink-0 flex-col border-r border-line md:w-[340px]", active && "hidden md:flex")}>
          <div className="chat-tabs mx-2 mt-2 flex gap-1 rounded-full bg-surface-2/80 p-1">
            <TabButton active={tab === "chats"} icon={MessageCircle} label={tr("Chats")} count={unreadTotal} onClick={() => setTab("chats")} />
            <TabButton active={tab === "friends"} icon={Users} label={tr("Friends")} count={pendingIn} onClick={() => setTab("friends")} />
          </div>
          {tab === "chats" ? (
            <ConversationList tr={tr} me={user} convos={convos} typing={typing} active={active} onOpen={(id) => setActive(id)} onFindFriends={() => setTab("friends")} onNewGroup={() => setNewGroup(true)} onJump={jumpTo} />
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
                setUnreadFrom((u) => (u[active] ? { ...u, [active]: null } : u)); // replying ends the "unread" marker
                if (detached[active]) {
                  jumpToLatest(active);
                  return;
                }
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
              focusId={focusId}
              onFocused={onFocused}
              unreadFrom={unreadFrom[active] ?? null}
              detached={Boolean(detached[active])}
              onJump={jumpTo}
              onJumpLatest={() => jumpToLatest(active)}
              onMessageChange={(msg) => {
                setThreads((t) => ({ ...t, [active]: (t[active] ?? []).map((m) => (m.id === msg.id ? { ...m, ...msg } : m)) }));
                loadConvos();
              }}
              onReactions={(messageId, reactions, at) => setThreads((t) => ({ ...t, [active]: (t[active] ?? []).map((m) => (m.id === messageId ? applyReactions(m, reactions, at) : m)) }))}
              onConvoChange={upsertConvo}
              onLeft={(id) => {
                setConvos((list) => (list ?? []).filter((c) => c.id !== id));
                setActive(null);
              }}
            />
          ) : (
            <div className="chat-empty grid flex-1 place-items-center p-6">
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
    <button type="button" onClick={onClick} className={cn("chat-tab flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition", active ? "is-active bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
      <Icon size={15} /> {label}
      {count ? <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums", active ? "bg-accent text-white" : "bg-surface-3 text-fg-muted")}>{count}</span> : null}
    </button>
  );
}

/** Results of a message search (global or one chat), newest first. */
function SearchResults({ tr, me, q, results, onPick, activeId, compact = false }) {
  if (!results) return <div className="grid flex-1 place-items-center py-6"><Spinner className="text-fg-muted" /></div>;
  if (!results.length) return <p className="px-3 py-6 text-center text-xs text-fg-faint">{tr("No messages match")}</p>;
  return (
    <ul className={cn("chat-results min-h-0 flex-1 overflow-y-auto", compact ? "p-1" : "p-2")}>
      {results.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onPick(r)} className={cn("chat-result flex w-full items-start gap-2.5 rounded-app-sm px-2.5 py-2 text-left transition hover:bg-surface-2", activeId === r.id && "is-active bg-accent/12")}>
            {compact ? null : <ConvoAvatar convo={{ kind: r.conversation_kind, name: r.conversation_name, avatar_color: r.conversation_color, avatar: r.conversation_avatar }} size="sm" className="mt-0.5" />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] text-fg-muted">
                {compact ? null : <span className="truncate font-semibold text-fg">{r.conversation_name}</span>}
                {r.sender_id === me?.id ? <span className="truncate">{tr("You")}</span> : compact || r.conversation_kind === "group" ? <span className="truncate">{r.sender_name}</span> : null}
                <span className="ml-auto shrink-0 text-fg-faint">{relativeTime(r.created_at)}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-fg [overflow-wrap:anywhere]">{highlight(snippet(r.body, q), q)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversationList({ tr, me, convos, typing, active, onOpen, onFindFriends, onNewGroup, onJump }) {
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q.trim(), 300);
  const [results, setResults] = useState(null); // { q, list } for the last answered query; loading while q differs
  useEffect(() => {
    if (dq.length < 2) return;
    let alive = true;
    api
      .get(`/api/chat/search?q=${encodeURIComponent(dq)}`)
      .then((r) => alive && setResults({ q: dq, list: r }))
      .catch(() => alive && setResults({ q: dq, list: [] }));
    return () => {
      alive = false;
    };
  }, [dq]);
  if (!convos) return <div className="grid flex-1 place-items-center"><Spinner className="text-fg-muted" /></div>;
  const searching = dq.length >= 2;
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
    if (c.last_deleted) return <span className="pr-1 italic text-fg-faint">{tr("Message deleted")}</span>;
    const who = c.last_sender_id === me?.id ? tr("You") : isGroup(c) ? c.last_sender_name : null;
    const what = c.last_body ? (
      <span className="truncate">{c.last_body}</span>
    ) : c.last_voice != null ? (
      <><Mic size={12} className="shrink-0" /> {tr("Voice message")} · {clock(c.last_voice)}</>
    ) : c.last_files && !c.last_photos ? (
      <><Paperclip size={12} className="shrink-0" /> <span className="truncate">{c.last_files > 1 ? tr("{n} files", { n: c.last_files }) : c.last_file_name}</span></>
    ) : (
      <><ImageIcon size={12} className="shrink-0" /> {c.last_photos > 1 ? tr("{n} photos", { n: c.last_photos }) : tr("Photo")}</>
    );
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
      <div className="chat-search relative px-3 pb-2">
        <Search size={14} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-fg-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search messages…")} className="h-9 pl-8 pr-8 text-sm" aria-label={tr("Search messages")} />
        {q ? (
          <button type="button" onClick={() => setQ("")} className="absolute right-5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg focus-ring" aria-label={tr("Clear search")}>
            <X size={13} />
          </button>
        ) : null}
      </div>
      {searching ? (
        <SearchResults tr={tr} me={me} q={dq} results={results?.q === dq ? results.list : null} onPick={(r) => onJump(r.conversation_id, r.id)} />
      ) : !convos.length ? (
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
                <Avatar name={f.name} color={f.avatar_color} avatar={f.avatar} size="sm" />
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
  const [picBusy, setPicBusy] = useState(false);
  const savePicture = async (fn) => {
    setPicBusy(true);
    try {
      const c = await fn();
      onChange(c);
      toast.success(tr("Picture updated"));
    } catch (e) {
      toast.error(tr("Could not update the picture"), e.message);
    } finally {
      setPicBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={convo.title} description={memberCount(convo.member_count, tr)}>
      <div className="space-y-5">
        {owner ? (
          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("Group picture")}</p>
            <AvatarPicker
              value={convo.avatar ?? null}
              color={convo.avatar_color}
              name={convo.title}
              owner="group"
              busy={picBusy}
              onPick={(v) => savePicture(() => api.put(`/api/chat/conversations/${convo.id}/avatar`, { avatar: v }))}
              onUpload={(file) =>
                savePicture(async () => {
                  const fd = new FormData();
                  fd.append("file", await prepareAvatar(file));
                  return api.upload(`/api/chat/conversations/${convo.id}/avatar`, fd);
                })
              }
              onClear={() => savePicture(() => api.del(`/api/chat/conversations/${convo.id}/avatar`))}
            />
          </section>
        ) : null}
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
                <Avatar name={m.name} color={m.avatar_color} avatar={m.avatar} size="sm" />
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
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const INLINE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "video/mp4", "video/webm", "application/pdf", "text/plain"]);
/** An icon that fits the file's type or extension. */
function FileGlyph({ name = "", mime = "", size = 18, className }) {
  const ext = name.split(".").pop().toLowerCase();
  const props = { size, className };
  if (/pdf|msword|wordprocessing|rtf/.test(mime) || ["pdf", "doc", "docx", "rtf", "odt", "txt", "md"].includes(ext)) return <FileText {...props} />;
  if (/spreadsheet|excel|csv/.test(mime) || ["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return <FileSpreadsheet {...props} />;
  if (/zip|compressed|tar|gzip|7z|rar/.test(mime) || ["zip", "tar", "gz", "7z", "rar"].includes(ext)) return <FileArchive {...props} />;
  if (/javascript|json|xml|html|css|x-sh/.test(mime) || ["js", "ts", "jsx", "tsx", "json", "xml", "html", "css", "py", "sh", "sql", "yml", "yaml"].includes(ext)) return <FileCode {...props} />;
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext)) return <FileVideo {...props} />;
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "flac", "aac"].includes(ext)) return <FileAudio {...props} />;
  return <File {...props} />;
}
/** A file attachment card: icon, name, size, open or download. */
function FileCard({ tr, file, mine }) {
  const inline = INLINE_MIMES.has(file.mime);
  return (
    <div className={cn("chat-file flex items-center gap-2.5 rounded-[10px] px-2.5 py-2", mine ? "bg-white/15" : "bg-fg/5")}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-app-sm", mine ? "bg-white/20" : "bg-accent/12 text-accent")}>
        <FileGlyph name={file.name} mime={file.mime} size={18} />
      </span>
      <a href={inline ? file.url : `${file.url}?download=1`} target={inline ? "_blank" : undefined} rel="noopener" className="min-w-0 flex-1 focus-ring rounded-sm" title={file.name}>
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className={cn("block text-[11px]", mine ? "text-white/70" : "text-fg-muted")}>{formatBytes(file.size)}{file.mime && file.mime !== "application/octet-stream" ? ` · ${file.mime.split("/").pop().toUpperCase().slice(0, 12)}` : ""}</span>
      </a>
      <a href={`${file.url}?download=1`} className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full transition focus-ring", mine ? "hover:bg-white/20" : "hover:bg-surface-3")} aria-label={tr("Download {name}", { name: file.name })} data-tip={tr("Download")}>
        <Download size={15} />
      </a>
    </div>
  );
}

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

function Thread({ tr, me, convo, messages, onBack, onSent, onLoadEarlier, friends, typers = [], focusId, onFocused, unreadFrom, detached, onJump, onJumpLatest, onReactions, onMessageChange, onConvoChange, onLeft }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]); // photos waiting in the composer: { key, file, url }
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { photos, index }
  const [panel, setPanel] = useState(false);
  const [picker, setPicker] = useState(null); // message id with the reaction picker open
  const [menu, setMenu] = useState(null); // message id with the edit/delete menu open
  const [receipts, setReceipts] = useState(null); // message id with the read-receipts popover open
  const narrow = useMediaQuery("(max-width: 640px)"); // phones: compact composer buttons and a short placeholder
  const [editing, setEditing] = useState(null); // { id, text } while editing a message inline
  const [confirmDelete, setConfirmDelete] = useState(null); // message about to be deleted
  const [deleting, setDeleting] = useState(false);
  const editRef = useRef(null);
  const startEdit = (m) => {
    setMenu(null);
    setEditing({ id: m.id, text: m.body });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    const original = messages?.find((m) => m.id === editing.id);
    if (!original) return setEditing(null);
    const hasFiles = (original.attachments ?? []).length > 0;
    if (!text && !hasFiles) return; // an empty text message cannot be saved; delete it instead
    if (text === original.body) return setEditing(null);
    try {
      const updated = await api.put(`/api/chat/messages/${editing.id}`, { body: text });
      onMessageChange(updated);
      setEditing(null);
    } catch (e) {
      toast.error(tr("Could not save the edit"), e.message);
    }
  };
  const deleteMessage = async () => {
    const m = confirmDelete;
    if (!m) return;
    setDeleting(true);
    try {
      const updated = await api.del(`/api/chat/messages/${m.id}`);
      onMessageChange(updated);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(tr("Could not delete the message"), e.message);
    } finally {
      setDeleting(false);
    }
  };
  const [find, setFind] = useState(null); // { q, results, idx } while searching inside this chat
  const findQ = useDebouncedValue(find?.q?.trim() ?? "", 300);
  const findInputRef = useRef(null);
  useEffect(() => {
    if (!find || findQ.length < 2) return;
    let alive = true;
    api
      .get(`/api/chat/search?q=${encodeURIComponent(findQ)}&c=${convo.id}`)
      .then((r) => {
        if (!alive) return;
        setFind((f) => (f ? { ...f, results: r, idx: r.length ? 0 : -1 } : f));
        if (r.length) onJump(convo.id, r[0].id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [findQ, convo.id, find ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const goResult = (idx) => {
    if (!find?.results?.length) return;
    const i = (idx + find.results.length) % find.results.length;
    setFind((f) => ({ ...f, idx: i }));
    onJump(convo.id, find.results[i].id);
  };
  // scroll to and flash a message after a search jump
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`msg-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("chat-flash");
    const t = setTimeout(() => {
      el.classList.remove("chat-flash");
      onFocused();
    }, 1600);
    return () => {
      clearTimeout(t);
      el.classList.remove("chat-flash");
    };
  }, [focusId, onFocused]);
  const activeQ = find && findQ.length >= 2 ? findQ : "";
  const renderBody = (text) => (activeQ ? highlight(text, activeQ) : text);
  const [rec, setRec] = useState(null); // { elapsed, levels[] } while recording
  const recRef = useRef(null); // { recorder, stream, chunks, mime, startedAt, timer, ctx, analyser, data, send }
  const group = isGroup(convo);
  const stopRecording = ({ send }) => {
    const r = recRef.current;
    if (!r) return;
    r.send = send;
    clearInterval(r.timer);
    if (r.recorder.state !== "inactive") r.recorder.stop();
    else r.finish();
  };
  const startRecording = async () => {
    if (recRef.current || sending) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(tr("Microphone access was refused"), tr("Allow the microphone for this site to record a voice message."));
      return;
    }
    const mime = RECORD_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const r = { recorder, stream, chunks: [], mime: recorder.mimeType || mime || "audio/webm", startedAt: Date.now(), timer: null, send: false };
    try {
      r.ctx = new (window.AudioContext || window.webkitAudioContext)();
      r.analyser = r.ctx.createAnalyser();
      r.analyser.fftSize = 256;
      r.ctx.createMediaStreamSource(stream).connect(r.analyser);
      r.data = new Uint8Array(r.analyser.fftSize);
    } catch {}
    r.finish = async () => {
      recRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      r.ctx?.close().catch(() => {});
      const elapsed = Math.min(VOICE_MAX_MS, Date.now() - r.startedAt);
      setRec(null);
      if (!r.send || !r.chunks.length || elapsed < 500) return;
      const blob = new Blob(r.chunks, { type: r.mime });
      const ext = r.mime.includes("mp4") ? "m4a" : r.mime.includes("ogg") ? "ogg" : "webm";
      const fd = new FormData();
      fd.append("body", "");
      fd.append("duration", String(elapsed));
      fd.append("voice", blob, `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`);
      setSending(true);
      try {
        const m = await api.upload(`/api/chat/conversations/${convo.id}/messages`, fd);
        onSent(m);
      } catch (e) {
        toast.error(tr("Could not send the voice message"), e.message);
      } finally {
        setSending(false);
      }
    };
    recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
    recorder.onstop = () => r.finish();
    recRef.current = r;
    setRec({ elapsed: 0, levels: [] });
    recorder.start(250);
    r.timer = setInterval(() => {
      const elapsed = Date.now() - r.startedAt;
      let level = 0;
      if (r.analyser) {
        r.analyser.getByteTimeDomainData(r.data);
        let sum = 0;
        for (const v of r.data) sum += (v - 128) * (v - 128);
        level = Math.min(1, Math.sqrt(sum / r.data.length) / 40);
      }
      setRec((cur) => ({ elapsed, levels: [...(cur?.levels ?? []).slice(-39), level] }));
      if (elapsed >= VOICE_MAX_MS) stopRecording({ send: true });
    }, 150);
  };
  // leaving the thread discards a recording in progress
  useEffect(() => () => stopRecording({ send: false }), []);
  const toggleReaction = async (m, emoji) => {
    setPicker(null);
    // optimistic flip, then the server's answer (and the live event) settle it
    const had = (m.reactions ?? []).some((r) => r.emoji === emoji && r.user_ids.includes(me?.id));
    const next = (m.reactions ?? [])
      .map((r) => (r.emoji !== emoji ? r : had ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((x) => x !== me?.id), names: r.names.filter((n) => n !== me?.name) } : { ...r, count: r.count + 1, user_ids: [...r.user_ids, me?.id], names: [...r.names, me?.name] }))
      .filter((r) => r.count > 0);
    if (!had && !next.some((r) => r.emoji === emoji)) next.push({ emoji, count: 1, user_ids: [me?.id], names: [me?.name] });
    onReactions(m.id, next);
    try {
      const r = await api.post(`/api/chat/messages/${m.id}/reactions`, { emoji });
      onReactions(m.id, r.reactions, r.at);
    } catch (e) {
      onReactions(m.id, m.reactions ?? []);
      toast.error(tr("Could not react"), e.message);
    }
  };
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
  const anyRef = useRef(null);
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
  useEffect(() => () => pendingRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);
  const count = messages?.length ?? 0;
  useEffect(() => {
    if (focusId || detached) return; // a search jump positions the thread itself
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [convo.id, count]); // eslint-disable-line react-hooks/exhaustive-deps
  // when a chat opens with unread messages, start at the "Unread messages" line instead of the bottom
  useEffect(() => {
    if (!unreadFrom) return;
    const el = document.getElementById(`unread-${convo.id}`);
    if (el) el.scrollIntoView({ block: "center" });
  }, [convo.id, unreadFrom]);
  const canChat = group || !convo.friend_status || convo.friend_status === "accepted";

  const addFiles = async (list) => {
    const files = [...(list ?? [])].filter((f) => f && f.size > 0);
    if (!files.length) return;
    if (pendingRef.current.length + files.length > MAX_PHOTOS) {
      toast.error(tr("Up to {n} attachments per message", { n: MAX_PHOTOS }));
      return;
    }
    const prepared = [];
    for (const f of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (f.type.startsWith("image/") && f.type !== "image/svg+xml") {
        try {
          const file = await prepareImage(f);
          prepared.push({ key, kind: "image", file, url: URL.createObjectURL(file) });
          continue;
        } catch {
          // not decodable as a picture: send it as a plain file below
        }
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(tr("{name} is larger than 20 MB", { name: f.name }));
        continue;
      }
      prepared.push({ key, kind: "file", file: f, url: null });
    }
    if (prepared.length) setPending((cur) => [...cur, ...prepared]);
  };
  const removePending = (key) =>
    setPending((cur) => {
      cur.filter((p) => p.key === key && p.url).forEach((p) => URL.revokeObjectURL(p.url));
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
      pending.forEach((p) => p.url && URL.revokeObjectURL(p.url));
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
  const lastMine = messages ? [...messages].reverse().find((m) => m.sender_id === me?.id && m.kind !== "system" && !m.deleted_at) : null;
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
        <Button variant="ghost" size="iconSm" icon={Search} onClick={() => { setFind((f) => (f ? null : { q: "", results: null, idx: -1 })); setTimeout(() => findInputRef.current?.focus(), 50); }} aria-label={tr("Search in this chat")} data-tip={tr("Search in this chat")} className={cn(find && "text-accent")} />
        {group ? <Button variant="ghost" size="iconSm" icon={Settings2} onClick={() => setPanel(true)} aria-label={tr("Group settings")} data-tip={tr("Group settings")} /> : null}
      </header>
      {find ? (
        <div className="chat-find flex items-center gap-2 border-b border-line px-3 py-2" onKeyDown={(e) => e.key === "Escape" && setFind(null)}>
          <Search size={14} className="shrink-0 text-fg-faint" />
          <input
            ref={findInputRef}
            value={find.q}
            onChange={(e) => setFind((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goResult((find.idx < 0 ? -1 : find.idx) + (e.shiftKey ? -1 : 1));
              }
            }}
            placeholder={tr("Search in this chat…")}
            className="control h-8 min-w-0 flex-1 text-sm"
            aria-label={tr("Search in this chat")}
          />
          <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">{find.results ? (find.results.length ? tr("{i} of {n}", { i: find.idx + 1, n: find.results.length }) : tr("No matches")) : findQ.length >= 2 ? "…" : ""}</span>
          <Button variant="ghost" size="iconXs" icon={ChevronUp} onClick={() => goResult(find.idx - 1)} disabled={!find.results?.length} aria-label={tr("Previous result")} />
          <Button variant="ghost" size="iconXs" icon={ChevronDown} onClick={() => goResult(find.idx + 1)} disabled={!find.results?.length} aria-label={tr("Next result")} />
          <Button variant="ghost" size="iconXs" icon={X} onClick={() => setFind(null)} aria-label={tr("Close search")} />
        </div>
      ) : null}
      {group && panel ? <GroupPanel tr={tr} me={me} convo={convo} friends={friends ?? []} open={panel} onClose={() => setPanel(false)} onChange={onConvoChange} onLeft={(id) => { setPanel(false); onLeft(id); }} /> : null}
      <div className="relative flex min-h-0 flex-1 flex-col" {...dropProps}>
        {dragging ? (
          <div className="chat-drop pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-app border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
            <span className="flex items-center gap-2"><Paperclip size={18} /> {tr("Drop photos or files to send")}</span>
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
                const photos = (m.attachments ?? []).filter((a) => a.kind === "image");
                const voice = (m.attachments ?? []).find((a) => a.kind === "audio") ?? null;
                const files = (m.attachments ?? []).filter((a) => a.kind === "file");
                const prev = messages[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                if (m.kind === "system") {
                  return (
                    <div key={m.id} id={`msg-${m.id}`}>
                      {newDay ? <p className="chat-day my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{dayLabel(m.created_at, tr)}</p> : null}
                      <p className="chat-system my-1.5 text-center text-[11px] text-fg-muted" title={formatDateTime(m.created_at)}>{systemText(m, tr)}</p>
                    </div>
                  );
                }
                const grouped = prev && prev.kind !== "system" && prev.sender_id === m.sender_id && !newDay && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60_000;
                const next = messages[i + 1];
                const runLast = !next || next.kind === "system" || next.sender_id !== m.sender_id || new Date(next.created_at) - new Date(m.created_at) >= 5 * 60_000 || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const showSender = group && !mine && !grouped;
                const reactions = m.reactions ?? [];
                const myEmojis = reactions.filter((r) => r.user_ids.includes(me?.id)).map((r) => r.emoji);
                const deleted = Boolean(m.deleted_at);
                const canEdit = mine && !deleted && (m.body || photos.length > 0 || files.length > 0) && !voice;
                const canDelete = !deleted && (mine || (group && convo.my_role === "owner"));
                const menuBtn =
                  canEdit || canDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPicker(null);
                        setMenu(menu === m.id ? null : m.id);
                      }}
                      className={cn("chat-more-btn grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-fg-faint transition hover:bg-surface-2 hover:text-fg focus-ring", menu === m.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                      aria-label={tr("Message options")}
                      data-tip={tr("More")}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  ) : null;
                const reactBtn = deleted ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setPicker(picker === m.id ? null : m.id);
                    }}
                    className={cn("chat-react-btn grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-fg-faint transition hover:bg-surface-2 hover:text-fg focus-ring", picker === m.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                    aria-label={tr("Add reaction")}
                    data-tip={tr("React")}
                  >
                    <SmilePlus size={15} />
                  </button>
                );
                const rc = mine && !deleted ? readersOf(m, convo, me) : null;
                const tickState = !rc ? null : rc.others.length && rc.read.length === rc.others.length ? "all" : rc.read.length ? "some" : "sent";
                const tickLabel = !rc ? "" : tickState === "sent" ? tr("Sent") : !group ? tr("Read") : tickState === "all" ? tr("Read by everyone") : tr("Read by {names}", { names: rc.read.map((u) => u.name).join(", ") });
                const time = (
                  <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap align-bottom text-[10px] tabular-nums", mine ? "text-white/70" : "text-fg-faint", photos.length || voice || files.length ? "ml-auto" : "ml-2")}>
                    {m.edited_at && !m.deleted_at ? <span className="chat-edited not-italic">{tr("edited")}</span> : null}
                    {timeOf(m.created_at)}
                    {rc ? <Ticks tr={tr} mine state={tickState} label={tickLabel} onClick={group ? () => setReceipts(receipts === m.id ? null : m.id) : undefined} /> : null}
                  </span>
                );
                // photo bubbles take their width from the picture (longest edge 360 px), so a caption wraps under it
                const single = photos.length === 1 ? photos[0] : null;
                const imgW = single?.width && single?.height ? Math.round(Math.min(single.width, 360, (360 * single.width) / single.height)) : null;
                const bubbleW = voice ? 272 : files.length && !photos.length ? 320 : photos.length > 1 ? 372 : imgW ? (m.body ? Math.max(imgW, 240) : imgW) + 12 : undefined;
                return (
                  <div key={m.id} id={`msg-${m.id}`} className="chat-msg rounded-app">
                    {newDay ? <p className="chat-day my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{dayLabel(m.created_at, tr)}</p> : null}
                    {unreadFrom === m.id ? (
                      <p id={`unread-${convo.id}`} className="chat-unread my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        <span className="h-px flex-1 bg-accent/40" />
                        {tr("Unread messages")}
                        <span className="h-px flex-1 bg-accent/40" />
                      </p>
                    ) : null}
                    <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
                      {group && !mine ? <span className="w-6 shrink-0">{grouped ? null : <Avatar name={m.sender_name ?? "?"} color={m.sender_color ?? "#94a3b8"} avatar={m.sender_avatar ?? "initials"} size="xs" />}</span> : null}
                      {mine ? (
                        <>
                          {menuBtn}
                          {reactBtn}
                        </>
                      ) : null}
                      <div className={cn("relative flex min-w-0 flex-col", mine ? "items-end" : "items-start", reactions.length && "mb-3")} style={{ maxWidth: editing?.id === m.id ? "78%" : "78%", width: editing?.id === m.id ? "78%" : undefined }}>
                      {showSender ? <span className="chat-sender mb-0.5 ml-1 text-[11px] font-semibold" style={{ color: m.sender_color ?? undefined }}>{m.sender_name}</span> : null}
                      {picker === m.id ? <ReactionPicker tr={tr} mine={myEmojis} align={mine ? "right" : "left"} onPick={(e) => toggleReaction(m, e)} onClose={() => setPicker(null)} /> : null}
                      {menu === m.id ? <MessageMenu tr={tr} canEdit={canEdit} canDelete={canDelete} align={mine ? "right" : "left"} onEdit={() => startEdit(m)} onDelete={() => { setMenu(null); setConfirmDelete(m); }} onClose={() => setMenu(null)} /> : null}
                      {receipts === m.id && rc ? <ReceiptsPopover tr={tr} read={rc.read} pending={rc.pending} align="right" onClose={() => setReceipts(null)} /> : null}
                      {deleted ? (
                        <div className={cn("chat-bubble chat-deleted flex items-center gap-1.5 rounded-app border border-dashed px-3 py-2 text-sm italic", mine ? "border-accent/50 text-fg-muted" : "border-line text-fg-muted")} title={formatDateTime(m.created_at)}>
                          <Ban size={13} className="shrink-0 opacity-70" /> {tr("Message deleted")}
                          {time}
                        </div>
                      ) : editing?.id === m.id ? (
                        <div className="chat-edit w-full rounded-app border border-accent bg-surface p-2 shadow-app-lg" onKeyDown={(e) => e.key === "Escape" && setEditing(null)}>
                          <textarea
                            ref={editRef}
                            autoFocus
                            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                            value={editing.text}
                            onChange={(e) => setEditing((ed) => ({ ...ed, text: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                saveEdit();
                              }
                            }}
                            rows={Math.min(8, Math.max(1, editing.text.split("\n").length))}
                            maxLength={4000}
                            className="control w-full resize-none py-2 text-sm"
                            aria-label={tr("Edit message")}
                          />
                          <div className="mt-1.5 flex items-center justify-end gap-1.5">
                            <span className="mr-auto text-[10px] text-fg-faint">{tr("Enter saves · Esc cancels")}</span>
                            <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</Button>
                            <Button size="xs" icon={Check} onClick={saveEdit} disabled={!editing.text.trim() && !photos.length}>{tr("Save")}</Button>
                          </div>
                        </div>
                      ) : (
                      <div
                        className={cn(
                          "chat-bubble max-w-full whitespace-pre-wrap break-words rounded-app text-sm leading-relaxed",
                          grouped ? "chat-run-cont" : "chat-run-first",
                          runLast && "chat-run-last",
                          photos.length ? "chat-has-photos p-1.5" : voice ? "chat-has-voice px-2 py-2" : files.length ? "chat-has-files p-1.5" : "px-3 py-2",
                          mine ? "chat-mine bg-accent text-white" : "chat-theirs bg-surface-2 text-fg"
                        )}
                        title={formatDateTime(m.created_at)}
                        style={bubbleW ? { width: bubbleW } : undefined}
                        onDoubleClick={photos.length ? undefined : () => toggleReaction(m, "❤️")}
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
                        {voice ? <VoicePlayer tr={tr} src={voice.url} duration={voice.duration} mine={mine} /> : null}
                        {files.length ? (
                          <div className={cn("chat-files flex flex-col gap-1", photos.length && "mt-1")}>
                            {files.map((f) => (
                              <FileCard key={f.id} tr={tr} file={f} mine={mine} />
                            ))}
                          </div>
                        ) : null}
                        {photos.length || voice || files.length ? (
                          <span className={cn("flex items-end gap-2 px-1.5", voice ? "pt-0.5" : "pt-1")}>
                            {m.body ? <span className="min-w-0">{renderBody(m.body)}</span> : null}
                            {time}
                          </span>
                        ) : (
                          <>
                            {renderBody(m.body)}
                            {time}
                          </>
                        )}
                      </div>
                      )}
                      {reactions.length ? (
                        <div className={cn("chat-reactions absolute -bottom-3 flex flex-wrap gap-1", mine ? "right-1" : "left-1")}>
                          {reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => toggleReaction(m, r.emoji)}
                              className={cn("chat-reaction flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-5 shadow-sm transition focus-ring", r.user_ids.includes(me?.id) ? "is-mine border-accent bg-accent/15 text-fg" : "border-line bg-surface text-fg-muted hover:bg-surface-2")}
                              title={tr("Reacted by {names}", { names: r.names.map((n, i) => (r.user_ids[i] === me?.id ? tr("You") : n)).join(", ") })}
                              aria-label={`${r.emoji} ${r.count}`}
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 ? <span className="tabular-nums">{r.count}</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      </div>
                      {!mine ? (
                        <>
                          {reactBtn}
                          {menuBtn}
                        </>
                      ) : null}
                    </div>
                    {mine && lastMine?.id === m.id && seen ? <p className="mt-0.5 text-right text-[10px] text-fg-faint">{seenLabel}</p> : null}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
          {detached ? (
            <button type="button" onClick={onJumpLatest} className="chat-newer sticky bottom-2 mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-app-lg hover:bg-surface-2 focus-ring">
              <ArrowDown size={13} /> {tr("Jump to latest messages")}
            </button>
          ) : null}
        </div>
        <div className="chat-typing flex min-h-6 items-center gap-1.5 px-4 text-[11px] text-fg-muted" aria-live="polite">
          {typers.length ? (
            <>
              <span className="flex -space-x-1.5">
                {typers.slice(0, 3).map((t) => (
                  <Avatar key={t.name} name={t.name} color={t.avatar_color} avatar={t.avatar} size="xs" ring />
                ))}
              </span>
              <span>{typingText(typers, tr)}</span>
              <Dots />
            </>
          ) : null}
        </div>
        <div className="chat-composer border-t border-line p-2.5 md:p-3">
          {canChat ? (
            <div className="mx-auto max-w-3xl">
              {pending.length ? (
                <div className="chat-pending mb-2 flex flex-wrap items-center gap-2">
                  {pending.map((p) => {
                    return (
                      <span key={p.key} className="relative">
                        {p.kind === "image" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.url} alt="" className="h-16 w-16 rounded-app-sm border border-line object-cover" />
                        ) : (
                          <span className="chat-pending-file flex h-16 max-w-48 items-center gap-2 rounded-app-sm border border-line bg-surface-2 px-2.5" title={p.file.name}>
                            <FileGlyph name={p.file.name} mime={p.file.type} size={20} className="shrink-0 text-accent" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">{p.file.name}</span>
                              <span className="block text-[10px] text-fg-muted">{formatBytes(p.file.size)}</span>
                            </span>
                          </span>
                        )}
                        <button type="button" aria-label={tr("Remove attachment")} onClick={() => removePending(p.key)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fg text-bg shadow focus-ring">
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                  <span className="text-[11px] text-fg-muted">
                    {pending.every((p) => p.kind === "image") ? (pending.length > 1 ? tr("{n} photos", { n: pending.length }) : tr("Photo")) : pending.length > 1 ? tr("{n} attachments", { n: pending.length }) : tr("1 attachment")}
                  </span>
                </div>
              ) : null}
              {rec ? (
                <div className="chat-recording flex items-center gap-3 rounded-app border border-line bg-surface-2 px-3 py-2" role="status" aria-live="polite">
                  <span className="chat-rec-dot h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{clock(rec.elapsed)}</span>
                  <span className="chat-rec-bars flex h-8 min-w-0 flex-1 items-center gap-px overflow-hidden" aria-hidden="true">
                    {rec.levels.map((l, i) => (
                      <i key={i} className="w-1 shrink-0 rounded-full bg-accent" style={{ height: `${Math.max(12, l * 100)}%`, opacity: 0.45 + l * 0.55 }} />
                    ))}
                  </span>
                  <span className="hidden text-[11px] text-fg-muted sm:inline">{tr("Recording… up to 5 minutes")}</span>
                  <Button variant="ghost" size="iconSm" icon={X} onClick={() => stopRecording({ send: false })} aria-label={tr("Discard recording")} data-tip={tr("Discard")} />
                  <Button size="iconSm" icon={Check} onClick={() => stopRecording({ send: true })} aria-label={tr("Send voice message")} data-tip={tr("Send")} />
                </div>
              ) : null}
              <div className={cn("chat-composer-bar flex items-end gap-1 rounded-[1.4rem] border border-line bg-surface px-1.5 py-1 shadow-sm transition", rec && "hidden")}>
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
                <input
                  ref={anyRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button variant="ghost" size={narrow ? "iconSm" : "icon"} icon={ImageIcon} onClick={() => fileRef.current?.click()} aria-label={tr("Add photos")} data-tip={tr("Add photos")} disabled={sending} />
                <Button variant="ghost" size={narrow ? "iconSm" : "icon"} icon={Paperclip} onClick={() => anyRef.current?.click()} aria-label={tr("Attach files")} data-tip={tr("Attach files")} disabled={sending} className="chat-clip" />
                {canRecord() && !draft.trim() && !pending.length ? <Button variant="ghost" size={narrow ? "iconSm" : "icon"} icon={Mic} onClick={startRecording} aria-label={tr("Record a voice message")} data-tip={tr("Voice message")} disabled={sending} className="chat-mic" /> : null}
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    } else if (e.key === "ArrowUp" && !draft && !pending.length) {
                      const last = [...(messages ?? [])].reverse().find((m) => m.sender_id === me?.id && m.kind !== "system" && !m.deleted_at && m.body);
                      if (last) {
                        e.preventDefault();
                        startEdit(last);
                      }
                    }
                  }}
                  onPaste={(e) => {
                    if (e.clipboardData?.files?.length) {
                      e.preventDefault();
                      addFiles(e.clipboardData.files);
                    }
                  }}
                  rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                  placeholder={pending.length ? tr("Add a caption (optional)") : narrow ? tr("Message…") : tr("Write a message… (Enter to send, Shift+Enter for a new line)")}
                  className="chat-input min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg outline-none placeholder:text-fg-faint"
                  maxLength={4000}
                />
                {narrow ? (
                  <Button size="icon" icon={Send} onClick={send} loading={sending} disabled={!draft.trim() && !pending.length} aria-label={tr("Send")} />
                ) : (
                  <Button icon={Send} onClick={send} loading={sending} disabled={!draft.trim() && !pending.length} aria-label={tr("Send")}>{tr("Send")}</Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-fg-muted">{tr("You are no longer friends, so new messages are off. Send a new friend request to reconnect.")}</p>
          )}
        </div>
      </div>
      {lightbox ? <Lightbox tr={tr} photos={lightbox.photos} index={lightbox.index} onIndex={(index) => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} /> : null}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deleteMessage}
        loading={deleting}
        title={tr("Delete this message?")}
        confirmText={tr("Delete")}
        description={confirmDelete?.sender_id === me?.id ? tr("It is removed for everyone and replaced by a “message deleted” note.") : tr("As the group owner you are removing someone else’s message. It is replaced by a “message deleted” note for everyone.")}
      />
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
      <Avatar name={u.name} color={u.avatar_color} avatar={u.avatar} size="sm" />
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
