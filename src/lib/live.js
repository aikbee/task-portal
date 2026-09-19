/**
 * Live events: one in-process bus per user (a single pm2 process serves the app). Chat, calls and the bell publish
 * here; the event streams (/api/chat/stream, /api/notifications/stream) listen. Kept apart from chat.js so that
 * notifications.js can publish without importing chat (which imports notifications).
 */
const bus = globalThis.__chatBus ?? (globalThis.__chatBus = new Map());

/** Receive this user's events until the returned function is called. No presence: see subscribe() in chat.js for that. */
export function listen(userId, fn) {
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) bus.delete(userId);
  };
}

export function publish(userId, event) {
  const set = bus.get(userId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {}
  }
}
