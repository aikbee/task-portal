import { handler } from "@/lib/api-utils";
import { subscribe } from "@/lib/chat";
import "@/lib/calls"; // registers the "hang up when a browser goes away" hook

export const dynamic = "force-dynamic";

/** Server-Sent Events: "message", "read" and "friends" events for the signed-in user, with a keep-alive ping. */
export const GET = handler(async (request, _params, user) => {
  const enc = new TextEncoder();
  let unsubscribe = null;
  let ping = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event, data) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      send("hello", { ok: true });
      unsubscribe = subscribe(user.id, (ev) => send(ev.type, ev));
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {}
      }, 25000);
      const stop = () => {
        clearInterval(ping);
        unsubscribe?.();
        try {
          controller.close();
        } catch {}
      };
      request.signal?.addEventListener("abort", stop);
    },
    cancel() {
      clearInterval(ping);
      unsubscribe?.();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", connection: "keep-alive" },
  });
});
