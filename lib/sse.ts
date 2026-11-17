import 'server-only';

/**
 * Server-sent event streams that poll the database.
 *
 * Vercel ends a function after `maxDuration` (300 s), and the stream then
 * logs a timeout error. Instead, each stream closes itself cleanly a little
 * before that, and the browser's EventSource reconnects on its own (after the
 * `retry` delay below). Clients pass what they last saw, so nothing is missed
 * across the reconnect.
 */

/** Use as `export const maxDuration = SSE_MAX_DURATION` in each stream route. */
export const SSE_MAX_DURATION = 300;
/** Close well before maxDuration, so a slow last poll still fits. */
const LIFETIME_MS = 240_000;
const RETRY_MS = 1_000;

export type SseSend = {
  /** Send a `data:` event, optionally with an `id:` the browser sends back as Last-Event-ID. */
  event: (data: unknown, id?: string) => void;
};

export function pollingStream({
  intervalMs,
  label,
  onOpen,
  onTick,
}: {
  intervalMs: number;
  label: string;
  onOpen?: (send: SseSend) => Promise<void>;
  onTick: (send: SseSend) => Promise<void>;
}): Response {
  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let lifetimeId: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    closed = true;
    clearInterval(intervalId);
    clearTimeout(lifetimeId);
  };

  const stream = new ReadableStream<string>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // The client went away between the check and the write.
          stop();
        }
      };
      const send: SseSend = {
        event: (data, id) => write(`${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`),
      };

      write(`retry: ${RETRY_MS}\n: open\n\n`);

      // Ticks never overlap: a slow query doesn't pile up behind itself.
      let busy = false;
      const run = async (fn: (send: SseSend) => Promise<void>) => {
        if (closed || busy) return;
        busy = true;
        try {
          await fn(send);
          write(': keepalive\n\n');
        } catch (err) {
          if (!closed) console.error(`[SSE ${label}] poll error:`, err);
        } finally {
          busy = false;
        }
      };

      if (onOpen) void run(onOpen);
      intervalId = setInterval(() => void run(onTick), intervalMs);
      lifetimeId = setTimeout(() => {
        stop();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }, LIFETIME_MS);
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
