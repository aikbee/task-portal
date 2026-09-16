"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, PhoneIncoming, SwitchCamera, Minimize2, Maximize2, GripHorizontal } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * One-to-one voice and video calls over WebRTC. The server rings the other person and relays offer / answer / ICE
 * signals over the chat's live stream (see /api/chat/calls); media flows browser to browser (STUN, plus a TURN
 * server when an administrator configured one).
 */
const RING_MS = 45000;
export const clockOf = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
export const parseCall = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
/** Text for a "call" line: `mine` = I placed the call. */
export function callText(c, mine, tr) {
  if (!c) return "";
  const k = c.kind === "video" ? tr("Video call") : tr("Voice call");
  if (c.status === "ended") return `${k} · ${clockOf(c.duration || 0)}`;
  if (c.status === "missed") return mine ? tr("{k} · no answer", { k }) : tr("Missed {k}", { k });
  if (c.status === "declined") return mine ? tr("{k} · declined", { k }) : tr("{k} · you declined", { k });
  return tr("{k} · could not connect", { k });
}

/** A gentle two-tone ring (incoming) or ring-back (outgoing) made with WebAudio; silent when the browser refuses. */
function makeTone(pattern, freqs) {
  let ctx = null;
  let timer = null;
  let oscs = [];
  const start = () => {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    oscs = freqs.map((f) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    let on = false;
    const step = () => {
      on = !on;
      try {
        gain.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.01);
      } catch {}
      timer = setTimeout(step, on ? pattern[0] : pattern[1]);
    };
    ctx.resume?.().catch(() => {});
    step();
  };
  const stop = () => {
    clearTimeout(timer);
    for (const o of oscs) {
      try {
        o.stop();
      } catch {}
    }
    oscs = [];
    ctx?.close?.().catch(() => {});
    ctx = null;
  };
  return { start, stop };
}

export function useCalls({ me, tr, toast }) {
  const [call, setCall] = useState(null); // { id, kind, role, peer, conversation_id, status: ringing|connecting|active|ended, since, muted, cameraOff, endedAs, duration }
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const s = useRef({ pc: null, local: null, queue: [], remoteDesc: false, ringTimer: null, endTimer: null, dropTimer: null, tone: null }).current;
  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const stopTone = useCallback(() => {
    s.tone?.stop();
    s.tone = null;
  }, [s]);
  const teardown = useCallback(() => {
    clearTimeout(s.ringTimer);
    clearTimeout(s.dropTimer);
    s.ringTimer = null;
    stopTone();
    try {
      s.pc?.close();
    } catch {}
    s.pc = null;
    s.queue = [];
    s.remoteDesc = false;
    s.local?.getTracks().forEach((t) => t.stop());
    s.local = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, [s, stopTone]);
  /** Show how the call ended for a moment, then clear the overlay. */
  const finish = useCallback(
    (endedAs, extra = {}) => {
      teardown();
      setCall((c) => (c ? { ...c, status: "ended", endedAs, ...extra } : c));
      clearTimeout(s.endTimer);
      s.endTimer = setTimeout(() => setCall(null), 2500);
    },
    [s, teardown]
  );
  const post = useCallback((path, body) => api.post(path, body ?? {}), []);
  const countCameras = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const n = list.filter((d) => d.kind === "videoinput").length;
      setCall((c) => (c ? { ...c, cameras: n } : c));
    } catch {}
  }, []);
  const getMedia = useCallback(
    async (kind) => {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false });
      } catch (e) {
        const msg = e?.name === "NotAllowedError" ? tr("Allow the microphone (and camera) in your browser and try again.") : e?.name === "NotFoundError" ? tr("No microphone or camera was found.") : e?.message || String(e);
        throw new Error(msg);
      }
    },
    [tr]
  );
  const flushQueue = useCallback(async () => {
    if (!s.pc || !s.remoteDesc) return;
    const q = s.queue;
    s.queue = [];
    for (const c of q) {
      try {
        await s.pc.addIceCandidate(c);
      } catch {}
    }
  }, [s]);
  const makePc = useCallback(
    async (id, local) => {
      const { iceServers } = await api.get("/api/chat/calls/ice").catch(() => ({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }));
      const pc = new RTCPeerConnection({ iceServers });
      s.pc = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate) post(`/api/chat/calls/${id}/signal`, { signal: { type: "candidate", candidate: e.candidate.toJSON() } }).catch(() => {});
      };
      pc.ontrack = (e) => {
        const stream = e.streams?.[0] ?? new MediaStream([e.track]);
        setRemoteStream(stream);
      };
      pc.onconnectionstatechange = () => {
        if (s.pc !== pc) return;
        if (pc.connectionState === "connected") {
          clearTimeout(s.dropTimer);
          setCall((c) => (c && c.status !== "active" && c.status !== "ended" ? { ...c, status: "active", since: Date.now() } : c));
        } else if (pc.connectionState === "failed") {
          post(`/api/chat/calls/${id}/end`, { reason: "failed" }).catch(() => {});
          finish("failed");
        } else if (pc.connectionState === "disconnected") {
          clearTimeout(s.dropTimer);
          s.dropTimer = setTimeout(() => {
            if (s.pc === pc && pc.connectionState === "disconnected") {
              post(`/api/chat/calls/${id}/end`, { reason: "failed" }).catch(() => {});
              finish("failed");
            }
          }, 8000);
        }
      };
      for (const t of local?.getTracks() ?? []) pc.addTrack(t, local);
      return pc;
    },
    [s, post, finish]
  );

  const start = useCallback(
    async (convo, kind) => {
      if (callRef.current) return toastRef.current.error(tr("You are already in a call"));
      let local;
      try {
        local = await getMedia(kind);
      } catch (e) {
        return toastRef.current.error(tr("Could not start the call"), e.message);
      }
      try {
        const c = await post("/api/chat/calls", { conversation_id: convo.id, kind });
        s.local = local;
        setLocalStream(local);
        setCall({ id: c.id, kind, role: "caller", peer: c.peer, conversation_id: convo.id, status: "ringing", muted: false, cameraOff: false, facing: "user" });
        if (kind === "video") countCameras();
        s.tone = makeTone([1000, 3000], [440]);
        s.tone.start();
        s.ringTimer = setTimeout(() => {
          post(`/api/chat/calls/${c.id}/end`, { reason: "timeout" }).catch(() => {});
          finish("missed");
        }, RING_MS);
      } catch (e) {
        local.getTracks().forEach((t) => t.stop());
        toastRef.current.error(tr("Could not start the call"), e.message);
      }
    },
    [s, tr, getMedia, post, finish, countCameras]
  );
  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.role !== "callee" || c.status !== "ringing") return;
    stopTone();
    clearTimeout(s.ringTimer);
    let local;
    try {
      local = await getMedia(c.kind);
    } catch (e) {
      toastRef.current.error(tr("Could not answer"), e.message);
      post(`/api/chat/calls/${c.id}/decline`).catch(() => {});
      finish("declined");
      return;
    }
    s.local = local;
    setLocalStream(local);
    if (c.kind === "video") countCameras();
    try {
      await post(`/api/chat/calls/${c.id}/accept`);
      setCall((x) => (x ? { ...x, status: "connecting" } : x));
      if (!s.pc) await makePc(c.id, local);
      await flushQueue();
    } catch (e) {
      toastRef.current.error(tr("Could not answer"), e.message);
      post(`/api/chat/calls/${c.id}/end`, { reason: "failed" }).catch(() => {});
      finish("failed");
    }
  }, [s, tr, getMedia, post, finish, makePc, flushQueue, stopTone, countCameras]);
  /** Front ⇄ back camera: a new video track replaces the one being sent, without renegotiating. */
  const switchCamera = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.kind !== "video" || !s.local) return;
    const facing = c.facing === "environment" ? "user" : "environment";
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing } });
      } catch (e) {
        return toastRef.current.error(tr("Could not switch the camera"), e?.message);
      }
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !c.cameraOff;
    const sender = s.pc?.getSenders().find((x) => x.track?.kind === "video");
    try {
      if (sender) await sender.replaceTrack(track);
    } catch (e) {
      track.stop();
      return toastRef.current.error(tr("Could not switch the camera"), e?.message);
    }
    for (const t of s.local.getVideoTracks()) {
      t.stop();
      s.local.removeTrack(t);
    }
    s.local.addTrack(track);
    setLocalStream(new MediaStream(s.local.getTracks()));
    setCall((x) => (x ? { ...x, facing } : x));
  }, [s, tr]);
  const decline = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    post(`/api/chat/calls/${c.id}/decline`).catch(() => {});
    finish("declined");
  }, [post, finish]);
  const hangUp = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.status === "ended") return;
    post(`/api/chat/calls/${c.id}/end`, {}).catch(() => {});
    finish(c.status === "ringing" && c.role === "caller" ? "missed" : "ended", { duration: c.since ? Math.round((Date.now() - c.since) / 1000) : 0 });
  }, [post, finish]);
  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    const next = !c.muted;
    s.local?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setCall((x) => (x ? { ...x, muted: next } : x));
  }, [s]);
  const toggleCamera = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    const next = !c.cameraOff;
    s.local?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCall((x) => (x ? { ...x, cameraOff: next } : x));
  }, [s]);

  /** Live-stream events of type "call". */
  const handleEvent = useCallback(
    async (ev) => {
      const cur = callRef.current;
      if (ev.action === "ring") {
        if (cur) return; // already busy; the server refuses a second call anyway
        setCall({ id: ev.call.id, kind: ev.call.kind, role: "callee", peer: ev.from, conversation_id: ev.call.conversation_id, status: "ringing", muted: false, cameraOff: false });
        s.tone = makeTone([1000, 2000], [440, 480]);
        s.tone.start();
        s.ringTimer = setTimeout(() => finish("missed"), RING_MS + 5000);
        return;
      }
      if (!cur || ev.call_id !== cur.id) return;
      if (ev.action === "accepted") {
        if (cur.role === "caller") {
          stopTone();
          clearTimeout(s.ringTimer);
          setCall((x) => (x ? { ...x, status: "connecting" } : x));
          try {
            const pc = await makePc(cur.id, s.local);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await post(`/api/chat/calls/${cur.id}/signal`, { signal: { type: "offer", sdp: offer.sdp } });
          } catch (e) {
            toastRef.current.error(tr("Could not connect the call"), e.message);
            post(`/api/chat/calls/${cur.id}/end`, { reason: "failed" }).catch(() => {});
            finish("failed");
          }
        } else if (ev.by === me?.id && !s.local) {
          // answered in another tab of ours: this tab stops ringing
          stopTone();
          clearTimeout(s.ringTimer);
          setCall(null);
        }
        return;
      }
      if (ev.action === "signal") {
        const sig = ev.signal || {};
        try {
          if (sig.type === "offer") {
            if (!s.local) return; // another tab of ours is taking the call
            if (!s.pc) await makePc(cur.id, s.local);
            await s.pc.setRemoteDescription({ type: "offer", sdp: sig.sdp });
            s.remoteDesc = true;
            await flushQueue();
            const answer = await s.pc.createAnswer();
            await s.pc.setLocalDescription(answer);
            await post(`/api/chat/calls/${cur.id}/signal`, { signal: { type: "answer", sdp: answer.sdp } });
          } else if (sig.type === "answer") {
            if (s.pc && !s.remoteDesc) {
              await s.pc.setRemoteDescription({ type: "answer", sdp: sig.sdp });
              s.remoteDesc = true;
              await flushQueue();
            }
          } else if (sig.type === "candidate" && sig.candidate) {
            if (s.pc && s.remoteDesc) {
              try {
                await s.pc.addIceCandidate(sig.candidate);
              } catch {}
            } else s.queue.push(sig.candidate);
          }
        } catch (e) {
          console.error("[call] signal", e);
        }
        return;
      }
      if (ev.action === "ended") {
        if (cur.status === "ended") return;
        finish(ev.status || "ended", { duration: ev.duration ?? (cur.since ? Math.round((Date.now() - cur.since) / 1000) : 0) });
      }
    },
    [s, me?.id, tr, post, finish, makePc, flushQueue, stopTone]
  );

  // call timer
  useEffect(() => {
    if (call?.status !== "active" || !call.since) return;
    const since = call.since;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(t);
  }, [call?.status, call?.since]);
  // leaving the page ends the call for the other side too
  useEffect(() => {
    const onUnload = () => {
      const c = callRef.current;
      if (c && c.status !== "ended") navigator.sendBeacon?.(`/api/chat/calls/${c.id}/end`, new Blob([JSON.stringify({ reason: "left" })], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  useEffect(() => () => teardown(), [teardown]);

  return { call, localStream, remoteStream, elapsed, start, accept, decline, hangUp, toggleMute, toggleCamera, switchCamera, handleEvent };
}

/** The call UI: an incoming-call card, or the in-call panel (full screen on phones, a corner panel on desktop). */
export function CallOverlay({ tr, me, call, localStream, remoteStream, elapsed, onAccept, onDecline, onHangUp, onToggleMute, onToggleCamera, onSwitchCamera }) {
  const remoteRef = useRef(null);
  const localRef = useRef(null);
  const [miniFor, setMiniFor] = useState(null); // the call id that was minimised (a new call always starts expanded)
  const [pos, setPos] = useState(null); // { x, y } once the panel or pill has been dragged
  const drag = useRef(null);
  const mini = Boolean(call) && miniFor === call.id;
  const setMini = (on) => setMiniFor(on ? call?.id ?? null : null);
  const startDrag = (e) => {
    if (e.button != null && e.button !== 0) return;
    const el = e.currentTarget.closest(".chat-call, .chat-call-mini");
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const x = Math.min(Math.max(4, ev.clientX - d.dx), window.innerWidth - d.w - 4);
      const y = Math.min(Math.max(4, ev.clientY - d.dy), window.innerHeight - d.h - 4);
      setPos({ x, y });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    e.preventDefault();
  };
  const placed = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  useEffect(() => {
    const el = remoteRef.current;
    if (el && remoteStream && el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      el.play?.().catch(() => {});
    }
  }, [remoteStream, call?.status, mini]);
  useEffect(() => {
    const el = localRef.current;
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
      el.play?.().catch(() => {});
    }
  }, [localStream, call?.status, mini]);
  if (!call || typeof document === "undefined") return null;
  const video = call.kind === "video";
  const peer = call.peer ?? {};
  const remoteHasVideo = video && remoteStream?.getVideoTracks?.().some((t) => t.readyState === "live");
  const status =
    call.status === "ringing"
      ? call.role === "caller"
        ? tr("Ringing…")
        : video
          ? tr("Incoming video call")
          : tr("Incoming voice call")
      : call.status === "connecting"
        ? tr("Connecting…")
        : call.status === "active"
          ? clockOf(elapsed)
          : call.endedAs === "missed"
            ? call.role === "caller"
              ? tr("No answer")
              : tr("Missed call")
            : call.endedAs === "declined"
              ? tr("Declined")
              : call.endedAs === "failed"
                ? tr("Could not connect")
                : tr("Call ended · {t}", { t: clockOf(call.duration ?? elapsed) });

  if (call.role === "callee" && call.status === "ringing") {
    return createPortal(
      <div className="chat-call-ring fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-label={status}>
        <div className="w-full max-w-sm rounded-app bg-surface p-6 text-center shadow-app-lg anim-pop">
          <div className="mx-auto mb-3 flex justify-center"><Avatar name={peer.name} color={peer.avatar_color} avatar={peer.avatar ?? "initials"} size="xl" /></div>
          <p className="text-lg font-semibold">{peer.name}</p>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-fg-muted"><PhoneIncoming size={14} className="animate-pulse text-emerald-500" /> {status}</p>
          <div className="mt-6 flex justify-center gap-4">
            <button type="button" onClick={onDecline} className="chat-call-btn grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 focus-ring" aria-label={tr("Decline")}>
              <PhoneOff size={22} />
            </button>
            <button type="button" onClick={onAccept} className="chat-call-btn grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 focus-ring chat-call-accept" aria-label={tr("Accept")}>
              {video ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
          <p className="mt-4 text-[11px] text-fg-faint">{tr("Accepting asks your browser for the microphone{cam}.", { cam: video ? tr(" and camera") : "" })}</p>
        </div>
      </div>,
      document.body
    );
  }
  if (mini) {
    // a small draggable pill: the call goes on (audio keeps playing through the hidden video element) while the app is used
    return createPortal(
      <div className="chat-call-mini fixed z-[80] flex select-none items-center gap-2 rounded-full bg-neutral-950/95 py-1.5 pl-1.5 pr-2 text-white shadow-app-lg ring-1 ring-white/15 backdrop-blur" style={placed ?? { top: 12, right: 12 }} role="dialog" aria-label={status}>
        <video ref={remoteRef} autoPlay playsInline className="absolute h-px w-px opacity-0" />
        <button type="button" onPointerDown={startDrag} className="chat-call-drag grid h-8 w-6 cursor-grab place-items-center text-white/50 touch-none" aria-label={tr("Move")}>
          <GripHorizontal size={14} />
        </button>
        <button type="button" onClick={() => setMini(false)} className="flex min-w-0 items-center gap-2 rounded-full focus-ring" aria-label={tr("Expand")}>
          <Avatar name={peer.name} color={peer.avatar_color} avatar={peer.avatar ?? "initials"} size="xs" />
          <span className="min-w-0 text-left leading-tight">
            <span className="block max-w-32 truncate text-xs font-semibold">{peer.name}</span>
            <span className="chat-call-status block text-[11px] text-white/70">{status}</span>
          </span>
          <Maximize2 size={14} className="shrink-0 text-white/60" />
        </button>
        <button type="button" onClick={onToggleMute} disabled={call.status === "ended"} className={cn("grid h-8 w-8 place-items-center rounded-full focus-ring", call.muted ? "bg-white text-neutral-900" : "bg-white/15 hover:bg-white/25")} aria-label={call.muted ? tr("Unmute") : tr("Mute")} aria-pressed={call.muted}>
          {call.muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button type="button" onClick={onHangUp} disabled={call.status === "ended"} className="chat-call-hangup grid h-8 w-8 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-600 focus-ring disabled:opacity-50" aria-label={tr("Hang up")}>
          <PhoneOff size={14} />
        </button>
      </div>,
      document.body
    );
  }
  return createPortal(
    <div className={cn("chat-call fixed z-[80] flex flex-col overflow-hidden bg-neutral-950 text-white shadow-app-lg", "inset-0 md:inset-auto md:bottom-4 md:right-4 md:h-[32rem] md:w-[24rem] md:rounded-app md:border md:border-white/10")} style={placed && window.matchMedia("(min-width: 768px)").matches ? placed : undefined} role="dialog" aria-label={status}>
      <video ref={remoteRef} autoPlay playsInline className={cn("chat-call-remote absolute inset-0 h-full w-full object-cover", !remoteHasVideo && "opacity-0")} />
      {!remoteHasVideo ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Avatar name={peer.name} color={peer.avatar_color} avatar={peer.avatar ?? "initials"} size="xl" className={cn(call.status === "ringing" && "animate-pulse")} />
          </div>
        </div>
      ) : null}
      <div className="relative flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="chat-call-drag min-w-0 flex-1 md:cursor-grab md:touch-none" onPointerDown={(e) => window.matchMedia("(min-width: 768px)").matches && startDrag(e)}>
          <p className="truncate text-base font-semibold drop-shadow">{peer.name}</p>
          <p className="chat-call-status text-sm text-white/80 drop-shadow">{status}</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <button type="button" onClick={() => setMini(true)} className="chat-call-minimize grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/90 hover:bg-black/60 focus-ring" aria-label={tr("Minimize")} title={tr("Minimize")}>
            <Minimize2 size={16} />
          </button>
          {video && localStream ? <video ref={localRef} autoPlay playsInline muted className={cn("chat-call-local h-28 w-20 rounded-app-sm border border-white/20 bg-black object-cover shadow", call.cameraOff && "opacity-30", call.facing !== "environment" && "-scale-x-100")} /> : null}
        </div>
      </div>
      {!video ? <video ref={localRef} autoPlay playsInline muted className="hidden" /> : null}
      <div className="relative mt-auto flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent p-5">
        <button type="button" onClick={onToggleMute} disabled={call.status === "ended"} className={cn("chat-call-btn grid h-12 w-12 place-items-center rounded-full transition focus-ring", call.muted ? "bg-white text-neutral-900" : "bg-white/15 text-white hover:bg-white/25")} aria-label={call.muted ? tr("Unmute") : tr("Mute")} aria-pressed={call.muted}>
          {call.muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        {video ? (
          <button type="button" onClick={onToggleCamera} disabled={call.status === "ended"} className={cn("chat-call-btn grid h-12 w-12 place-items-center rounded-full transition focus-ring", call.cameraOff ? "bg-white text-neutral-900" : "bg-white/15 text-white hover:bg-white/25")} aria-label={call.cameraOff ? tr("Turn camera on") : tr("Turn camera off")} aria-pressed={call.cameraOff}>
            {call.cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
        ) : null}
        {video && (call.cameras ?? 0) > 1 ? (
          <button type="button" onClick={onSwitchCamera} disabled={call.status === "ended" || call.cameraOff} className="chat-call-btn chat-call-switch grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-ring disabled:opacity-50" aria-label={tr("Switch camera")} title={tr("Switch camera")}>
            <SwitchCamera size={20} />
          </button>
        ) : null}
        <button type="button" onClick={onHangUp} disabled={call.status === "ended"} className="chat-call-btn chat-call-hangup grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 focus-ring disabled:opacity-50" aria-label={tr("Hang up")}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>,
    document.body
  );
}
