import { describe, expect, test } from 'bun:test';
import { modelNetwork } from '../../daemon/network';

describe('connections to model hosts', () => {
  test('a timeout puts requests on fresh connections for a while, and drains the pool', async () => {
    const calls: { url: string; init?: RequestInit & { keepalive?: boolean } }[] = [];
    let fail = false;
    const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (fail && init?.method !== 'HEAD') throw Object.assign(new Error('timed out'), { name: 'AbortError' });
      return new Response('ok');
    }) as typeof fetch;
    const net = modelNetwork(() => ['https://openrouter.ai'], { fetch: base, freshMs: 80, drain: 3 });
    try {
      await net.fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST' });
      expect(calls[0]!.init?.keepalive).toBeUndefined();

      fail = true;
      await expect(net.fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST' })).rejects.toThrow('timed out');
      expect(calls.filter((c) => c.init?.method === 'HEAD').map((c) => c.url)).toEqual(Array(3).fill('https://openrouter.ai'));

      fail = false;
      calls.length = 0;
      await net.fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST' });
      expect(calls[0]!.init?.keepalive).toBe(false);

      await Bun.sleep(120);
      calls.length = 0;
      await net.fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST' });
      expect(calls[0]!.init?.keepalive).toBeUndefined();
    } finally {
      net.stop();
    }
  });

  test('after one wait on a dead pooled connection, the next request does not wait on another', async () => {
    // A server that, from a moment on, never answers on a connection opened before it: a path that died in a sleep.
    let deadBefore = 0;
    const born = new WeakMap<object, number>();
    const server = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(s) {
          born.set(s, performance.now());
        },
        data(s, d) {
          if ((born.get(s) ?? 0) < deadBefore || !Buffer.from(d).toString('latin1').includes('\r\n\r\n')) return;
          // A moment to answer, so three requests at once open three connections.
          setTimeout(() => s.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\nok'), 30);
        },
      },
    });
    const origin = `http://127.0.0.1:${server.port}`;
    const net = modelNetwork(() => [origin], { drain: 0 });
    const call = () => net.fetch(`${origin}/v1/systemone`, { signal: AbortSignal.timeout(300) }).then((r) => r.text());
    try {
      // Three pooled connections, then all of them die. Plain fetch would wait 300 ms on each in turn.
      expect(await Promise.all([call(), call(), call()])).toEqual(['ok', 'ok', 'ok']);
      deadBefore = performance.now();
      await expect(call()).rejects.toThrow();
      const t0 = performance.now();
      expect(await call()).toBe('ok');
      expect(performance.now() - t0).toBeLessThan(200);
      expect(await call()).toBe('ok');
    } finally {
      net.stop();
      server.stop(true);
    }
  });
});
