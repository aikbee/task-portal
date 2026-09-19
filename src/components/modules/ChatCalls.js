"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeCallBanners, showRingBanner } from "@/lib/push-client";
import { createPortal } from "react-dom";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, PhoneIncoming, SwitchCamera, Minimize2, Maximize2, GripHorizontal, Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Voice and video calls over WebRTC. Direct calls connect two browsers; group calls are a mesh where every
 * participant keeps a peer connection to every other one (the server caps it at 8 people). The server rings,
 * relays offer / answer / ICE signals over the chat's live stream, and knows who is in the call; media never
 * touches it. Newcomers send the offers: in a direct call the caller offers once the callee accepts, in a group
 * the person joining offers to everyone already there.
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
/** Text for a "call" line: `mine` = I started the call. */
export function callText(c, mine, tr) {
  if (!c) return "";
  const k = c.kind === "video" ? tr("Video call") : tr("Voice call");
  if (c.group) {
    if (c.status === "ended") return tr("{k} · {t} · {n} joined", { k, t: clockOf(c.duration || 0), n: c.joined ?? 0 });
    if (c.status === "missed") return tr("{k} · nobody joined", { k });
    return tr("{k} · could not connect", { k });
  }
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
const peerOf = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, avatar_color: p.avatar_color });

export function useCalls({ me, tr, toast }) {
  // call: { id, kind, group, title, peer, conversation_id, role: caller|callee|member, status: ringing|connecting|active|ended, since, muted, cameraOff, facing, cameras, endedAs, duration, peers: [{ id, name, avatar, avatar_color }] }
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // user id -> MediaStream
  const [elapsed, setElapsed] = useState(0);
  const s = useRef({ pcs: new Map(), queues: new Map(), ready: new Set(), dropTimers: new Map(), ice: null, local: null, ringTimer: null, endTimer: null, tone: null }).current;
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
  const closePeer = useCallback(
    (uid) => {
      const pc = s.pcs.get(uid);
      try {
        pc?.close();
      } catch {}
      s.pcs.delete(uid);
      s.queues.delete(uid);
      s.ready.delete(uid);
      clearTimeout(s.dropTimers.get(uid));
      s.dropTimers.delete(uid);
      setRemoteStreams((m) => {
        if (!(uid in m)) return m;
        const next = { ...m };
        delete next[uid];
        return next;
      });
    },
    [s]
  );
  const teardown = useCallback(() => {
    clearTimeout(s.ringTimer);
    s.ringTimer = null;
    stopTone();
    closeCallBanners(callRef.current?.id ?? null); // the banner on this device is out of date whatever happened
    for (const uid of [...s.pcs.keys()]) closePeer(uid);
    s.ice = null;
    s.local?.getTracks().forEach((t) => t.stop());
    s.local = null;
    setLocalStream(null);
    setRemoteStreams({});
  }, [s, stopTone, closePeer]);
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
  const getIce = useCallback(async () => {
    // asked again after a few minutes: a relay's credentials are made per account and expire, a page can stay open for days
    if (!s.ice || Date.now() - (s.iceAt ?? 0) > 5 * 60 * 1000) {
      s.ice = await api.get("/api/chat/calls/ice").then((r) => r.iceServers).catch(() => s.ice ?? [{ urls: "stun:stun.l.google.com:19302" }]);
      s.iceAt = Date.now();
    }
    return s.ice;
  }, [s]);
  const flushQueue = useCallback(
    async (uid) => {
      const pc = s.pcs.get(uid);
      if (!pc || !s.ready.has(uid)) return;
      const q = s.queues.get(uid) ?? [];
      s.queues.set(uid, []);
      for (const c of q) {
        try {
          await pc.addIceCandidate(c);
        } catch {}
      }
    },
    [s]
  );
  /** A peer connection to one other person: signals go to them by id. */
  const ensurePc = useCallback(
    async (callId, uid) => {
      const existing = s.pcs.get(uid);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: await getIce() });
      s.pcs.set(uid, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) post(`/api/chat/calls/${callId}/signal`, { to: uid, signal: { type: "candidate", candidate: e.candidate.toJSON() } }).catch(() => {});
      };
      pc.ontrack = (e) => {
        const stream = e.streams?.[0] ?? new MediaStream([e.track]);
        setRemoteStreams((m) => (m[uid] === stream ? m : { ...m, [uid]: stream }));
      };
      pc.onconnectionstatechange = () => {
        if (s.pcs.get(uid) !== pc) return;
        const lost = () => {
          const c = callRef.current;
          if (!c || c.status === "ended") return;
          if (c.group) closePeer(uid); // they may come back; the call goes on
          else {
            post(`/api/chat/calls/${callId}/end`, { reason: "failed" }).catch(() => {});
            finish("failed");
          }
        };
        if (pc.connectionState === "connected") {
          clearTimeout(s.dropTimers.get(uid));
          setCall((c) => (c && c.status !== "active" && c.status !== "ended" ? { ...c, status: "active", since: c.since ?? Date.now() } : c));
        } else if (pc.connectionState === "failed") lost();
        else if (pc.connectionState === "disconnected") {
          clearTimeout(s.dropTimers.get(uid));
          s.dropTimers.set(uid, setTimeout(() => s.pcs.get(uid) === pc && pc.connectionState === "disconnected" && lost(), 8000));
        }
      };
      for (const t of s.local?.getTracks() ?? []) pc.addTrack(t, s.local);
      return pc;
    },
    [s, getIce, post, closePeer, finish]
  );
  const offerTo = useCallback(
    async (callId, uid) => {
      const pc = await ensurePc(callId, uid);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await post(`/api/chat/calls/${callId}/signal`, { to: uid, signal: { type: "offer", sdp: offer.sdp } });
    },
    [ensurePc, post]
  );
  const handleSignal = useCallback(
    async (callId, from, sig) => {
      try {
        if (sig.type === "offer") {
          if (!s.local) return; // another tab of ours is taking the call
          const pc = await ensurePc(callId, from);
          await pc.setRemoteDescription({ type: "offer", sdp: sig.sdp });
          s.ready.add(from);
          await flushQueue(from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await post(`/api/chat/calls/${callId}/signal`, { to: from, signal: { type: "answer", sdp: answer.sdp } });
        } else if (sig.type === "answer") {
          const pc = s.pcs.get(from);
          if (pc && !s.ready.has(from)) {
            await pc.setRemoteDescription({ type: "answer", sdp: sig.sdp });
            s.ready.add(from);
            await flushQueue(from);
          }
        } else if (sig.type === "candidate" && sig.candidate) {
          const pc = s.pcs.get(from);
          if (pc && s.ready.has(from)) {
            try {
              await pc.addIceCandidate(sig.candidate);
            } catch {}
          } else s.queues.set(from, [...(s.queues.get(from) ?? []), sig.candidate]);
        }
      } catch (e) {
        console.error("[call] signal", e);
      }
    },
    [s, ensurePc, flushQueue, post]
  );

  /** Start a call: rings the other person of a direct chat, or opens a group call everyone can join. */
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
        const group = Boolean(c.group);
        setCall({ id: c.id, kind, group, title: group ? convo.name : null, role: "caller", peer: c.peer, conversation_id: convo.id, status: group ? "active" : "ringing", since: group ? Date.now() : undefined, muted: false, cameraOff: false, facing: "user", peers: [] });
        if (kind === "video") countCameras();
        if (!group) {
          s.tone = makeTone([1000, 3000], [440]);
          s.tone.start();
          s.ringTimer = setTimeout(() => {
            post(`/api/chat/calls/${c.id}/end`, { reason: "timeout" }).catch(() => {});
            finish("missed");
          }, RING_MS);
        }
      } catch (e) {
        local.getTracks().forEach((t) => t.stop());
        toastRef.current.error(tr("Could not start the call"), e.message);
      }
    },
    [s, tr, getMedia, post, finish, countCameras]
  );
  /** Join a group call: from the ringing card, or from the "call in progress" banner (`callId` + convo). */
  const join = useCallback(
    async (callId, convo) => {
      const cur = callRef.current;
      if (cur && cur.id !== callId) return toastRef.current.error(tr("You are already in a call"));
      stopTone();
      clearTimeout(s.ringTimer);
      let info = cur;
      if (!info) {
        try {
          const c = await api.get(`/api/chat/calls/${callId}`);
          info = { id: c.id, kind: c.kind, group: true, title: convo?.name ?? null, role: "member", conversation_id: c.conversation_id, peers: [] };
        } catch (e) {
          return toastRef.current.error(tr("Could not join the call"), e.message);
        }
      }
      let local;
      try {
        local = await getMedia(info.kind);
      } catch (e) {
        toastRef.current.error(tr("Could not join the call"), e.message);
        if (cur) finish("declined");
        return;
      }
      s.local = local;
      setLocalStream(local);
      setCall({ ...info, status: "connecting", muted: false, cameraOff: false, facing: "user", peers: info.peers ?? [] });
      if (info.kind === "video") countCameras();
      try {
        const res = await post(`/api/chat/calls/${callId}/join`);
        const others = (res.participants ?? []).filter((p) => p.id !== me?.id).map(peerOf);
        setCall((x) => (x ? { ...x, status: others.length ? "connecting" : "active", since: x.since ?? Date.now(), peers: others } : x));
        for (const p of others) await offerTo(callId, p.id);
      } catch (e) {
        toastRef.current.error(tr("Could not join the call"), e.message);
        finish("failed");
      }
    },
    [s, me?.id, tr, getMedia, post, finish, offerTo, countCameras, stopTone]
  );
  /** Pick up a direct call (a group ring joins instead). */
  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.role !== "callee" || c.status !== "ringing") return;
    if (c.group) { closeCallBanners(c.id); return join(c.id, null); }
    stopTone();
    clearTimeout(s.ringTimer);
    closeCallBanners(c.id);
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
    } catch (e) {
      toastRef.current.error(tr("Could not answer"), e.message);
      post(`/api/chat/calls/${c.id}/end`, { reason: "failed" }).catch(() => {});
      finish("failed");
    }
  }, [s, tr, getMedia, post, finish, countCameras, stopTone, join]);
  /** Front ⇄ back camera: a new video track replaces the one being sent to everyone, without renegotiating. */
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
    try {
      for (const pc of s.pcs.values()) {
        const sender = pc.getSenders().find((x) => x.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
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
    if (c.group) {
      teardown();
      setCall(null);
    } else finish("declined");
  }, [post, finish, teardown]);
  const hangUp = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.status === "ended") return;
    post(`/api/chat/calls/${c.id}/${c.group ? "leave" : "end"}`, {}).catch(() => {});
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
        const group = Boolean(ev.call?.group);
        setCall({ id: ev.call.id, kind: ev.call.kind, group, title: ev.conversation_title ?? null, role: "callee", peer: ev.from, conversation_id: ev.call.conversation_id, status: "ringing", muted: false, cameraOff: false, facing: "user", peers: (ev.call.participants ?? []).filter((p) => p.id !== me?.id).map(peerOf) });
        s.tone = makeTone([1000, 2000], [440, 480]);
        s.tone.start();
        // a hidden tab may not be allowed to sound: show the system banner as well (same tag as the push, so never two)
        if (typeof document !== "undefined" && document.visibilityState !== "visible") showRingBanner({ callId: ev.call.id, conversationId: ev.call.conversation_id, group, title: group ? `${ev.from?.name ?? ""} · ${ev.conversation_title ?? ""}` : `${ev.from?.name ?? ""}`, body: ev.call.kind === "video" ? "Video call" : "Voice call" });
        s.ringTimer = setTimeout(() => {
          if (group) {
            stopTone();
            closeCallBanners(ev.call.id);
            setCall((x) => (x && x.status === "ringing" ? null : x));
          } else finish("missed");
        }, (ev.ms_left ?? RING_MS) + 5000); // `ms_left`: the call was already ringing when this app opened
        return;
      }
      if (!cur || ev.call_id !== cur.id) return;
      if (ev.action === "accepted") {
        if (cur.role === "caller") {
          stopTone();
          clearTimeout(s.ringTimer);
          setCall((x) => (x ? { ...x, status: "connecting", peers: x.peer ? [peerOf(x.peer)] : x.peers } : x));
          try {
            await offerTo(cur.id, cur.peer.id);
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
      if (ev.action === "participant_joined") {
        if (ev.user?.id === me?.id) {
          if (!s.local) {
            // joined from another tab of ours
            stopTone();
            clearTimeout(s.ringTimer);
            setCall(null);
          }
          return;
        }
        if (cur.status === "ringing") return; // not in it yet
        setCall((x) => (x && !x.peers.some((p) => p.id === ev.user.id) ? { ...x, peers: [...x.peers, peerOf(ev.user)] } : x));
        return;
      }
      if (ev.action === "participant_left") {
        closePeer(ev.user_id);
        setCall((x) => (x ? { ...x, peers: x.peers.filter((p) => p.id !== ev.user_id) } : x));
        return;
      }
      if (ev.action === "signal") {
        await handleSignal(cur.id, ev.from, ev.signal || {});
        return;
      }
      if (ev.action === "ended") {
        if (cur.status === "ended") return;
        if (cur.status === "ringing" && cur.group) {
          stopTone();
          clearTimeout(s.ringTimer);
          setCall(null);
          return;
        }
        finish(ev.status || "ended", { duration: ev.duration ?? (cur.since ? Math.round((Date.now() - cur.since) / 1000) : 0) });
      }
    },
    [s, me?.id, tr, post, finish, offerTo, handleSignal, closePeer, stopTone]
  );

  /**
   * The ring is a live event, so an app that was closed or asleep when it was sent never saw it. Ask the server
   * whether somebody is ringing me: on start, when the app comes back to the foreground and when the live stream
   * reconnects. `?answer=1&call=<id>` (the banner's Answer button) picks up straight away.
   */
  const acceptRef = useRef(accept);
  useEffect(() => {
    acceptRef.current = accept;
  }, [accept]);
  const recover = useCallback(async () => {
    if (!me?.id || callRef.current) return;
    let res;
    try {
      res = await api.get("/api/chat/calls/incoming");
    } catch {
      return;
    }
    if (!res?.call) return closeCallBanners(); // nothing rings any more: old banners go
    if (callRef.current) return;
    await handleEvent({ action: "ring", call: res.call, from: res.from, conversation_title: res.conversation_title, ms_left: res.ms_left });
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("answer") === "1" && Number(sp.get("call")) === res.call.id) {
      sp.delete("answer");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}`);
      // the ringing state has to be on screen before it can be answered
      for (let i = 0; i < 20 && callRef.current?.id !== res.call.id; i++) await new Promise((r) => setTimeout(r, 50));
      if (callRef.current?.id === res.call.id && callRef.current.status === "ringing") acceptRef.current();
    }
  }, [me?.id, handleEvent]);
  useEffect(() => {
    const t = setTimeout(recover, 300);
    const onVisible = () => document.visibilityState === "visible" && recover();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [recover]);

  // call timer
  useEffect(() => {
    if (call?.status !== "active" || !call.since) return;
    const since = call.since;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(t);
  }, [call?.status, call?.since]);
  // leaving the page ends / leaves the call for the others too
  useEffect(() => {
    const onUnload = () => {
      const c = callRef.current;
      if (c && c.status !== "ended") navigator.sendBeacon?.(`/api/chat/calls/${c.id}/end`, new Blob([JSON.stringify({ reason: "left" })], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  useEffect(() => () => teardown(), [teardown]);

  return { call, localStream, remoteStreams, elapsed, start, join, accept, decline, hangUp, toggleMute, toggleCamera, switchCamera, handleEvent, recover };
}

/** One other person's video (or avatar while there is no video), used by the group grid and the direct layout. */
function PeerTile({ peer, stream, big }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks?.().some((t) => t.readyState === "live"));
  return (
    <div className={cn("chat-call-tile relative overflow-hidden bg-neutral-900", big ? "absolute inset-0" : "rounded-app-sm")}>
      <video ref={ref} autoPlay playsInline className={cn("chat-call-remote absolute inset-0 h-full w-full object-cover", !hasVideo && "opacity-0")} />
      {!hasVideo ? (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar name={peer?.name ?? "?"} color={peer?.avatar_color} avatar={peer?.avatar ?? "initials"} size={big ? "xl" : "lg"} />
        </div>
      ) : null}
      {!big ? <span className="absolute bottom-1 left-1.5 max-w-[90%] truncate rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">{peer?.name}</span> : null}
    </div>
  );
}

/** The call UI: an incoming-call card, or the in-call panel (full screen on phones, a corner panel on desktop) that can shrink to a draggable pill. */
export function CallOverlay({ tr, call, localStream, remoteStreams, elapsed, onAccept, onDecline, onHangUp, onToggleMute, onToggleCamera, onSwitchCamera }) {
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
    const el = localRef.current;
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
      el.play?.().catch(() => {});
    }
  }, [localStream, call?.status, mini]);
  if (!call || typeof document === "undefined") return null;
  const video = call.kind === "video";
  const peers = call.peers ?? [];
  const peer = call.peer ?? peers[0] ?? {};
  const headline = call.group ? call.title || tr("Group call") : peer.name;
  const inCall = peers.length;
  const status =
    call.status === "ringing"
      ? call.role === "caller"
        ? tr("Ringing…")
        : call.group
          ? tr("{name} started a {k}", { name: peer.name ?? "", k: video ? tr("video call") : tr("voice call") })
          : video
            ? tr("Incoming video call")
            : tr("Incoming voice call")
      : call.status === "connecting"
        ? call.group
          ? tr("Joining…")
          : tr("Connecting…")
        : call.status === "active"
          ? call.group
            ? inCall
              ? tr("{t} · {n} in the call", { t: clockOf(elapsed), n: inCall + 1 })
              : tr("{t} · waiting for others", { t: clockOf(elapsed) })
            : clockOf(elapsed)
          : call.endedAs === "missed"
            ? call.group
              ? tr("Nobody joined")
              : call.role === "caller"
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
          <p className="text-lg font-semibold">{headline}</p>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-fg-muted"><PhoneIncoming size={14} className="animate-pulse text-emerald-500" /> {status}</p>
          {call.group && peers.length ? <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-fg-faint"><Users size={11} /> {tr("{n} already in the call", { n: peers.length })}</p> : null}
          <div className="mt-6 flex justify-center gap-4">
            <button type="button" onClick={onDecline} className="chat-call-btn grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 focus-ring" aria-label={call.group ? tr("Ignore") : tr("Decline")}>
              <PhoneOff size={22} />
            </button>
            <button type="button" onClick={onAccept} className="chat-call-btn grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 focus-ring chat-call-accept" aria-label={call.group ? tr("Join") : tr("Accept")}>
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
    // a small draggable pill: the call goes on (audio keeps playing through hidden video elements) while the app is used
    return createPortal(
      <div className="chat-call-mini fixed z-[80] flex select-none items-center gap-2 rounded-full bg-neutral-950/95 py-1.5 pl-1.5 pr-2 text-white shadow-app-lg ring-1 ring-white/15 backdrop-blur" style={placed ?? { top: 12, right: 12 }} role="dialog" aria-label={status}>
        <div className="absolute h-px w-px overflow-hidden opacity-0">
          {peers.map((p) => <PeerTile key={p.id} peer={p} stream={remoteStreams[p.id]} />)}
        </div>
        <button type="button" onPointerDown={startDrag} className="chat-call-drag grid h-8 w-6 cursor-grab place-items-center text-white/50 touch-none" aria-label={tr("Move")}>
          <GripHorizontal size={14} />
        </button>
        <button type="button" onClick={() => setMini(false)} className="flex min-w-0 items-center gap-2 rounded-full focus-ring" aria-label={tr("Expand")}>
          {call.group ? <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15"><Users size={13} /></span> : <Avatar name={peer.name} color={peer.avatar_color} avatar={peer.avatar ?? "initials"} size="xs" />}
          <span className="min-w-0 text-left leading-tight">
            <span className="block max-w-32 truncate text-xs font-semibold">{headline}</span>
            <span className="chat-call-status block text-[11px] text-white/70">{status}</span>
          </span>
          <Maximize2 size={14} className="shrink-0 text-white/60" />
        </button>
        <button type="button" onClick={onToggleMute} disabled={call.status === "ended"} className={cn("grid h-8 w-8 place-items-center rounded-full focus-ring", call.muted ? "bg-white text-neutral-900" : "bg-white/15 hover:bg-white/25")} aria-label={call.muted ? tr("Unmute") : tr("Mute")} aria-pressed={call.muted}>
          {call.muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button type="button" onClick={onHangUp} disabled={call.status === "ended"} className="chat-call-hangup grid h-8 w-8 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-600 focus-ring disabled:opacity-50" aria-label={call.group ? tr("Leave call") : tr("Hang up")}>
          <PhoneOff size={14} />
        </button>
      </div>,
      document.body
    );
  }
  const grid = peers.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : peers.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";
  return createPortal(
    <div className={cn("chat-call fixed z-[80] flex flex-col overflow-hidden bg-neutral-950 text-white shadow-app-lg", "inset-0 md:inset-auto md:bottom-4 md:right-4 md:rounded-app md:border md:border-white/10", peers.length > 1 ? "md:h-[36rem] md:w-[40rem]" : "md:h-[32rem] md:w-[24rem]")} style={placed && window.matchMedia("(min-width: 768px)").matches ? placed : undefined} role="dialog" aria-label={status}>
      {peers.length <= 1 ? (
        <PeerTile peer={peers[0] ?? peer} stream={peers[0] ? remoteStreams[peers[0].id] : null} big />
      ) : (
        <div className={cn("chat-call-grid absolute inset-0 grid gap-1 p-1 pb-24 pt-16", grid)}>
          {peers.map((p) => <PeerTile key={p.id} peer={p} stream={remoteStreams[p.id]} />)}
        </div>
      )}
      <div className="relative flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="chat-call-drag min-w-0 flex-1 md:cursor-grab md:touch-none" onPointerDown={(e) => window.matchMedia("(min-width: 768px)").matches && startDrag(e)}>
          <p className="truncate text-base font-semibold drop-shadow">{headline}</p>
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
        <button type="button" onClick={onHangUp} disabled={call.status === "ended"} className="chat-call-btn chat-call-hangup grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 focus-ring disabled:opacity-50" aria-label={call.group ? tr("Leave call") : tr("Hang up")}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>,
    document.body
  );
}
