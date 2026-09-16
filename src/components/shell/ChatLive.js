"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { useUI } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useCalls, CallOverlay } from "@/components/modules/ChatCalls";

/**
 * One live stream (Server-Sent Events from /api/chat/stream) for the whole app, so calls ring and unread badges
 * move on every page, not only in Chat. The chat page subscribes to the same stream instead of opening its own.
 */
const EVENT_TYPES = ["message", "message_updated", "read", "delivered", "presence", "friends", "conversation", "typing", "reaction", "purged", "call"];
const LiveContext = createContext(null);

export function ChatLiveProvider({ locked = false, children }) {
  const tr = useT();
  const toast = useToast();
  const { user } = useAuth();
  const pathname = usePathname();
  const setCounts = useUI((s) => s.setCounts);
  const listeners = useRef(new Map()); // event type -> Set of handlers
  const [connected, setConnected] = useState(false);
  const calls = useCalls({ me: user, tr, toast });
  const callsRef = useRef(calls);
  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const on = useCallback((type, fn) => {
    let set = listeners.current.get(type);
    if (!set) {
      set = new Set();
      listeners.current.set(type, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }, []);

  useEffect(() => {
    if (!user?.id || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/chat/stream");
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        if (type === "call") callsRef.current.handleEvent(data);
        else if (type === "message" && data.message?.sender_id !== user.id && !pathRef.current.startsWith("/chat")) {
          // a message arrived while another page is open: bump the sidebar badge until the stats refresh
          const counts = useUI.getState().counts ?? {};
          setCounts({ ...counts, chat: (counts.chat || 0) + 1 });
        }
        for (const fn of listeners.current.get(type) ?? []) {
          try {
            fn(data);
          } catch {}
        }
      });
    }
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // the browser retries on its own
    return () => es.close();
  }, [user?.id, setCounts]);

  return (
    <LiveContext.Provider value={{ on, connected, calls }}>
      {children}
      {locked ? null : <CallOverlay tr={tr} me={user} call={calls.call} localStream={calls.localStream} remoteStream={calls.remoteStream} elapsed={calls.elapsed} onAccept={calls.accept} onDecline={calls.decline} onHangUp={calls.hangUp} onToggleMute={calls.toggleMute} onToggleCamera={calls.toggleCamera} onSwitchCamera={calls.switchCamera} />}
    </LiveContext.Provider>
  );
}

/** { on(type, fn) → unsubscribe, connected, calls } — falls back to a no-op stream when rendered outside the shell. */
export function useChatLive() {
  const ctx = useContext(LiveContext);
  return ctx ?? { on: () => () => {}, connected: false, calls: null };
}
