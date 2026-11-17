import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollingStream } from '@/lib/sse';

async function readAll(res: Response) {
  const reader = res.body!.getReader();
  const chunks: string[] = [];
  return {
    chunks,
    async pump(n: number) {
      for (let i = 0; i < n; i++) {
        const { value, done } = await reader.read();
        if (done) return true;
        chunks.push(value as unknown as string);
      }
      return false;
    },
    cancel: () => reader.cancel(),
  };
}

describe('pollingStream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens with a retry hint, runs onOpen, then ticks with ids', async () => {
    let n = 0;
    const res = pollingStream({
      intervalMs: 1000,
      label: 't',
      onOpen: async (send) => send.event({ type: 'snapshot' }, 'a'),
      onTick: async (send) => send.event({ type: 'tick', n: ++n }, `s${n}`),
    });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const r = await readAll(res);
    await r.pump(3);
    expect(r.chunks[0]).toMatch(/^retry: \d+\n/);
    expect(r.chunks[1]).toBe('id: a\ndata: {"type":"snapshot"}\n\n');
    expect(r.chunks[2]).toBe(': keepalive\n\n');
    await vi.advanceTimersByTimeAsync(1000);
    await r.pump(1);
    expect(r.chunks[3]).toBe('id: s1\ndata: {"type":"tick","n":1}\n\n');
    await r.cancel();
  });

  it('closes itself before the platform limit, and stops polling', async () => {
    const onTick = vi.fn(async () => {});
    const res = pollingStream({ intervalMs: 5000, label: 't', onTick });
    const r = await readAll(res);
    await vi.advanceTimersByTimeAsync(240_000);
    const calls = onTick.mock.calls.length;
    expect(await r.pump(100)).toBe(true); // the stream ended
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTick.mock.calls.length).toBe(calls);
  });

  it('stops polling when the client goes away and never throws on a late write', async () => {
    let release!: () => void;
    const onTick = vi.fn(
      (send: { event: (d: unknown) => void }) =>
        new Promise<void>((resolve) => {
          release = () => {
            send.event({ late: true });
            resolve();
          };
        }),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = pollingStream({ intervalMs: 1000, label: 't', onTick });
    const r = await readAll(res);
    await vi.advanceTimersByTimeAsync(1000);
    await r.cancel();
    release(); // the in-flight poll finishes after the client left
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not overlap slow polls', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const res = pollingStream({
      intervalMs: 1000,
      label: 't',
      onTick: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 3500));
        inFlight--;
      },
    });
    const r = await readAll(res);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(maxInFlight).toBe(1);
    await r.cancel();
  });
});
