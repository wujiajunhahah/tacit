// The connections to model hosts, on a laptop: it sleeps, and the network under it changes (another Wi-Fi, a proxy
// restarted). A pooled connection can die while still looking open, and a request sent on it waits out its whole
// timeout; Bun drops that connection only then, so a pool of dead ones costs one timeout each. After a sleep, or a
// request that timed out, requests go out on fresh connections for a while, and the pool is drained: a few bare HEAD
// requests at once take every pooled connection, the dead ones time out and are dropped, the new ones stay.

export interface NetworkOptions {
  /** How long requests use fresh connections after a sleep or a timeout. */
  freshMs?: number;
  /** HEAD requests per host, at once, to take every pooled connection. */
  drain?: number;
  drainMs?: number;
  /** The heartbeat that notices a sleep: a beat that comes far later than asked means the machine was asleep. */
  tickMs?: number;
  fetch?: typeof fetch;
}

export interface ModelNetwork {
  fetch: typeof fetch;
  /** Treat the pool as stale now: what a sleep or a timeout does. */
  refresh(): void;
  stop(): void;
}

const FRESH_MS = 60_000;
const DRAIN = 6;
const DRAIN_MS = 4000;
const TICK_MS = 10_000;

export function modelNetwork(origins: () => string[], opts: NetworkOptions = {}): ModelNetwork {
  const base = opts.fetch ?? fetch;
  const freshMs = opts.freshMs ?? FRESH_MS;
  const tickMs = opts.tickMs ?? TICK_MS;
  let freshUntil = 0;
  let last = Date.now();

  const refresh = () => {
    freshUntil = Date.now() + freshMs;
    for (const origin of origins()) {
      for (let i = 0; i < (opts.drain ?? DRAIN); i++) {
        void base(origin, { method: 'HEAD', signal: AbortSignal.timeout(opts.drainMs ?? DRAIN_MS) }).catch(() => undefined);
      }
    }
  };

  const timer = setInterval(() => {
    const now = Date.now();
    if (now - last > 3 * tickMs) refresh();
    last = now;
  }, tickMs);
  timer.unref?.();

  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const fresh = Date.now() < freshUntil;
    try {
      // Bun opens a new connection for a request that asks not to keep one.
      return await base(input, fresh ? { ...init, keepalive: false } : init);
    } catch (err) {
      if (!fresh && err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError' || err.name === 'TypeError')) refresh();
      throw err;
    }
  }) as typeof fetch;

  return { fetch: wrapped, refresh, stop: () => clearInterval(timer) };
}
