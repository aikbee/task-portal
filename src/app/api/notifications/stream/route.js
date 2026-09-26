import { handler } from "@/lib/api-utils";
import { listen } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events with only the bell: a "notification" event for every notification created for the signed-in
 * user, and "app_release" when a new build of the native app is published. For accounts without Chat (whose /api/chat/stream is refused); it does not count as being online.
 */
export const GET = handler(async (request, _params, user) => {
  const enc = new TextEncoder();
  let stop = null;
  let ping = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event, data) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      send("hello", { ok: true });
      stop = listen(user.id, (ev) => (ev.type === "notification" || ev.type === "app_release") && send(ev.type, ev));
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {}
      }, 25000);
      const end = () => {
        clearInterval(ping);
        stop?.();
        try {
          controller.close();
        } catch {}
      };
      request.signal?.addEventListener("abort", end);
    },
    cancel() {
      clearInterval(ping);
      stop?.();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", connection: "keep-alive" },
  });
});
