import { api } from "./api";

const b64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe this browser and register the subscription on the server. */
export async function enablePush() {
  const { publicKey } = await api.get("/api/push/key");
  if (!publicKey) throw new Error("Push notifications are not configured on the server.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was not granted.");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await api.post("/api/push/subscribe", sub.toJSON());
  return sub;
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/* ---------- call banners ---------- */
const registration = async () => (typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration().catch(() => null) : null);

/** Take the "is calling you" banner(s) away: one call's, or every ringing one when no id is given. Missed-call banners stay. */
export async function closeCallBanners(callId = null) {
  try {
    const reg = await registration();
    const list = (await reg?.getNotifications?.()) ?? [];
    for (const n of list) if (n.data?.ring && (callId == null || n.data.call_id === callId)) n.close();
  } catch {}
}

/** A ring while this tab is hidden (a background tab may not play the ring tone): the same banner the push would show. */
export async function showRingBanner({ callId, conversationId, group, title, body }) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await registration();
    const options = { body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: `call-${callId}`, requireInteraction: true, renotify: true, data: { href: `/chat?c=${conversationId}&call=${callId}`, ring: true, call_id: callId, group: Boolean(group) } };
    if (reg?.showNotification) await reg.showNotification(title, { ...options, actions: group ? [{ action: "answer", title: "Join" }, { action: "decline", title: "Dismiss" }] : [{ action: "answer", title: "Answer" }, { action: "decline", title: "Decline" }] });
    else new Notification(title, options);
  } catch {}
}
