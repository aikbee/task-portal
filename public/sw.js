/* Task Portal service worker.
 * Deliberately conservative: never caches API responses or pages. It only
 *  - serves an offline page when a navigation fails,
 *  - caches immutable static assets (/_next/static, icons) cache-first, and
 *  - shows Web Push notifications and opens the linked page on tap.
 */
const VERSION = "v3";
const CACHE = `task-portal-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg";
  if (!immutable) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })()
  );
});

/* ---- Web Push ---- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Task Portal";
  const base = { body: data.body || "", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: data.tag || undefined, data: { href: data.href || "/notifications" } };
  // An incoming call: stays on screen, buzzes like a ring, and can be answered or declined from the banner
  // (platforms without action buttons, like iOS, open the app on tap and the app shows the call).
  const options = data.ring
    ? {
        ...base,
        requireInteraction: true,
        renotify: true,
        vibrate: [500, 250, 500, 250, 500, 250, 900, 400, 500, 250, 500, 250, 900],
        timestamp: Date.now(),
        actions: data.group ? [{ action: "answer", title: "Join" }, { action: "decline", title: "Dismiss" }] : [{ action: "answer", title: "Answer" }, { action: "decline", title: "Decline" }],
        data: { href: data.href || "/chat", ring: true, call_id: data.call_id, group: Boolean(data.group) },
      }
    : data.missed
      ? { ...base, renotify: true, data: { ...base.data, call_id: data.call_id } } // replaces the ringing banner (same tag)
      : base;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  // "Decline" on a call banner answers the server and never opens the app
  if (info.ring && event.action === "decline") {
    event.waitUntil(fetch(`/api/chat/calls/${info.call_id}/decline`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}));
    return;
  }
  const target = new URL(info.href || "/", self.location.origin);
  if (info.ring && event.action === "answer") target.searchParams.set("answer", "1");
  const url = target.href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = wins.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
